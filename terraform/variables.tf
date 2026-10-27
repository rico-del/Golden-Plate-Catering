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
