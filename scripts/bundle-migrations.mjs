/**
 * Concatenates every migration into a single file that can be pasted into the
 * Supabase SQL Editor in one go.
 *
 * The migrations remain the source of truth; `supabase/bundle.sql` is a
 * generated convenience for first-time setup and is regenerated, never edited.
 *
 *   node scripts/bundle-migrations.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");
const outputPath = join(root, "supabase", "bundle.sql");

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error("supabase/migrations altında .sql dosyası bulunamadı.");
  process.exit(1);
}

const banner = `-- =============================================================================
-- CentralBee — birleşik kurulum betiği   (OTOMATİK ÜRETİLDİ — ELLE DÜZENLEMEYİN)
--
-- \`supabase/migrations/\` altındaki ${files.length} dosyanın sırayla birleştirilmiş halidir.
-- Yeniden üretmek için:  npm run db:bundle
--
-- KULLANIM
--   Supabase → SQL Editor → New query → bu dosyanın tamamını yapıştır → Run.
--   Tek seferde çalışır; her şey ya tamamen uygulanır ya da hiç uygulanmaz.
--
-- Bu betik yalnızca yapıyı kurar. Şirket, kurum ve kullanıcı verisi
-- oluşturmaz — onları uygulamanın kendi ekranlarından girersiniz.
-- =============================================================================

begin;
`;

const body = files
  .map((name) => {
    const contents = readFileSync(join(migrationsDir, name), "utf8").trimEnd();
    return [
      "",
      "-- " + "─".repeat(74),
      `-- ▼ ${name}`,
      "-- " + "─".repeat(74),
      "",
      contents,
      "",
    ].join("\n");
  })
  .join("\n");

const footer = `
commit;

-- =============================================================================
-- Bitti. Sıradaki adım: uygulamanın /setup adresinden ilk yöneticiyi oluşturun.
-- =============================================================================
`;

writeFileSync(outputPath, banner + body + footer, "utf8");

console.log(`supabase/bundle.sql üretildi — ${files.length} göç birleştirildi:`);
for (const name of files) console.log(`  ${name}`);
