#!/usr/bin/env bash
# Prepared operator command only. This file has NOT been executed by Codex.
# Owner password is entered at psql's protected prompt, never a CLI argument,
# shell-history entry, environment file, log, or chat message.
set -euo pipefail
set +x
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
command -v psql >/dev/null || { printf '%s\n' 'psql is required; no installation attempted.'; exit 1; }
printf '%s\n' 'P3.4 DEVELOPMENT INSTALLATION ONLY' \
  'Target: ep-twilight-voice-aorpfrbm / neondb' \
  'Creates one private fee table, eight invoker functions and two triggers; applies restricted runtime grants.' \
  'No payment, fee record, existing Creation/deployment update or wallet activation is performed.' \
  'Proceed only after separate founder approval of these SQL artifacts.'
read -r -p 'Type INSTALL P3.4 DEVELOPMENT to proceed: ' yawrd_fee_install_confirmation
[[ "$yawrd_fee_install_confirmation" == 'INSTALL P3.4 DEVELOPMENT' ]] || exit 1
read -r -p 'Development owner database role (not the runtime role): ' yawrd_fee_owner_role
[[ "$yawrd_fee_owner_role" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ && "$yawrd_fee_owner_role" != yawrd_07b_runtime ]] || exit 1
# Do not consult inherited password/service settings or a local credential file.
# -X prevents startup SQL; -W always prompts privately for this connection.
env -u PGPASSWORD -u PGSERVICE -u PGOPTIONS -u PGHOSTADDR PGPASSFILE=/dev/null PGSERVICEFILE=/dev/null \
  PGSSLMODE=require PGCONNECT_TIMEOUT=15 PGOPTIONS='-c lock_timeout=5000 -c statement_timeout=30000' \
  psql -X -W \
  --host=ep-twilight-voice-aorpfrbm.c-2.ap-southeast-1.aws.neon.tech \
  --port=5432 --dbname=neondb --username="$yawrd_fee_owner_role" \
  --set=ON_ERROR_STOP=1 --single-transaction \
  --file=docs/proposals/migrations/phase2_creation_platform_fees.sql \
  --file=docs/proposals/migrations/phase2_creation_platform_fee_grants.sql \
  --file=docs/proposals/migrations/phase2_creation_platform_fee_verify.sql
