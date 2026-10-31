# Terraform Operations

Terraform manages the existing Ubuntu EC2 web host, Elastic IP association, Nginx/Certbot bootstrap, private S3 artifact bucket, instance role, SSM parameters and MongoDB Atlas resources. It also defines a dedicated GitHub OIDC deployment role and an optional ingress rule for an approved private monitoring host. No Terraform command was applied as part of this repository change.

## State and Safety

The current checkout contains local Terraform state and ignored runtime variable files. State can contain Atlas credentials, MongoDB URIs and administrator credentials even when Terraform marks values sensitive. Before any apply, move state to a reviewed encrypted backend with tightly restricted access, verify the AWS account and region, and inspect the complete plan. Do not apply a plan that replaces or destroys the production EC2 instance, Elastic IP, S3 bucket or Atlas data.

The existing GitHub Actions OIDC provider is already present in the AWS account. The added `github_deploy_role_arn` output creates a separate role; it does not reuse the Munch deployment role or the EC2 runtime role. Its trust subject is `repo:rico-del/Golden-Plate-Catering:environment:production`. GitHub must restrict the `production` Environment to the `main` branch and require authorized reviewers.

## Deployment Role Activation

1. Authenticate with an administrative AWS identity and confirm `aws sts get-caller-identity` reports the intended account. Never configure long-lived AWS access keys in GitHub.
2. Secure the existing Terraform state before a production apply. Use the existing reviewed `terraform.tfvars` and protected local/CI environment variables for sensitive Atlas/admin values; do not print or commit them.
3. Generate an archive at a new path so no existing `dist` artifact is overwritten:

```sh
archive="$PWD/dist/golden-plate-bootstrap-$(date -u +%Y%m%d%H%M%S).tar.gz"
bash scripts/package-deployment.sh "$archive"
terraform -chdir=terraform init
terraform -chdir=terraform plan -var="deployment_archive_path=$archive"
```

4. Review the plan for replacements, deletions, unexpected Atlas changes and changes to the existing Elastic IP or data bucket. Apply only after reviewing and approving that exact plan.
5. Retrieve the outputs `github_deploy_role_arn`, `deployment_bucket_name`, `instance_id`, and `elastic_ip` from the reviewed state. Configure GitHub repository variables `AWS_ROLE_ARN`, `AWS_REGION`, `AWS_DEPLOYMENT_BUCKET`, and `EC2_INSTANCE_ID` from those values.
6. In GitHub repository Settings, create the `production` Environment, allow deployments from `main` only, and require an authorized reviewer. Add the optional `SLACK_DEPLOYMENT_WEBHOOK_URL` secret only after the client approves the destination channel.
7. Confirm the EC2 instance is SSM-managed and the instance role can read the deployment bucket. Trigger a deployment by merging to `main` or use an authorized manual run from `main`.

The workflow writes immutable objects at `releases/production/<full-commit-sha>.tar.gz`, refuses to overwrite an existing SHA with different content, and does not use a mutable production `latest` key. The bucket is not currently versioned; unique keys and the workflow's overwrite guard provide artifact identity. Older releases remain in S3 for manual redeploy/rollback.

## Monitoring Network Prerequisites

The production EC2 security group currently admits only ports 80 and 443 from the internet. Monitoring ports are not public. If a separate monitoring host is approved in the same VPC, set `monitoring_security_group_id` to its dedicated security group in a reviewed Terraform plan. That optional rule permits TCP 9100 only from that security group; install Node Exporter on the production host and configure the private target in `monitoring/prometheus/targets/production-host.json`. The variable defaults to `null` and adds no ingress rule until explicitly set.

For the optional post-deployment Prometheus target check, set `monitoring_instance_id` to the SSM-managed monitoring EC2 ID in the reviewed plan and configure the same ID as GitHub production Environment variable `MONITORING_INSTANCE_ID`. This adds `ssm:SendCommand` for only that additional instance to the deploy role. The check is advisory; application process/public health and release-version checks remain release-blocking.
