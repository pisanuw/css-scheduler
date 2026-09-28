#!/usr/bin/env bash
#
# Run the schema and its RLS suite against a throwaway local PostgreSQL.
#
# `npm run db:test:rls` talks to a real project through a token in the
# maintainer's macOS keychain. That works on their machine and nowhere else, so
# in a cloud sandbox or on CI the only way to check a policy change used to be
# firing SQL at the live database — a poor place to discover a mistake.
#
# This boots a cluster of its own, applies supabase/tests/local_shim.sql (the
# handful of Supabase objects the migrations depend on), then every migration,
# the seed, and the suite. No Docker, no secrets, nothing to clean up but a
# directory.
#
#   scripts/local_db.sh test      build it and run the RLS suite   (the usual one)
#   scripts/local_db.sh build     build it and stop
#   scripts/local_db.sh psql      open a shell on it
#   scripts/local_db.sh sql FILE  run one file against it
#   scripts/local_db.sh stop      shut the cluster down
#
# It is not a substitute for `npm run test:e2e`, which exercises the real auth
# and REST layers; see the header of local_shim.sql for what the shim omits.
set -euo pipefail

PORT="${CSS_LOCAL_PG_PORT:-55432}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB=css_local

# PostgreSQL 18 will not start on macOS with an unset locale: Apple's libc starts
# threads of its own during locale lookup, the postmaster notices it has become
# multithreaded and dies — "postmaster became multithreaded during startup", with
# a HINT about LC_ALL that is easy to read as advice rather than the cause. A
# login shell usually has LANG set and never sees this; `npm run` does not.
# Setting it here also pins the cluster's collation instead of inheriting
# whatever the caller happened to have.
export LC_ALL="${CSS_LOCAL_LOCALE:-en_US.UTF-8}"
export LANG="$LC_ALL"

# The server binaries, and a check that they are actually usable.
#
# Two ways this looks satisfied and is not, both of them found the hard way on a
# machine with Homebrew:
#
# - libpq links a *client-only* `initdb` into /opt/homebrew/bin. Probing for
#   `initdb` therefore finds something that cannot build a cluster, and the
#   failure lands several lines later as "program postgres is needed by initdb".
#   So probe for the server itself.
# - `postgresql@NN` is keg-only. Its binaries carry a share path compiled in at
#   build time that only exists once the keg is linked, so an unlinked keg cannot
#   initdb (no postgres.bki) and cannot start (no timezone database) whatever
#   PATH says. `initdb -L` reaches the first but there is no equivalent for the
#   server, which is why this asks for a link rather than working around it.
#
# Debian and Ubuntu keep a complete, correctly built server off PATH, which is
# the one case worth searching for.
if ! command -v postgres >/dev/null 2>&1; then
  for d in /usr/lib/postgresql/*/bin /Applications/Postgres.app/Contents/Versions/*/bin; do
    [ -x "$d/postgres" ] && [ -x "$d/initdb" ] && export PATH="$d:$PATH" && break
  done
fi
if ! command -v postgres >/dev/null 2>&1; then
  echo "no PostgreSQL *server* on PATH — this needs more than the client tools."
  if command -v initdb >/dev/null 2>&1; then
    echo "('$(command -v initdb)' exists, but it is a client-only initdb: it has no server beside it.)"
  fi
  echo
  echo "on macOS, with Homebrew:"
  echo "    brew install postgresql@18"
  echo "    brew link --overwrite postgresql@18   # takes psql/initdb over from libpq"
  echo
  echo "a keg-only postgresql@NN that is installed but not linked cannot work:"
  echo "its binaries look for share/ at a prefix that linking is what creates."
  exit 1
fi
if ! command -v postgres >/dev/null 2>&1; then
  echo "no PostgreSQL *server* on PATH — this needs more than the client tools."
  if command -v initdb >/dev/null 2>&1; then
    echo "('$(command -v initdb)' exists, but it is a client-only initdb: it has no server beside it.)"
  fi
  echo
  echo "on macOS, with Homebrew:"
  echo "    brew install postgresql@18"
  echo "    brew link --overwrite postgresql@18   # takes psql/initdb over from libpq"
  echo
  echo "a keg-only postgresql@NN that is installed but not linked cannot work:"
  echo "its binaries look for share/ at a prefix that linking is what creates."
  exit 1
fi

# A server may not run as root, so as root we borrow the packaged postgres
# account and put the cluster somewhere it can actually reach — a home
# directory under /tmp is usually not traversable by another user.
AS=""
if [ "$(id -u)" = 0 ] && id postgres >/dev/null 2>&1; then
  AS=postgres
  PGDATA_DIR="${CSS_LOCAL_PGDATA:-/var/lib/postgresql/css-local}"
  SOCKET=/var/run/postgresql
else
  PGDATA_DIR="${CSS_LOCAL_PGDATA:-${TMPDIR:-/tmp}/css-local-pg}"
  # Beside the data directory, not inside it: initdb refuses a directory that is
  # not empty, and creating the socket directory first made it so. As root the
  # socket goes to /var/run/postgresql and the two never collide, which is why
  # every run to date — all of them in a root sandbox — got away with it.
  SOCKET="${PGDATA_DIR%/}-socket"
fi

run() { if [ -n "$AS" ]; then su "$AS" -s /bin/bash -c "PATH=$PATH LC_ALL=$LC_ALL LANG=$LANG $*"; else bash -c "$*"; fi; }
psql_() { psql -h "$SOCKET" -p "$PORT" -U postgres "$@"; }
q()     { psql_ -d "$DB" -q -v ON_ERROR_STOP=1 "$@"; }

running() { pg_isready -h "$SOCKET" -p "$PORT" -q 2>/dev/null; }

start() {
  running && return 0
  if [ ! -s "$PGDATA_DIR/PG_VERSION" ]; then
    # No PG_VERSION means there is no cluster here, so whatever is in the way is
    # the wreckage of a run that failed inside initdb — which then refuses the
    # non-empty directory for ever after, and the second failure describes the
    # first one's mess rather than its cause. Nothing here is meant to outlive a
    # run, so clear it and start over.
    rm -rf "$PGDATA_DIR"
    mkdir -p "$PGDATA_DIR" "$SOCKET"
    [ -n "$AS" ] && chown "$AS" "$PGDATA_DIR" "$SOCKET"
    run "initdb -D '$PGDATA_DIR' -U postgres --auth=trust" >/dev/null
  fi
  mkdir -p "$SOCKET"; [ -n "$AS" ] && chown "$AS" "$SOCKET"
  run "pg_ctl -D '$PGDATA_DIR' -l '$PGDATA_DIR/server.log' -o '-p $PORT -k $SOCKET' -w start" >/dev/null
}

build() {
  start
  psql_ -q -c "drop database if exists $DB" >/dev/null
  psql_ -q -c "create database $DB" >/dev/null
  q -f "$ROOT/supabase/tests/local_shim.sql" >/dev/null
  for f in "$ROOT"/supabase/migrations/*.sql; do
    q -f "$f" >/dev/null || { echo "migration failed: $(basename "$f")"; exit 1; }
  done
  q -f "$ROOT/supabase/seed.sql" >/dev/null
  echo "built $DB on port $PORT"
}

case "${1:-test}" in
  build) build ;;
  test)
    build
    # The suite prints PASS/FAIL per check; make the exit status say so too.
    out=$(q -f "$ROOT/supabase/tests/rls_test.sql")
    echo "$out"
    if echo "$out" | grep -q FAIL; then echo; echo "FAILED: $(echo "$out" | grep -c FAIL) check(s)"; exit 1; fi
    echo; echo "all $(echo "$out" | grep -c PASS) checks pass"
    ;;
  sql)   start; q -f "${2:?usage: local_db.sh sql FILE}" ;;
  psql)  start; psql_ -d "$DB" ;;
  stop)  run "pg_ctl -D '$PGDATA_DIR' -m fast -w stop" ;;
  *)     sed -n '3,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
