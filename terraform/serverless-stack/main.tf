data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

locals {
  serverless_function_names = {
    reviews_read   = "golden-plate-reviews-read"
    review_submit  = "golden-plate-review-submit"
    enquiry_submit = "golden-plate-enquiry-submit"
    admin          = "golden-plate-admin"
  }
  serverless_handler_names = {
    reviews_read   = "reviewsRead"
    review_submit  = "reviewSubmit"
    enquiry_submit = "enquirySubmit"
    admin          = "admin"
  }
  cognito_domain             = "${var.cognito_domain_prefix}.auth.${var.aws_region}.amazoncognito.com"
  cognito_issuer             = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.serverless[0].id}"
  serverless_lambda_artifact = abspath(var.lambda_package_path)
  serverless_csp             = "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; media-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://${local.cognito_domain}; object-src 'none';"
  lambda_function_iam_statements = {
    reviews_read = [{
      Effect   = "Allow"
      Action   = ["dynamodb:Query"]
      Resource = ["${aws_dynamodb_table.serverless[0].arn}/index/GSI1"]
    }]
    review_submit = [{
      Effect   = "Allow"
      Action   = ["dynamodb:PutItem"]
      Resource = [aws_dynamodb_table.serverless[0].arn]
    }]
    enquiry_submit = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem"]
        Resource = [aws_dynamodb_table.serverless[0].arn]
      },
      {
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = [aws_sns_topic.enquiries[0].arn]
      }
    ]
    admin = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:Query"]
        Resource = ["${aws_dynamodb_table.serverless[0].arn}/index/GSI2"]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:UpdateItem", "dynamodb:DeleteItem"]
        Resource = [aws_dynamodb_table.serverless[0].arn]
      }
    ]
  }
}

resource "aws_s3_bucket" "serverless_site" {
  count         = 1
  bucket        = var.serverless_site_bucket_name
  force_destroy = false
  lifecycle {
    prevent_destroy = true
  }
}

# Explicit untaint helper: after a partial apply failure taints the bucket
# (e.g. a tagging permission error after successful creation), run
#   terraform untaint aws_s3_bucket.serverless_site[0]
# instead of letting Terraform destroy and recreate the bucket.

resource "aws_s3_bucket_public_access_block" "serverless_site" {
  count                   = 1
  bucket                  = aws_s3_bucket.serverless_site[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "serverless_site" {
  count  = 1
  bucket = aws_s3_bucket.serverless_site[0].id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "serverless_site" {
  count  = 1
  bucket = aws_s3_bucket.serverless_site[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.serverless.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_kms_key" "serverless" {
  description             = "Golden Plate v2 serverless data and static asset encryption key."
  enable_key_rotation     = true
  deletion_window_in_days = 30

  # Allow CloudWatch Logs and the AWS account root (via the deploy role) to use
  # the key; without the logs principal the KMS-encrypted log groups cannot be
  # created.
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnableIAMUserPermissions"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "AllowCloudWatchLogsUse"
        Effect    = "Allow"
        Principal = { Service = "logs.${var.aws_region}.amazonaws.com" }
        Action    = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"]
        Resource  = "*"
        Condition = {
          ArnEquals = { "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:*" }
        }
      }
    ]
  })
}

resource "aws_kms_alias" "serverless" {
  name          = "alias/golden-plate-serverless"
  target_key_id = aws_kms_key.serverless.key_id
}

resource "aws_s3_bucket_versioning" "serverless_site" {
  count  = 1
  bucket = aws_s3_bucket.serverless_site[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_cloudfront_origin_access_control" "serverless_site" {
  count                             = 1
  name                              = "golden-plate-site-oac"
  description                       = "CloudFront access to the private Golden Plate site bucket."
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_function" "serverless_spa" {
  count   = 1
  name    = "golden-plate-spa-routes"
  runtime = "cloudfront-js-2.0"
  publish = true
  comment = "Route extensionless site paths to the private S3 index document."
  code    = <<-JS
    function handler(event) {
      var request = event.request;
      if (request.uri.indexOf('/api/') === 0) return request;
      if (request.uri === '/' || request.uri.endsWith('/') || !request.uri.split('/').pop().includes('.')) {
        request.uri = '/index.html';
      }
      return request;
    }
  JS
}

resource "aws_cloudfront_response_headers_policy" "serverless_security" {
  count = 1
  name  = "golden-plate-security-headers"
  security_headers_config {
    content_type_options { override = true }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    content_security_policy {
      content_security_policy = local.serverless_csp
      override                = true
    }
  }
}

resource "aws_dynamodb_table" "serverless" {
  count                       = 1
  name                        = "golden-plate-serverless"
  billing_mode                = "PAY_PER_REQUEST"
  deletion_protection_enabled = true
  hash_key                    = "PK"
  range_key                   = "SK"
  attribute {
    name = "PK"
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }
  attribute {
    name = "GSI1PK"
    type = "S"
  }
  attribute {
    name = "GSI1SK"
    type = "S"
  }
  attribute {
    name = "GSI2PK"
    type = "S"
  }
  attribute {
    name = "GSI2SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }
  global_secondary_index {
    name            = "GSI2"
    hash_key        = "GSI2PK"
    range_key       = "GSI2SK"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.serverless.arn
  }
}

resource "aws_sns_topic" "enquiries" {
  count             = 1
  name              = "golden-plate-enquiries"
  kms_master_key_id = aws_kms_key.serverless.arn
}

resource "aws_sns_topic_subscription" "enquiry_email" {
  count     = var.enquiry_notification_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.enquiries[0].arn
  protocol  = "email"
  endpoint  = var.enquiry_notification_email
}

resource "aws_cognito_user_pool" "serverless" {
  count                    = 1
  name                     = "golden-plate-owner"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "ON"

  software_token_mfa_configuration {
    enabled = true
  }
  admin_create_user_config {
    allow_admin_create_user_only = true
  }
  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 3
  }
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }
  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }
}

resource "aws_cognito_user_pool_domain" "serverless" {
  count        = 1
  domain       = var.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.serverless[0].id
}

resource "aws_cognito_user_pool_client" "serverless" {
  count                                = 1
  name                                 = "golden-plate-web-owner"
  user_pool_id                         = aws_cognito_user_pool.serverless[0].id
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = ["${var.serverless_site_base_url}/admin/callback/"]
  logout_urls                          = ["${var.serverless_site_base_url}/admin/"]
  access_token_validity                = 15
  id_token_validity                    = 15
  refresh_token_validity               = 1
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
  enable_token_revocation       = true
  prevent_user_existence_errors = "ENABLED"
}

resource "aws_sns_topic" "serverless_alerts" {
  count             = 1
  name              = "golden-plate-serverless-alerts"
  kms_master_key_id = aws_kms_key.serverless.arn
}

resource "aws_sns_topic_subscription" "serverless_alert_email" {
  count     = var.serverless_alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.serverless_alerts[0].arn
  protocol  = "email"
  endpoint  = var.serverless_alert_email
}

resource "aws_cloudwatch_log_group" "lambda" {
  for_each          = local.serverless_function_names
  name              = "/aws/lambda/${each.value}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.serverless.arn
}

resource "aws_iam_role" "lambda" {
  for_each = local.serverless_function_names
  name     = "${each.value}-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "lambda_logs" {
  for_each = local.serverless_function_names
  name     = "${each.value}-logs"
  role     = aws_iam_role.lambda[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = ["${aws_cloudwatch_log_group.lambda[each.key].arn}:*"]
    }]
  })
}

resource "aws_iam_role_policy" "lambda_data" {
  for_each = local.serverless_function_names
  name     = "${each.value}-data"
  role     = aws_iam_role.lambda[each.key].id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = local.lambda_function_iam_statements[each.key]
  })
}

resource "aws_lambda_function" "serverless" {
  for_each                       = local.serverless_function_names
  function_name                  = each.value
  role                           = aws_iam_role.lambda[each.key].arn
  runtime                        = "nodejs22.x"
  handler                        = "src/handlers.${local.serverless_handler_names[each.key]}"
  filename                       = local.serverless_lambda_artifact
  source_code_hash               = filebase64sha256(local.serverless_lambda_artifact)
  timeout                        = 10
  memory_size                    = 256
  reserved_concurrent_executions = var.serverless_reserved_concurrency

  environment {
    variables = {
      TABLE_NAME        = aws_dynamodb_table.serverless[0].name
      ENQUIRY_TOPIC_ARN = each.key == "enquiry_submit" ? aws_sns_topic.enquiries[0].arn : ""
      APP_VERSION       = var.application_version
      NODE_ENV          = "production"
      SITE_URL          = var.serverless_site_base_url
      CONTACT_EMAIL     = var.contact_email
      CONTACT_PHONE     = var.contact_phone
      WHATSAPP_NUMBER   = var.whatsapp_number
      FACEBOOK_URL      = var.facebook_url
      INSTAGRAM_URL     = var.instagram_url
      TIKTOK_URL        = var.tiktok_url
    }
  }
  depends_on = [aws_cloudwatch_log_group.lambda]
}

resource "aws_apigatewayv2_api" "serverless" {
  count         = 1
  name          = "golden-plate-http-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_authorizer" "owner" {
  count            = 1
  api_id           = aws_apigatewayv2_api.serverless[0].id
  name             = "golden-plate-cognito-owner"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  jwt_configuration {
    audience = [aws_cognito_user_pool_client.serverless[0].id]
    issuer   = local.cognito_issuer
  }
}

resource "aws_apigatewayv2_integration" "serverless" {
  for_each               = local.serverless_function_names
  api_id                 = aws_apigatewayv2_api.serverless[0].id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.serverless[each.key].invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 10000
}

locals {
  serverless_routes = {
    "GET /api/health"         = { function = "reviews_read", owner = false }
    "GET /api/config"         = { function = "reviews_read", owner = false }
    "GET /api/reviews"        = { function = "reviews_read", owner = false }
    "POST /api/reviews"       = { function = "review_submit", owner = false }
    "POST /api/enquiries"     = { function = "enquiry_submit", owner = false }
    "ANY /api/admin/{proxy+}" = { function = "admin", owner = true }
  }
}

resource "aws_apigatewayv2_route" "serverless" {
  for_each             = local.serverless_routes
  api_id               = aws_apigatewayv2_api.serverless[0].id
  route_key            = each.key
  target               = "integrations/${aws_apigatewayv2_integration.serverless[each.value.function].id}"
  authorization_type   = each.value.owner ? "JWT" : "NONE"
  authorizer_id        = each.value.owner ? aws_apigatewayv2_authorizer.owner[0].id : null
  authorization_scopes = each.value.owner ? ["openid"] : []
}

resource "aws_lambda_permission" "serverless_api" {
  for_each      = local.serverless_function_names
  statement_id  = "AllowHttpApiInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.serverless[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.serverless[0].execution_arn}/*/*/*"
}

resource "aws_cloudwatch_log_group" "api" {
  count             = 1
  name              = "/aws/apigateway/golden-plate-http-api"
  retention_in_days = 14
  kms_key_id        = aws_kms_key.serverless.arn
}

resource "aws_apigatewayv2_stage" "serverless" {
  count       = 1
  api_id      = aws_apigatewayv2_api.serverless[0].id
  name        = "$default"
  auto_deploy = true
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api[0].arn
    format = jsonencode({
      requestId        = "$context.requestId"
      requestTime      = "$context.requestTime"
      httpMethod       = "$context.httpMethod"
      routeKey         = "$context.routeKey"
      status           = "$context.status"
      responseLength   = "$context.responseLength"
      integrationError = "$context.integrationErrorMessage"
    })
  }
  default_route_settings {
    detailed_metrics_enabled = true
    throttling_burst_limit   = 10
    throttling_rate_limit    = 5
  }
  depends_on = [aws_apigatewayv2_route.serverless]
}

resource "aws_wafv2_web_acl" "serverless" {
  provider = aws.us_east_1
  name     = "golden-plate-serverless-edge"
  scope    = "CLOUDFRONT"
  default_action {
    allow {}
  }
  rule {
    name     = "AWSManagedCommonRuleSet"
    priority = 10
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "golden-plate-common-rules"
      sampled_requests_enabled   = true
    }
  }
  rule {
    name     = "AWSManagedKnownBadInputs"
    priority = 30
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "golden-plate-known-bad-inputs"
      sampled_requests_enabled   = true
    }
  }
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "golden-plate-serverless-edge"
    sampled_requests_enabled   = true
  }
}

resource "aws_cloudfront_distribution" "serverless" {
  count               = 1
  web_acl_id          = aws_wafv2_web_acl.serverless.arn
  enabled             = true
  comment             = "Golden Plate Catering serverless site"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  http_version        = "http2and3"
  is_ipv6_enabled     = true

  origin {
    domain_name              = aws_s3_bucket.serverless_site[0].bucket_regional_domain_name
    origin_id                = "golden-plate-private-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.serverless_site[0].id
    s3_origin_config {
      origin_access_identity = ""
    }
  }
  origin {
    domain_name = trimprefix(aws_apigatewayv2_api.serverless[0].api_endpoint, "https://")
    origin_id   = "golden-plate-http-api"
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id           = "golden-plate-private-s3"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    compress                   = true
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.serverless_security[0].id
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.serverless_spa[0].arn
    }
  }
  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = "golden-plate-http-api"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    origin_request_policy_id   = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.serverless_security[0].id
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }
  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1.2_2021"
  }
  depends_on = [aws_apigatewayv2_stage.serverless]
}

resource "aws_s3_bucket_policy" "serverless_site" {
  count  = 1
  bucket = aws_s3_bucket.serverless_site[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOACReadOnly"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = ["s3:GetObject"]
      Resource  = "${aws_s3_bucket.serverless_site[0].arn}/*"
      Condition = { StringEquals = { "AWS:SourceArn" = "arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${aws_cloudfront_distribution.serverless[0].id}" } }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.serverless_site]
}

resource "aws_s3_object" "serverless_auth_config" {
  count         = 1
  bucket        = aws_s3_bucket.serverless_site[0].id
  key           = "serverless-auth-config.js"
  content_type  = "application/javascript; charset=utf-8"
  cache_control = "no-store"
  content = templatefile("${path.module}/templates/serverless-auth-config.js.tftpl", {
    domain       = local.cognito_domain
    client_id    = aws_cognito_user_pool_client.serverless[0].id
    callback_uri = "${var.serverless_site_base_url}/admin/callback/"
    logout_uri   = "${var.serverless_site_base_url}/admin/"
  })
}

resource "aws_iam_role" "serverless_deploy" {
  count = 1
  name  = "golden-plate-serverless-github-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:rico-del@163041797/Golden-Plate-Catering@1435679351:environment:serverless-production"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "serverless_deploy" {
  count = 1
  name  = "golden-plate-serverless-github-deploy"
  role  = aws_iam_role.serverless_deploy[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [aws_s3_bucket.serverless_site[0].arn]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Resource = ["${aws_s3_bucket.serverless_site[0].arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:GenerateDataKey", "kms:Decrypt", "kms:DescribeKey"]
        Resource = [aws_kms_key.serverless.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation"]
        Resource = [aws_cloudfront_distribution.serverless[0].arn]
      },
      {
        Effect   = "Allow"
        Action   = ["lambda:UpdateFunctionCode", "lambda:PublishVersion", "lambda:GetFunction", "lambda:GetFunctionConfiguration"]
        Resource = [for function in aws_lambda_function.serverless : function.arn]
      }
    ]
  })
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each            = local.serverless_function_names
  alarm_name          = "${each.value}-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_description   = "At least one ${each.value} invocation failed in one minute."
  dimensions          = { FunctionName = aws_lambda_function.serverless[each.key].function_name }
  alarm_actions       = [aws_sns_topic.serverless_alerts[0].arn]
  ok_actions          = [aws_sns_topic.serverless_alerts[0].arn]
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  for_each            = local.serverless_function_names
  alarm_name          = "${each.value}-throttles"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_description   = "At least one ${each.value} invocation was throttled in one minute."
  dimensions          = { FunctionName = aws_lambda_function.serverless[each.key].function_name }
  alarm_actions       = [aws_sns_topic.serverless_alerts[0].arn]
  ok_actions          = [aws_sns_topic.serverless_alerts[0].arn]
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  count               = 1
  alarm_name          = "golden-plate-http-api-5xx"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "5xx"
  namespace           = "AWS/ApiGateway"
  period              = 60
  statistic           = "Sum"
  threshold           = 3
  treat_missing_data  = "notBreaching"
  alarm_description   = "Three or more HTTP API 5xx responses in two consecutive one-minute periods."
  dimensions = {
    ApiId = aws_apigatewayv2_api.serverless[0].id
    Stage = "$default"
  }
  alarm_actions = [aws_sns_topic.serverless_alerts[0].arn]
  ok_actions    = [aws_sns_topic.serverless_alerts[0].arn]
}

resource "aws_budgets_budget" "serverless" {
  count        = var.enable_serverless_budget_alert ? 1 : 0
  name         = "golden-plate-serverless-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.serverless_budget_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.serverless_budget_email]
  }
}

output "serverless_site_url" {
  value       = "https://${aws_cloudfront_distribution.serverless[0].domain_name}"
  description = "CloudFront default domain for the optional serverless site."
}

output "serverless_site_bucket_name" {
  value       = aws_s3_bucket.serverless_site[0].bucket
  description = "Private S3 bucket for the serverless frontend."
}

output "serverless_cloudfront_distribution_id" {
  value       = aws_cloudfront_distribution.serverless[0].id
  description = "CloudFront distribution ID for serverless releases."
}

output "serverless_deploy_role_arn" {
  value       = aws_iam_role.serverless_deploy[0].arn
  description = "Dedicated main-only GitHub OIDC deployment role for the serverless stack."
}

output "serverless_lambda_function_names" {
  value       = { for key, function in aws_lambda_function.serverless : key => function.function_name }
  description = "Serverless API Lambda function names."
}

output "serverless_cognito_user_pool_id" {
  value       = aws_cognito_user_pool.serverless[0].id
  description = "Owner-only Cognito user pool; create the owner user after approved deployment."
}

output "serverless_cognito_client_id" {
  value       = aws_cognito_user_pool_client.serverless[0].id
  description = "Public Cognito web client ID used by the SPA PKCE flow."
}

output "serverless_api_endpoint" {
  value       = aws_apigatewayv2_api.serverless[0].api_endpoint
  description = "Regional HTTP API endpoint. Public traffic should use the CloudFront path behavior."
}
