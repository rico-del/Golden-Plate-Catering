#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
archive_path=${1:-"$project_root/dist/golden-plate-deploy.tar.gz"}
archive_path=$(mkdir -p "$(dirname "$archive_path")" && cd "$(dirname "$archive_path")" && printf '%s/%s\n' "$PWD" "$(basename "$archive_path")")

if [[ -e "$archive_path" ]]; then
  printf 'Refusing to overwrite existing artifact: %s\n' "$archive_path" >&2
  exit 1
fi

temporary_path=$(mktemp "${archive_path}.tmp.XXXXXX")
trap 'rm -f "$temporary_path"' EXIT

tar \
  --sort=name \
  --mtime='@0' \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  --pax-option=delete=atime,delete=ctime \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='data' \
  --exclude='dist' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='terraform' \
  --exclude='.agents' \
  --exclude='.codex' \
  --exclude='.github' \
  --exclude='test' \
  --exclude='monitoring' \
  -C "$project_root" \
  -cf - \
  . | gzip -n >"$temporary_path"

mv "$temporary_path" "$archive_path"
trap - EXIT
printf 'Created %s\n' "$archive_path"
