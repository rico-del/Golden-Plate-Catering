#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
output_dir="$project_root/dist"
archive_path="$output_dir/golden-plate-deploy.tar.gz"

mkdir -p "$output_dir"
rm -f "$archive_path"

tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='data' \
  --exclude='dist' \
  --exclude='.env' \
  --exclude='terraform' \
  --exclude='.agents' \
  --exclude='.codex' \
  -C "$project_root" \
  -czf "$archive_path" \
  .

printf 'Created %s\n' "$archive_path"
