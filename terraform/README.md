# Golden Plate production deployment

This Terraform setup deploys one SSM-managed Ubuntu EC2 instance behind the existing Elastic IP, with Nginx and Certbot on the host. It deliberately excludes an ALB, NAT Gateway, auto scaling, and public SSH to minimise recurring cost.

## Before apply

1. Authenticate the AWS CLI, then verify it with `aws sts get-caller-identity`.
2. Copy `terraform.tfvars.example` to `terraform.tfvars` and replace the Elastic IP allocation ID and unique S3 bucket name.
3. Export Atlas credentials instead of writing them to files:

```sh
export MONGODB_ATLAS_PUBLIC_KEY='...'
export MONGODB_ATLAS_PRIVATE_KEY='...'
export TF_VAR_atlas_org_id='...'
export TF_VAR_atlas_database_username='golden_plate_app'
export TF_VAR_atlas_database_password='...'
export TF_VAR_admin_username='...'
export TF_VAR_admin_password='...'
```

4. From the project root, run `bash scripts/package-deployment.sh` before planning so Terraform can calculate the archive checksum. Then run `terraform init`, `terraform plan`, and `terraform apply` from this directory.
5. Set the DuckDNS address to the `elastic_ip` Terraform output. Wait for public DNS propagation.
6. Start an SSM session using the `ssm_start_session` output, then run the `tls_command` output. Certbot obtains the certificate and configures automatic renewal.

The existing Elastic IP is only looked up and associated with the new instance; Terraform will not create or delete it.

## Sensitive state

Terraform treats the database password and MongoDB URI as sensitive, but they are still present in Terraform state. Use an encrypted remote backend with access restricted to you before a production apply.
