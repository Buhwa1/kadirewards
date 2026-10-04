#!/usr/bin/env bash
# Run the SQL test suite against a throwaway Postgres.
#
#   ./supabase/tests/run.sh                      # spins up a local instance
#   DB_URL=postgres://... ./supabase/tests/run.sh   # or point at your own
#
# With DB_URL the database must be EMPTY — the suite applies every migration
# from scratch and seeds demo data. Never point it at production.
#
# Against plain Postgres the shim below stands in for the bits Supabase
# provides (auth.users, auth.uid(), the anon/authenticated/service_role roles).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PGPORT:-5433}"
SOCK="${PGSOCK:-/var/tmp}"

if [ -z "${DB_URL:-}" ]; then
  export PATH="$PATH:/usr/lib/postgresql/16/bin"
  DATA="${PGDATA:-/var/tmp/kadi-pgdata}"
  if ! pg_isready -h "$SOCK" -p "$PORT" >/dev/null 2>&1; then
    rm -rf "$DATA"; mkdir -p "$DATA"
    if [ "$(id -u)" = "0" ]; then
      chown postgres "$DATA"
      su postgres -c "PATH=$PATH initdb -D $DATA -U postgres --auth=trust" >/dev/null
      su postgres -c "PATH=$PATH pg_ctl -D $DATA -l /var/tmp/kadi-pg.log -o '-p $PORT -k $SOCK' start" >/dev/null
      sleep 2
    else
      initdb -D "$DATA" -U postgres --auth=trust >/dev/null
      pg_ctl -D "$DATA" -l /var/tmp/kadi-pg.log -o "-p $PORT -k $SOCK" start >/dev/null
      sleep 2
    fi
  fi
  PSQL=(psql -h "$SOCK" -p "$PORT" -U postgres)
  "${PSQL[@]}" -q -c "drop database if exists kadi_test;" -c "create database kadi_test;"
  PSQL=(psql -h "$SOCK" -p "$PORT" -U postgres -d kadi_test)
else
  PSQL=(psql "$DB_URL")
fi

# On a real Supabase database auth.uid() already exists. On plain Postgres it
# doesn't, so stand in for the pieces the migrations depend on.
if [ "$("${PSQL[@]}" -tAc "select to_regprocedure('auth.uid()') is null")" = "t" ]; then
  "${PSQL[@]}" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/_shim_plain_postgres.sql" >/dev/null
fi

for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done
"${PSQL[@]}" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/seed.sql" >/dev/null

fail=0
for f in "$ROOT"/supabase/tests/0*.sql; do
  echo "── $(basename "$f")"
  if ! "${PSQL[@]}" -q -f "$f" 2>&1 | sed 's/psql:.*NOTICE:  //' \
        | grep -E "PASS|ERROR|ALL " ; then fail=1; fi
done
exit $fail
