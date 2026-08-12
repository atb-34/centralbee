#!/usr/bin/env bash
#
# Runs every migration against a throwaway PostgreSQL cluster, then asserts the
# Row Level Security rules the product depends on.
#
# Nothing touches a real Supabase project: a cluster is created in a temporary
# directory, used, and destroyed.
#
# Requires PostgreSQL server binaries locally (initdb, pg_ctl, psql).
#
#   ./scripts/db-test.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v initdb 2>/dev/null || echo /usr/lib/postgresql/16/bin/initdb)")}"
PORT="${PGTESTPORT:-55432}"
WORKDIR="$(mktemp -d)"

if [[ ! -x "$PGBIN/initdb" ]]; then
  echo "PostgreSQL bulunamadı. PGBIN değişkeniyle yolu verin, örn:" >&2
  echo "  PGBIN=/usr/lib/postgresql/16/bin ./scripts/db-test.sh" >&2
  exit 1
fi

# Running as root, initdb refuses; fall back to an unprivileged helper account.
RUNNER=""
if [[ "$(id -u)" -eq 0 ]]; then
  RUNNER="pgtest"
  id "$RUNNER" >/dev/null 2>&1 || useradd -M -s /bin/bash "$RUNNER"
  chown -R "$RUNNER:$RUNNER" "$WORKDIR"
  chmod 755 "$WORKDIR"
fi

run() {
  if [[ -n "$RUNNER" ]]; then su "$RUNNER" -c "$1"; else bash -c "$1"; fi
}

cleanup() {
  run "$PGBIN/pg_ctl -D $WORKDIR/data -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

echo "▸ Geçici veritabanı hazırlanıyor…"
run "$PGBIN/initdb -D $WORKDIR/data -U postgres --auth=trust" >/dev/null
run "$PGBIN/pg_ctl -D $WORKDIR/data -l $WORKDIR/log -o '-k $WORKDIR -p $PORT -h \"\"' -w start" >/dev/null

export PGOPTIONS='--client-min-messages=warning'
PSQL="psql -h $WORKDIR -p $PORT -U postgres -v ON_ERROR_STOP=1"

$PSQL -q -c "create database centralbee_test;"
PSQL="$PSQL -d centralbee_test"

echo "▸ Supabase ön koşulları…"
$PSQL -q -f "$ROOT/supabase/tests/00_local_prelude.sql"

echo "▸ Göçler çalıştırılıyor…"
for file in "$ROOT"/supabase/migrations/*.sql; do
  printf '  %-40s' "$(basename "$file")"
  $PSQL -q -f "$file"
  echo "ok"
done

# Bir göç dosyasını yanlışlıkla ikinci kez çalıştırmak olağan bir hatadır —
# elle SQL yapıştırırken kolayca olur. İkinci çalıştırmanın da temiz geçmesi
# gerekir; aksi halde kullanıcı yarım uygulanmış bir şemayla baş başa kalır.
echo "▸ Aynı göçler tekrar çalıştırılıyor (yeniden çalıştırılabilirlik)…"
for file in "$ROOT"/supabase/migrations/*.sql; do
  printf '  %-40s' "$(basename "$file")"
  $PSQL -q -f "$file"
  echo "ok"
done

if [[ -f "$ROOT/supabase/bundle.sql" ]]; then
  # bundle.sql ilk kurulumda SQL Editor'e yapıştırılan dosyadır; ikinci kez
  # yapıştırılması sık yapılan bir hatadır ve temiz geçmelidir.
  echo "▸ bundle.sql ayrı bir veritabanında iki kez çalıştırılıyor…"
  BUNDLE_PSQL="psql -h $WORKDIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -d centralbee_bundle"
  psql -h "$WORKDIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q \
    -c "create database centralbee_bundle;"
  $BUNDLE_PSQL -q -f "$ROOT/supabase/tests/00_local_prelude.sql"
  $BUNDLE_PSQL -q -f "$ROOT/supabase/bundle.sql"
  printf '  ikinci çalıştırma… '
  $BUNDLE_PSQL -q -f "$ROOT/supabase/bundle.sql"
  echo "ok"
fi

echo "▸ Güvenlik testleri…"
# Each assertion reports itself with RAISE NOTICE, so notices must come through.
# Test files share one session-scoped database and run in filename order; later
# files may build on fixtures created by earlier ones.
for file in "$ROOT"/supabase/tests/[0-9]*.sql; do
  case "$(basename "$file")" in
    00_*) continue ;;  # prelude, already applied
  esac
  PGOPTIONS='--client-min-messages=notice' $PSQL -q -f "$file"
done
