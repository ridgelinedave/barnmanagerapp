#!/usr/bin/env node
/**
 * Concatenates every migration, in filename order, into one file that can be
 * pasted into the Supabase SQL Editor in a single run.
 *
 * Generated, never hand-edited — the migration files remain the source of
 * truth. Regenerate with:
 *
 *   npm run db:combine
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");
const outPath = join(migrationsDir, "_ALL.generated.sql");

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql") && !f.startsWith("_"))
  .sort();

const banner = (text) =>
  ["", "-".repeat(79), `-- ${text}`, "-".repeat(79), ""].join("\n");

const parts = [
  `-- GENERATED FILE — do not edit. Source: supabase/migrations/*.sql`,
  `-- Regenerate with: npm run db:combine`,
  `--`,
  `-- Paste the whole thing into the Supabase SQL Editor and Run. Every`,
  `-- statement is idempotent, so re-running after a partial failure is safe.`,
  `--`,
  `-- Order applied:`,
  ...files.map((f, i) => `--   ${i + 1}. ${f}`),
  "",
];

for (const file of files) {
  parts.push(banner(`BEGIN ${file}`));
  parts.push(readFileSync(join(migrationsDir, file), "utf8").trimEnd());
  parts.push(banner(`END ${file}`));
}

writeFileSync(outPath, `${parts.join("\n")}\n`);

const lines = parts.join("\n").split("\n").length;
console.log(`Wrote supabase/migrations/_ALL.generated.sql (${files.length} migrations, ${lines} lines)`);
for (const f of files) console.log(`  - ${f}`);
