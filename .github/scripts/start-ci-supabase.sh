#!/usr/bin/env bash
set -eu
if [[ ${GITHUB_ACTIONS:-} != true || ${RUNNER_OS:-} != Linux ]]; then
  echo "This script configures a disposable Linux CI checkout." >&2
  exit 1
fi

# 55320–55329 overlaps the runner's ephemeral client ports during image pulls.
# Only rewrite Supabase's listener settings; auth redirects keep their own ports.
perl -pi -e 's/5532/1532/ if /^(?:port|shadow_port|smtp_port) = 5532[0-9]$/' supabase/config.toml
exec supabase start "$@"
