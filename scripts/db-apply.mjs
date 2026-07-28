#!/usr/bin/env node
/**
 * Applies a migration to the database over SUPABASE_DB_URL.
 *
 *   npm run db:apply -- supabase/migrations/20260728000500_timeclock.sql
 *   npm run db:apply -- --all
 *
 * Every migration in this repo is written to be idempotent, so re-applying is
 * safe and is the normal way to pick up an amended file.
 *
 * The file is sent as ONE statement batch, not split on semicolons: the
 * migrations contain dollar-quoted function bodies full of semicolons, and
 * naive splitting would tear them in half. node-postgres sends a multi-statement
 * string in an implicit transaction, so a failure rolls the whole file back.
 */
import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const connectionString = process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.error("SUPABASE_DB_URL is not set. Run via `npm run db:apply -- <file>`.");
  process.exit(1);
}

const redact = (text) => String(text).replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@");

const args = process.argv.slice(2).filter((a) => a !== "--");
if (args.length === 0) {
  console.error("Usage: npm run db:apply -- <migration.sql> | --all");
  process.exit(1);
}

const migrationsDir = join(root, "supabase", "migrations");
const files =
  args[0] === "--all"
    ? readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql") && !f.startsWith("_"))
        .sort()
        .map((f) => join(migrationsDir, f))
    : args.map((a) => (a.includes("/") || a.includes("\\") ? join(root, a) : join(migrationsDir, a)));

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

try {
  await client.connect();
} catch (error) {
  console.error(`✗ Could not connect: ${error.code ?? ""} ${redact(error.message)}`);
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const sql = readFileSync(file, "utf8");
  process.stdout.write(`applying ${basename(file)} … `);
  try {
    await client.query(sql);
    console.log("ok");
  } catch (error) {
    failed = true;
    console.log("FAILED");
    console.error(`  ${error.code ?? ""} ${error.message}`);
    if (error.position) {
      // Point at the offending statement rather than making someone count lines.
      const upto = sql.slice(0, Number(error.position));
      const line = upto.split("\n").length;
      console.error(`  at line ${line}: ${sql.split("\n")[line - 1]?.trim()}`);
    }
    break;
  }
}

await client.end();

if (failed) process.exit(1);
console.log("\n✓ Applied. Run `npm run db:verify` to check the resulting schema.");
