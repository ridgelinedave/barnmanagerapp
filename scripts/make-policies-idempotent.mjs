#!/usr/bin/env node
/**
 * One-off maintenance helper: insert `drop policy if exists` ahead of every
 * `create policy` in the migration files.
 *
 * Postgres has no `create policy if not exists`, so a migration that is pasted
 * twice — or pasted after a partial failure — errors on the first duplicate and
 * leaves the schema half-applied. Dropping first makes each file safe to re-run,
 * which matters when migrations are applied by hand in the SQL Editor.
 *
 *   node scripts/make-policies-idempotent.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");

/** `create policy "name"\n  on public.table for ...` → capture name and table. */
const CREATE_POLICY = /^create policy "([^"]+)"\s*\n(\s*)on (\S+)/gm;

let totalAdded = 0;

for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  const path = join(migrationsDir, file);
  const original = readFileSync(path, "utf8");

  let added = 0;
  const updated = original.replace(CREATE_POLICY, (match, name, indent, table) => {
    added++;
    return `drop policy if exists "${name}" on ${table};\ncreate policy "${name}"\n${indent}on ${table}`;
  });

  if (added > 0 && updated !== original) {
    writeFileSync(path, updated);
    console.log(`${file}: guarded ${added} policy statement(s)`);
    totalAdded += added;
  } else {
    console.log(`${file}: nothing to change`);
  }
}

console.log(`\n${totalAdded} policy statement(s) are now safe to re-run.`);
