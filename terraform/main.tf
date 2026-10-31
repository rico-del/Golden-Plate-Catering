terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.14"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "golden-plate-catering"
      Environment = "production"
      ManagedBy   = "Terraform"
    }
  }
}

provider "mongodbatlas" {}

locals {
  deployment_archive_path = var.deployment_archive_path == null ? "${path.module}/../dist/golden-plate-deploy.tar.gz" : abspath(var.deployment_archive_path)
}

resource "aws_eip" "site" {
  domain = "vpc"
  tags = {
    Name = "golden-plate-catering-production"
  }

  lifecycle {
    prevent_destroy = true
  }
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_vpc" "site" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
}

resource "aws_internet_gateway" "site" {
  vpc_id = aws_vpc.site.id
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.site.id
  cidr_block              = var.public_subnet_cidr
  availability_zone       = var.availability_zone
  map_public_ip_on_launch = false
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.site.id
}

resource "aws_route" "internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.site.id
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "site" {
  name        = "golden-plate-catering-web"
  description = "Public web traffic only; administration uses SSM."
  vpc_id      = aws_vpc.site.id
}

resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.site.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.site.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "outbound" {
  security_group_id = aws_security_group.site.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_iam_role" "instance" {
  name = "golden-plate-catering-instance"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "runtime" {
  name = "golden-plate-catering-runtime"
  role = aws_iam_role.instance.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:GetObject"], Resource = "${aws_s3_bucket.deployments.arn}/*" },
      { Effect = "Allow", Action = ["ssm:GetParameter", "ssm:GetParameters"], Resource = [aws_ssm_parameter.mongo_uri.arn, aws_ssm_parameter.admin_username.arn, aws_ssm_parameter.admin_password.arn] }
    ]
  })
}

resource "aws_iam_instance_profile" "site" {
  name = "golden-plate-catering-instance"
  role = aws_iam_role.instance.name
}

resource "aws_s3_bucket" "deployments" {
  bucket        = var.deployment_bucket_name
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "deployments" {
  bucket                  = aws_s3_bucket.deployments.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "deployments" {
  bucket = aws_s3_bucket.deployments.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_object" "application" {
  bucket      = aws_s3_bucket.deployments.id
  key         = "releases/golden-plate-deploy.tar.gz"
  source      = local.deployment_archive_path
  source_hash = filemd5(local.deployment_archive_path)
}

resource "mongodbatlas_project" "site" {
  name   = "golden-plate-catering"
  org_id = var.atlas_org_id
}

resource "mongodbatlas_advanced_cluster" "site" {
  project_id   = mongodbatlas_project.site.id
  name         = "golden-plate-cluster"
  cluster_type = "REPLICASET"

  replication_specs {
    region_configs {
      electable_specs { instance_size = "M0" }
      provider_name         = "TENANT"
      backing_provider_name = "AWS"
      region_name           = var.atlas_region_name
      priority              = 7
    }
  }
}

resource "mongodbatlas_database_user" "site" {
  project_id         = mongodbatlas_project.site.id
  auth_database_name = "admin"
  username           = var.atlas_database_username
  password           = var.atlas_database_password
  roles {
    role_name     = "readWrite"
    database_name = "golden_plate_catering"
  }
}

resource "mongodbatlas_project_ip_access_list" "site" {
  project_id = mongodbatlas_project.site.id
  ip_address = aws_eip.site.public_ip
  comment    = "Golden Plate EC2 Elastic IP"
}

resource "aws_ssm_parameter" "mongo_uri" {
  name  = "/golden-plate-catering/production/mongodb_uri"
  type  = "SecureString"
  value = "mongodb+srv://${var.atlas_database_username}:${var.atlas_database_password}@${replace(mongodbatlas_advanced_cluster.site.connection_strings[0].standard_srv, "mongodb+srv://", "")}/golden_plate_catering?retryWrites=true&w=majority"
}

resource "aws_ssm_parameter" "admin_username" {
  name  = "/golden-plate-catering/production/admin_username"
  type  = "SecureString"
  value = var.admin_username
}

resource "aws_ssm_parameter" "admin_password" {
  name  = "/golden-plate-catering/production/admin_password"
  type  = "SecureString"
  value = var.admin_password
}

resource "aws_instance" "site" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.site.id]
  iam_instance_profile        = aws_iam_instance_profile.site.name
  associate_public_ip_address = true
  user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    aws_region        = var.aws_region
    deployment_bucket = aws_s3_bucket.deployments.bucket
    deployment_key    = aws_s3_object.application.key
    certbot_email     = var.certbot_email
  })
  user_data_replace_on_change = true

  metadata_options { http_tokens = "required" }
  root_block_device {
    encrypted   = true
    volume_type = "gp3"
    volume_size = 20
  }
  lifecycle {
    ignore_changes = [user_data]
  }
  depends_on = [aws_s3_object.application, aws_iam_role_policy_attachment.ssm]
}
