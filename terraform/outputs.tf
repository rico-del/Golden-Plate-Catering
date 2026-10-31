output "elastic_ip" { value = aws_eip.site.public_ip }
output "instance_id" { value = aws_instance.site.id }
output "ssm_start_session" { value = "aws ssm start-session --target ${aws_instance.site.id} --region ${var.aws_region}" }
output "tls_command" { value = "sudo /usr/local/sbin/enable-golden-plate-tls" }
output "deployment_bucket_name" { value = aws_s3_bucket.deployments.bucket }
