#!/usr/bin/env bash
set -Eeuo pipefail

release_id=${1:-}
source_dir=${2:-}

if [[ $EUID -ne 0 ]]; then
  printf 'Deployment must run as root.\n' >&2
  exit 1
fi
if [[ ! $release_id =~ ^[a-f0-9]{40}$ || ! -d "$source_dir" || ! -f "$source_dir/server.mjs" ]]; then
  printf 'Invalid release identifier or release package.\n' >&2
  exit 1
fi

app_dir=/opt/golden-plate
release_dir="$app_dir/releases/$release_id"
staging_dir="$app_dir/releases/.${release_id}.staging"
state_dir=/var/lib/golden-plate
current_link="$app_dir/current"
release_env=/etc/golden-plate/release.env
service_dropin=/etc/systemd/system/golden-plate.service.d/release.conf
previous_target_file="$state_dir/previous-release"
previous_version_file="$state_dir/previous-version"
deployment_started_at=$(date +%s)
activation_started=false

mkdir -p "$app_dir/releases" "$state_dir/data" /etc/golden-plate /etc/systemd/system/golden-plate.service.d
exec 9>/run/lock/golden-plate-deploy.lock
if ! flock -n 9; then
  printf 'Another production deployment is already running.\n' >&2
  exit 1
fi

if [[ -d "$app_dir/data" ]]; then
  for data_file in reviews.json enquiries.json; do
    if [[ -f "$app_dir/data/$data_file" && ! -e "$state_dir/data/$data_file" ]]; then
      cp -p -- "$app_dir/data/$data_file" "$state_dir/data/$data_file"
    fi
  done
fi

if [[ ! -L "$current_link" ]]; then
  bootstrap_dir="$app_dir/releases/bootstrap"
  if [[ ! -d "$bootstrap_dir" ]]; then
    if [[ ! -f "$app_dir/server.mjs" ]]; then
      printf 'No existing application is available for bootstrap rollback.\n' >&2
      exit 1
    fi
    mkdir -p "$bootstrap_dir"
    tar --exclude='./releases' --exclude='./current' -C "$app_dir" -cf - . | tar -C "$bootstrap_dir" -xf -
  fi
  rm -f -- "$app_dir/.current-bootstrap"
  ln -s "$bootstrap_dir" "$app_dir/.current-bootstrap"
  mv -Tf "$app_dir/.current-bootstrap" "$current_link"
fi

current_before_deploy=$(readlink -f "$current_link")
previous_target=$current_before_deploy
previous_version=$(sed -n 's/^APP_VERSION=//p' "$release_env" 2>/dev/null | head -n 1)
previous_version=${previous_version:-legacy}
if [[ "$previous_target" == "$release_dir" && -f "$previous_target_file" && -f "$previous_version_file" ]]; then
  previous_target=$(<"$previous_target_file")
  previous_version=$(<"$previous_version_file")
fi
if [[ "$current_before_deploy" == "$release_dir" && "$previous_target" == "$release_dir" ]]; then
  printf 'No previous release is recorded for rollback; refusing to restart the active release.\n' >&2
  exit 1
fi
if [[ ! -d "$previous_target" ]]; then
  printf 'Previous release target is missing; refusing to switch production.\n' >&2
  exit 1
fi

if [[ -e "$release_dir" ]]; then
  printf 'Release %s is already installed; verifying it without replacing the release directory.\n' "$release_id"
else
  rm -rf -- "$staging_dir"
  mkdir -m 0755 "$staging_dir"
  cp -a "$source_dir/." "$staging_dir/"
  (cd "$staging_dir" && npm ci --omit=dev)
  mv "$staging_dir" "$release_dir"
fi

cat >/usr/local/sbin/golden-plate-start-release <<'START_SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
/usr/local/bin/golden-plate-env
set -a
source /run/golden-plate.env
exec /usr/bin/node /opt/golden-plate/current/server.mjs
START_SCRIPT
chmod 0755 /usr/local/sbin/golden-plate-start-release

cat >"$service_dropin" <<'UNIT'
[Service]
WorkingDirectory=/opt/golden-plate/current
Environment=NODE_ENV=production
Environment=DATA_DIR=/var/lib/golden-plate/data
EnvironmentFile=-/etc/golden-plate/release.env
EnvironmentFile=-/etc/golden-plate/metrics.env
ExecStart=
ExecStart=/usr/local/sbin/golden-plate-start-release
UNIT
chmod 0644 "$service_dropin"

write_release_version() {
  local version=$1
  local temporary_file
  temporary_file=$(mktemp /etc/golden-plate/release.env.XXXXXX)
  printf 'APP_VERSION=%s\n' "$version" >"$temporary_file"
  chmod 0644 "$temporary_file"
  mv -f "$temporary_file" "$release_env"
}

switch_release() {
  local target=$1
  local temporary_link="$app_dir/.current-$release_id"
  rm -f -- "$temporary_link"
  ln -s "$target" "$temporary_link"
  mv -Tf "$temporary_link" "$current_link"
}

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

rollback_after_command_error() {
  local status=$?
  trap - ERR
  if [[ "$activation_started" == true ]]; then
    printf 'DEPLOYMENT_RESULT=FAILED release=%s\n' "$release_id" >&2
    printf 'ROLLBACK_STARTED previous=%s\n' "$(basename "$previous_target")" >&2
    if switch_release "$previous_target" && write_release_version "$previous_version" && systemctl daemon-reload && systemctl restart golden-plate.service && health_check "$previous_version"; then
      printf 'ROLLBACK_RESULT=SUCCESS previous=%s\n' "$(basename "$previous_target")" >&2
    else
      printf 'ROLLBACK_RESULT=FAILED previous=%s\n' "$(basename "$previous_target")" >&2
    fi
  fi
  exit "$status"
}

if [[ "$current_before_deploy" == "$release_dir" ]] && health_check "$release_id"; then
  printf 'DEPLOYMENT_RESULT=SUCCESS release=%s already_active=true\n' "$release_id"
  exit 0
fi

systemctl daemon-reload
printf '%s\n' "$previous_target" >"$previous_target_file.tmp"
printf '%s\n' "$previous_version" >"$previous_version_file.tmp"
mv -f "$previous_target_file.tmp" "$previous_target_file"
mv -f "$previous_version_file.tmp" "$previous_version_file"
activation_started=true
trap rollback_after_command_error ERR
switch_release "$release_dir"
write_release_version "$release_id"
printf 'DEPLOYMENT_STARTED release=%s previous=%s\n' "$release_id" "$(basename "$previous_target")"

if systemctl restart golden-plate.service && health_check "$release_id"; then
  trap - ERR
  duration=$(($(date +%s) - deployment_started_at))
  node "$source_dir/scripts/update-deployment-state.mjs" "$state_dir/deployment-state.json" success "$release_id" "$duration" || printf 'Warning: deployment succeeded but deployment metrics state could not be updated.\n' >&2
  printf 'DEPLOYMENT_RESULT=SUCCESS release=%s\n' "$release_id"
  exit 0
fi

duration=$(($(date +%s) - deployment_started_at))
trap - ERR
node "$source_dir/scripts/update-deployment-state.mjs" "$state_dir/deployment-state.json" failure "$release_id" "$duration" || printf 'Warning: failure metrics state could not be updated.\n' >&2
printf 'DEPLOYMENT_RESULT=FAILED release=%s\n' "$release_id"
printf 'ROLLBACK_STARTED previous=%s\n' "$(basename "$previous_target")"
switch_release "$previous_target"
write_release_version "$previous_version"
if systemctl restart golden-plate.service && health_check "$previous_version"; then
  node "$source_dir/scripts/update-deployment-state.mjs" "$state_dir/deployment-state.json" rollback "$previous_version" "$duration" || printf 'Warning: rollback metrics state could not be updated.\n' >&2
  printf 'ROLLBACK_RESULT=SUCCESS previous=%s\n' "$(basename "$previous_target")"
else
  printf 'ROLLBACK_RESULT=FAILED previous=%s\n' "$(basename "$previous_target")" >&2
fi
exit 1