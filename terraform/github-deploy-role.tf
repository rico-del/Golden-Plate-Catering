data "aws_caller_identity" "current" {}

resource "aws_iam_role" "github_deploy" {
  name = "golden-plate-catering-github-deploy"
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
          "token.actions.githubusercontent.com:sub" = "repo:rico-del/Golden-Plate-Catering:environment:production"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_deploy" {
  name = "golden-plate-catering-github-deploy"
  role = aws_iam_role.github_deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "${aws_s3_bucket.deployments.arn}/releases/production/*"
      },
      {
        Effect = "Allow"
        Action = ["ssm:SendCommand"]
        Resource = concat([
          "arn:aws:ssm:${var.aws_region}::document/AWS-RunShellScript",
          "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/${aws_instance.site.id}"
        ], var.monitoring_instance_id == null ? [] : ["arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/${var.monitoring_instance_id}"])
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetCommandInvocation"]
        Resource = "*"
      }
    ]
  })
}

output "github_deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}

resource "aws_vpc_security_group_ingress_rule" "monitoring_node_exporter" {
  count                        = var.monitoring_security_group_id == null ? 0 : 1
  security_group_id            = aws_security_group.site.id
  referenced_security_group_id = var.monitoring_security_group_id
  from_port                    = 9100
  to_port                      = 9100
  ip_protocol                  = "tcp"
  description                  = "Node Exporter scrape access from approved Golden Plate monitoring host only."
}