#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $EUID -ne 0 ]]; then
  printf 'Run this approved host setup as root.\n' >&2
  exit 1
fi

token=$(curl --fail --silent --show-error --max-time 2 -X PUT \
  -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' \
  http://169.254.169.254/latest/api/token)
private_ip=$(curl --fail --silent --show-error --max-time 2 \
  -H "X-aws-ec2-metadata-token: $token" \
  http://169.254.169.254/latest/meta-data/local-ipv4)
if [[ ! $private_ip =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  printf 'Could not obtain a valid private IPv4 address from IMDSv2.\n' >&2
  exit 1
fi

apt-get update -y
apt-get install -y prometheus-node-exporter
install -d -m 0755 /etc/systemd/system/prometheus-node-exporter.service.d
cat >/etc/systemd/system/prometheus-node-exporter.service.d/listen.conf <<UNIT
[Service]
ExecStart=
ExecStart=/usr/bin/prometheus-node-exporter --web.listen-address=${private_ip}:9100
UNIT
systemctl daemon-reload
systemctl enable --now prometheus-node-exporter.service

printf 'Node Exporter listens on the EC2 private address at TCP 9100. Confirm its security group permits only the approved monitoring security group.\n'