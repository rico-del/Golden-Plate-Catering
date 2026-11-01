variable "aws_region" { type = string }
variable "availability_zone" { type = string }
variable "vpc_cidr" {
  type    = string
  default = "10.90.0.0/16"
}

variable "public_subnet_cidr" {
  type    = string
  default = "10.90.1.0/24"
}

variable "instance_type" {
  type    = string
  default = "t3.micro"
}

variable "deployment_bucket_name" { type = string }
variable "deployment_archive_path" {
  description = "Optional path to the deployment tarball; defaults to the standard dist artifact path."
  type        = string
  default     = null
}

variable "atlas_org_id" {
  type      = string
  sensitive = true
}

variable "atlas_region_name" {
  type    = string
  default = "EU_WEST_1"
}

variable "atlas_database_username" {
  type      = string
  sensitive = true
}

variable "atlas_database_password" {
  type      = string
  sensitive = true
}

variable "admin_username" {
  type      = string
  sensitive = true
}

variable "admin_password" {
  type      = string
  sensitive = true
}
variable "certbot_email" { type = string }

variable "monitoring_security_group_id" {
  description = "Optional security group for an approved private monitoring host in the production VPC. When set, allow that group to scrape production Node Exporter on TCP 9100."
  type        = string
  default     = null
}

variable "monitoring_instance_id" {
  description = "Optional SSM-managed monitoring EC2 instance ID for an advisory post-deployment Prometheus scrape check."
  type        = string
  default     = null
  validation {
    condition     = var.monitoring_instance_id == null || can(regex("^i-[a-f0-9]{17}$", var.monitoring_instance_id))
    error_message = "monitoring_instance_id must be an EC2 instance ID or null."
  }
}

variable "enable_serverless" {
  description = "Explicit opt-in for the parallel CloudFront, S3, API Gateway, Lambda, Cognito, DynamoDB, SNS and CloudWatch stack. Keep false until costs and migration are approved."
  type        = bool
  default     = false
}

variable "serverless_site_bucket_name" {
  description = "Globally unique private S3 bucket name for the serverless static site. Required only when enable_serverless is true."
  type        = string
  default     = ""
  validation {
    condition     = !var.enable_serverless || (length(var.serverless_site_bucket_name) >= 3 && length(var.serverless_site_bucket_name) <= 63)
    error_message = "Set a valid globally unique serverless_site_bucket_name when enable_serverless is true."
  }
}

variable "cognito_domain_prefix" {
  description = "Globally unique Cognito hosted UI domain prefix in the selected region. Required only when enable_serverless is true."
  type        = string
  default     = ""
  validation {
    condition     = !var.enable_serverless || can(regex("^[a-z0-9-]{1,63}$", var.cognito_domain_prefix))
    error_message = "Set a valid Cognito domain prefix when enable_serverless is true."
  }
}

variable "enquiry_notification_email" {
  description = "Approved client email for SNS enquiry notifications. The subscription requires confirmation."
  type        = string
  default     = ""
}

variable "serverless_alert_email" {
  description = "Approved operator email for CloudWatch alarm notifications; SNS will require subscription confirmation."
  type        = string
  default     = ""
  validation {
    condition     = !var.enable_serverless || can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.serverless_alert_email))
    error_message = "Set a valid serverless_alert_email when enable_serverless is true."
  }
}

variable "serverless_lambda_package_path" {
  description = "Path to the prebuilt serverless Lambda zip. Build with npm run package:serverless before a reviewed Terraform plan."
  type        = string
  default     = "../dist/serverless-lambda.zip"
}

variable "serverless_site_base_url" {
  description = "Public base URL for the optional serverless site. Use a placeholder until the CloudFront distribution is created and then update it."
  type        = string
  default     = "https://example.com"
}

variable "serverless_reserved_concurrency" {
  description = "Reserved concurrency per Lambda, used to bound concurrent spend and downstream load."
  type        = number
  default     = 2
  validation {
    condition     = var.serverless_reserved_concurrency >= 1 && var.serverless_reserved_concurrency <= 10
    error_message = "Set serverless_reserved_concurrency between 1 and 10 after checking the account quota."
  }
}

variable "enable_serverless_budget_alert" {
  description = "Opt in to a monthly AWS Budget notification after confirming budget quota and destination."
  type        = bool
  default     = false
}

variable "serverless_budget_limit_usd" {
  description = "Monthly serverless stack budget threshold, used only when the optional budget alert is enabled."
  type        = number
  default     = 5
  validation {
    condition     = var.serverless_budget_limit_usd > 0
    error_message = "The serverless budget threshold must be greater than zero."
  }
}

variable "serverless_budget_email" {
  description = "Email for the optional monthly AWS Budget alert."
  type        = string
  default     = ""
  validation {
    condition     = !var.enable_serverless_budget_alert || can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.serverless_budget_email))
    error_message = "Set a valid serverless_budget_email when the budget alert is enabled."
  }
}
