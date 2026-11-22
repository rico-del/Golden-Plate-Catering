variable "aws_region" {
  type = string
}

variable "enable_serverless" {
  type    = bool
  default = true
}

variable "availability_zone" {
  type = string
}

variable "serverless_site_bucket_name" {
  type = string
  validation {
    condition     = length(var.serverless_site_bucket_name) >= 3 && length(var.serverless_site_bucket_name) <= 63
    error_message = "Set a valid globally unique serverless site bucket name."
  }
}

variable "cognito_domain_prefix" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9-]{1,63}$", var.cognito_domain_prefix))
    error_message = "Use a globally unique lowercase Cognito prefix (letters, digits, hyphens)."
  }
}

variable "serverless_site_base_url" {
  type = string
  validation {
    condition     = can(regex("^https://[^/]+$", var.serverless_site_base_url)) && var.serverless_site_base_url != "https://example.com"
    error_message = "Set the approved HTTPS origin, without a path or placeholder hostname."
  }
}

variable "serverless_alert_email" {
  type = string
  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.serverless_alert_email))
    error_message = "Set a valid operator email for serverless alerts."
  }
}

variable "enquiry_notification_email" {
  type    = string
  default = ""
}

variable "enable_serverless_budget_alert" {
  type    = bool
  default = false
}

variable "serverless_budget_email" {
  type    = string
  default = ""
}

variable "serverless_budget_limit_usd" {
  type    = number
  default = 5
  validation {
    condition     = var.serverless_budget_limit_usd > 0
    error_message = "Budget limit must be positive."
  }
}

variable "serverless_reserved_concurrency" {
  type    = number
  default = -1
  validation {
    condition     = var.serverless_reserved_concurrency == -1 || (var.serverless_reserved_concurrency >= 1 && var.serverless_reserved_concurrency <= 10)
    error_message = "Reserved concurrency must be -1 (unreserved) or from 1 through 10."
  }
}

variable "lambda_package_path" {
  type = string
}

variable "application_version" {
  type = string
}

variable "contact_email" {
  type    = string
  default = ""
}

variable "contact_phone" {
  type    = string
  default = ""
}

variable "whatsapp_number" {
  type    = string
  default = ""
}

variable "facebook_url" {
  type    = string
  default = ""
}

variable "instagram_url" {
  type    = string
  default = ""
}

variable "tiktok_url" {
  type    = string
  default = ""
}
