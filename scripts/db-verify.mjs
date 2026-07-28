#!/usr/bin/env node
/**
 * Direct Postgres connection check + schema introspection.
 *
 * Uses SUPABASE_DB_URL (superuser-ish `postgres` role) purely to READ the
 * catalog and confirm the migrations landed as written — which tables exist,
 * whether RLS is genuinely enabled on each, which policies are attached, which
 * helper functions exist and whether their search_path is pinned.
 *
 * It applies nothing. Migrations are applied via the SQL Editor or the CLI.
 *
 *   npm run db:verify
 */
import pg from "pg";

const connectionString = process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.error("SUPABASE_DB_URL is not set. Run via `npm run db:verify` (loads .env.local).");
  process.exit(1);
}

/** Never print the password, even in an error path. */
const redact = (text) => String(text).replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@");

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

const EXPECTED_TABLES = ["families", "levels", "notifications", "profiles", "riders"];
const EXPECTED_FUNCTIONS = [
  "current_role",
  "current_family",
  "current_profile",
  "has_permission",
  "profiles_guard_privileged_columns",
];

let problems = 0;
const flag = (message) => {
  problems++;
  console.log(`  [!] ${message}`);
};

try {
  await client.connect();
} catch (error) {
  console.error("✗ Could not connect to the database.\n");
  console.error(`  host: ${redact(connectionString).split("@")[1] ?? "(unknown)"}`);
  console.error(`  code: ${error.code ?? "(none)"}`);
  console.error(`  message: ${redact(error.message)}`);
  const ipv6ish = ["ENETUNREACH", "EHOSTUNREACH", "ETIMEDOUT", "ENOTFOUND", "ECONNREFUSED"];
  if (ipv6ish.includes(error.code)) {
    console.error(
      "\n  The direct `db.<ref>.supabase.co` host is IPv6-only on current Supabase projects.\n" +
        "  If this machine has no IPv6 route, swap SUPABASE_DB_URL for the Session pooler URI\n" +
        "  (Dashboard → Connect → Session pooler), which is IPv4. Same password.",
    );
  }
  process.exit(1);
}

console.log("✓ Connected.\n");

{
  const { rows } = await client.query("select current_database() db, version() v");
  console.log(`  database: ${rows[0].db}`);
  console.log(`  server:   ${rows[0].v.split(" ").slice(0, 2).join(" ")}\n`);
}

// --- tables + RLS ------------------------------------------------------------
console.log("Tables and RLS");
{
  const { rows } = await client.query(
    `select c.relname               as table_name,
            c.relrowsecurity        as rls_enabled,
            c.relforcerowsecurity   as rls_forced,
            (select count(*) from pg_policies p
              where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname`,
  );

  const found = new Map(rows.map((r) => [r.table_name, r]));

  for (const table of EXPECTED_TABLES) {
    const row = found.get(table);
    if (!row) {
      flag(`${table} — MISSING`);
      continue;
    }
    const rls = row.rls_enabled ? "RLS on" : "RLS OFF";
    console.log(`  [${row.rls_enabled ? "x" : "!"}] ${table.padEnd(14)} ${rls}, ${row.policy_count} policies`);
    if (!row.rls_enabled) flag(`${table} has RLS DISABLED — every row is readable.`);
    if (row.policy_count === 0) flag(`${table} has RLS on but NO policies — nothing is reachable.`);
  }

  const extra = rows.map((r) => r.table_name).filter((t) => !EXPECTED_TABLES.includes(t));
  if (extra.length) console.log(`  (other tables in public: ${extra.join(", ")})`);
}

// --- policies ----------------------------------------------------------------
console.log("\nPolicies");
{
  const { rows } = await client.query(
    `select tablename, policyname, cmd, roles::text
       from pg_policies
      where schemaname = 'public'
      order by tablename, cmd, policyname`,
  );
  for (const row of rows) {
    console.log(`  ${row.tablename.padEnd(14)} ${row.cmd.padEnd(6)} ${row.roles.padEnd(17)} ${row.policyname}`);
    if (!row.roles.includes("authenticated")) {
      flag(`policy "${row.policyname}" is not scoped to authenticated (roles=${row.roles}).`);
    }
  }
  console.log(`  — ${rows.length} policies total`);
}

// --- functions ---------------------------------------------------------------
console.log("\nFunctions");
{
  const { rows } = await client.query(
    `select p.proname,
            p.prosecdef                       as security_definer,
            coalesce(array_to_string(p.proconfig, ', '), '') as config
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
      order by p.proname`,
  );
  const found = new Map(rows.map((r) => [r.proname, r]));

  for (const fn of EXPECTED_FUNCTIONS) {
    const row = found.get(fn);
    if (!row) {
      flag(`${fn}() — MISSING`);
      continue;
    }
    const pinned = row.config.includes("search_path");
    console.log(
      `  [${row.security_definer && pinned ? "x" : "!"}] ${fn}()`.padEnd(44) +
        `${row.security_definer ? "SECURITY DEFINER" : "invoker"}, ${pinned ? row.config : "search_path NOT PINNED"}`,
    );
    if (row.security_definer && !pinned) {
      flag(`${fn}() is SECURITY DEFINER with a mutable search_path — privilege-escalation risk.`);
    }
  }
}

// --- triggers ----------------------------------------------------------------
console.log("\nTriggers");
{
  const { rows } = await client.query(
    `select t.tgname, c.relname
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal
      order by c.relname, t.tgname`,
  );
  if (rows.length === 0) flag("no triggers found — the profiles privilege guard is missing.");
  for (const row of rows) console.log(`  [x] ${row.relname}.${row.tgname}`);
}

// --- column grants -----------------------------------------------------------
console.log("\nColumn grants on notifications (authenticated)");
{
  const { rows } = await client.query(
    `select column_name, privilege_type
       from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'notifications'
        and grantee = 'authenticated' and privilege_type = 'UPDATE'
      order by column_name`,
  );
  const cols = rows.map((r) => r.column_name);
  if (cols.length === 1 && cols[0] === "read_at") {
    console.log("  [x] UPDATE granted on read_at only");
  } else {
    flag(`UPDATE granted on: ${cols.join(", ") || "(none)"} — expected read_at only.`);
  }
}

await client.end();

console.log(
  problems === 0
    ? "\n✓ Schema matches the migrations. Nothing to fix."
    : `\n✗ ${problems} problem(s) found — see the [!] lines above.`,
);
process.exit(problems === 0 ? 0 : 1);
