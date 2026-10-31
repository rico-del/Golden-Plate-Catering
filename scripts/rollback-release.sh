#!/usr/bin/env bash
set -Eeuo pipefail

state_dir=/var/lib/golden-plate
app_dir=/opt/golden-plate
release_env=/etc/golden-plate/release.env
source_dir=${1:-}

if [[ $EUID -ne 0 || ! -f "$source_dir/update-deployment-state.mjs" ]]; then
  printf 'Rollback requires root and the release state helper.\n' >&2
  exit 1
fi

exec 9>/run/lock/golden-plate-deploy.lock
if ! flock -n 9; then
  printf 'Another production deployment is already running.\n' >&2
  exit 1
fi

previous_target=$(cat "$state_dir/previous-release" 2>/dev/null || true)
previous_version=$(cat "$state_dir/previous-version" 2>/dev/null || true)
current_target=$(readlink -f "$app_dir/current" 2>/dev/null || true)
if [[ -z "$previous_target" || "$previous_target" != "$app_dir/releases/"* || ! -d "$previous_target" || -z "$previous_version" ]]; then
  printf 'No valid previous release is recorded.\n' >&2
  exit 1
fi

health_check() {
  local expected_version=$1
  local attempt response
  for attempt in {1..30}; do
    if systemctl is-active --quiet golden-plate.service; then
      response=$(curl --fail --silent --show-error --max-time 3 http://127.0.0.1:3000/api/health 2>/dev/null || true)
      if [[ -n "$response" ]] && node -e 'const [body, expected] = process.argv.slice(1); try { const health = JSON.parse(body); process.exit(health.status === "ok" && (expected === "legacy" ? !health.version : health.version === expected) ? 0 : 1); } catch { process.exit(1); }' "$response" "$expected_version"; then
        return 0
      fi
    fi
    sleep 2
  done
  return 1
}

if [[ "$current_target" != "$previous_target" ]]; then
  rm -f -- "$app_dir/.rollback-current"
  ln -s "$previous_target" "$app_dir/.rollback-current"
  mv -Tf "$app_dir/.rollback-current" "$app_dir/current"
  temporary_env=$(mktemp /etc/golden-plate/release.env.XXXXXX)
  printf 'APP_VERSION=%s\n' "$previous_version" >"$temporary_env"
  chmod 0644 "$temporary_env"
  mv -f "$temporary_env" "$release_env"
  systemctl daemon-reload
  systemctl restart golden-plate.service
fi

if health_check "$previous_version"; then
  duration=0
  node "$source_dir/update-deployment-state.mjs" "$state_dir/deployment-state.json" rollback "$previous_version" "$duration" || printf 'Warning: rollback metrics state could not be updated.\n' >&2
  printf 'ROLLBACK_RESULT=SUCCESS previous=%s\n' "$(basename "$previous_target")"
else
  printf 'ROLLBACK_RESULT=FAILED previous=%s\n' "$(basename "$previous_target")" >&2
  exit 1
fi