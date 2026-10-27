resource "aws_eip_association" "site" {
  allocation_id = aws_eip.site.id
  instance_id   = aws_instance.site.id
}
