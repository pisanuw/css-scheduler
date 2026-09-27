#!/usr/bin/env bash
#
# Regenerate src/lib/database.types.ts, the row types the Supabase client is
# parameterised with.
#
#   npm run db:types             from the hosted project (the usual one)
#   npm run db:types -- local    from a running local stack (supabase start)
#
# Two reasons this is a script rather than a redirect in package.json:
#
# 1. `supabase gen types ... > file` truncates the file before the CLI runs, so
#    a stack that is not up, an expired token or a typo left an empty
#    database.types.ts behind and the whole app went back to `any` rows —
#    silently, because an empty module still imports. Here the output lands in a
#    temporary file and only replaces the real one once it looks like types.
# 2. `--local` needs Docker and `supabase start`; `--project-id` needs only an
#    access token. Which one is available depends on the machine.
#
# The hosted project is the default because it is the schema the running app
# actually meets. It should agree with supabase/migrations, but the two histories
# are not the same shape — twelve entries applied through the Management API
# against nine consolidated files — so a diff between the local and hosted output
# is worth reading rather than assuming. Either way, do not edit the generated
# file: the next run overwrites it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/src/lib/database.types.ts"
# The same project the build-check and route-check scripts point at.
REF="${SUPABASE_PROJECT_REF:-abvnaelzfriusckqqrfc}"

command -v supabase >/dev/null 2>&1 || {
  echo "the Supabase CLI is not on PATH: https://supabase.com/docs/guides/cli" >&2
  exit 1
}

case "${1:-hosted}" in
  local)  set -- --local ;;
  hosted) set -- --project-id "$REF" ;;
  *)      sed -n '3,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# `|| true` because the failure is reported below with the output that explains
# it: the CLI prints its errors as JSON on *stdout*, which is the stream being
# captured, so letting `set -e` abort here loses the only diagnostic there is.
supabase gen types typescript "$@" > "$TMP" || true

# Whether the CLI refused (no stack up, no token, wrong ref) or answered with an
# empty schema, it arrives here as a file with no Database in it.
grep -q 'export type Database' "$TMP" || {
  head -c 500 "$TMP" >&2
  [ -s "$TMP" ] && echo >&2
  echo "supabase gen types produced no types; $OUT left alone" >&2
  exit 1
}

if cmp -s "$TMP" "$OUT"; then
  echo "src/lib/database.types.ts is already current ($*)"
else
  cp "$TMP" "$OUT"
  echo "wrote src/lib/database.types.ts ($(wc -l < "$OUT" | tr -d ' ') lines, $*)"
fi
