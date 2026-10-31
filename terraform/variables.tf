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
