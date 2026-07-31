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

/**
 * EVERY table the migrations create — not a sample.
 *
 * This list was the Phase 0 five for three phases, which meant `db:verify`
 * printed "Schema matches the migrations. Nothing to fix." while never once
 * looking at whether RLS was on for announcements, tasks, lessons or punches.
 * A verifier that is silent about most of the schema is worse than no verifier,
 * because it reports confidence it has not earned.
 *
 * ADD EVERY NEW TABLE HERE IN THE SAME COMMIT THAT CREATES IT. The sweep below
 * fails on any public table missing from this list, so forgetting is loud.
 */
const EXPECTED_TABLES = [
  // Phase 0 — core identity.
  "families",
  "levels",
  "notifications",
  "profiles",
  "riders",
  // Phase 1 — announcements, tasks, scheduling, backfill, time clock.
  "announcements",
  "task_templates",
  "tasks",
  "lesson_templates",
  "lesson_instances",
  "lesson_riders",
  "backfill_offers",
  "punches",
  "pay_periods",
  "timesheet_approvals",
  // Phase 2 slice 1 — horses.
  "horses",
  "horse_riders",
  "feed_plans",
  // Phase 2 slice 2 — care.
  "care_events",
  // Phase 2 slice 4 — onboarding forms.
  "form_templates",
  "form_submissions",
  // Phase 2 slice 5 — events and calendar subscriptions.
  "events",
  "ical_tokens",
];

/**
 * Tables whose migration is WRITTEN AND AUDITED-PENDING, not yet applied.
 *
 * A table is checked exactly as strictly as any other the moment it exists —
 * RLS on, policies present — but its absence is reported as "pending" instead
 * of failing. Without this a written-but-unapplied migration has no safe state:
 * listing it fails the verifier now, and not listing it fails the verifier the
 * instant it is applied, because an unlisted table is a failure.
 *
 * Move the entry up into EXPECTED_TABLES once it is applied and this line is
 * just noise.
 */
const PENDING_TABLES = {
  // Phase 2 provisioning slice — migration 0017, awaiting David's audit.
  invites: "migration 0017 (invites) has not been applied yet",
};
const EXPECTED_FUNCTIONS = [
  "current_role",
  "current_family",
  "current_profile",
  "has_permission",
  "profiles_guard_privileged_columns",
  // Phase 2 slice 1. horses_basics() is the column boundary for the basics
  // tier, so a mutable search_path on it would be a way around that boundary.
  "family_owns_horse",
  "family_rides_horse",
  "horses_basics",
  // Phase 2 slice 2 — care.
  "care_events_guard_insert",
  "enqueue_care_due_digest",
  // Phase 2 slices 3–4.
  "family_may_read_document",
  "form_submissions_guard",
  "ensure_family_onboarding",
  // Phase 2 slice 5.
  "ical_token_guard",
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

  // The other direction: a table that exists but nobody listed. Previously
  // this was printed as a note and ignored, which is how the Phase 1 tables
  // went unchecked for three phases. It is now a problem.
  // A pending table is checked as strictly as any other once it exists.
  for (const [table, why] of Object.entries(PENDING_TABLES)) {
    const row = found.get(table);
    if (!row) {
      console.log(`  [ ] ${table.padEnd(14)} pending — ${why}`);
      continue;
    }
    console.log(
      `  [${row.rls_enabled ? "x" : "!"}] ${table.padEnd(14)} ${row.rls_enabled ? "RLS on" : "RLS OFF"}, ${row.policy_count} policies`,
    );
    if (!row.rls_enabled) flag(`${table} has RLS DISABLED — every row is readable.`);
    if (row.policy_count === 0) flag(`${table} has RLS on but NO policies — nothing is reachable.`);
  }

  const known = [...EXPECTED_TABLES, ...Object.keys(PENDING_TABLES)];
  const unlisted = rows.map((r) => r.table_name).filter((t) => !known.includes(t));
  for (const table of unlisted) {
    const row = found.get(table);
    flag(
      `${table} exists in public but is not in EXPECTED_TABLES — add it, so its RLS is checked ` +
        `(currently ${row.rls_enabled ? "RLS on" : "RLS OFF"}, ${row.policy_count} policies).`,
    );
  }
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

  // And the same check over EVERY definer function, named or not. The list
  // above catches a function that has gone missing; this catches one that was
  // added without anyone updating the list — including trigger functions,
  // which are just as dangerous with a mutable search_path.
  const definers = rows.filter((r) => r.security_definer);
  const unpinned = definers.filter((r) => !r.config.includes("search_path"));
  console.log(
    `  — ${definers.length} SECURITY DEFINER function(s), ${definers.length - unpinned.length} with a pinned search_path`,
  );
  for (const row of unpinned) {
    flag(`${row.proname}() is SECURITY DEFINER with a mutable search_path — privilege-escalation risk.`);
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

// --- storage -----------------------------------------------------------------
//
// Table RLS says nothing about Storage: it is a separate schema with its own
// table and its own policies, and a bucket marked public is readable by anyone
// with the URL, with no policy evaluated at all. So the bucket flag is checked
// here, at the catalog, as well as behaviourally in the policy suite.
console.log("\nStorage");
{
  const { rows: buckets } = await client.query(
    `select id, public from storage.buckets where id = 'documents'`,
  );

  if (buckets.length === 0) {
    flag("the `documents` bucket does not exist — apply migration 0012.");
  } else {
    const isPublic = buckets[0].public;
    console.log(`  [${isPublic ? "!" : "x"}] bucket documents — ${isPublic ? "PUBLIC" : "private"}`);
    if (isPublic) {
      flag("the `documents` bucket is PUBLIC — every file in it is readable by URL.");
    }
  }

  const { rows: rls } = await client.query(
    `select c.relrowsecurity as enabled
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'storage' and c.relname = 'objects'`,
  );
  if (!rls[0]?.enabled) flag("storage.objects has RLS DISABLED — every object is readable.");
  else console.log("  [x] storage.objects RLS on");

  const { rows: policies } = await client.query(
    `select policyname, cmd, roles::text, qual, with_check
       from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname like 'documents:%'
      order by cmd, policyname`,
  );
  for (const row of policies) {
    console.log(`  ${row.cmd.padEnd(6)} ${row.roles.padEnd(17)} ${row.policyname}`);
    if (!row.roles.includes("authenticated")) {
      flag(`storage policy "${row.policyname}" is not scoped to authenticated.`);
    }
    // A documents policy that forgot its bucket predicate would apply to every
    // other bucket in the project.
    const body = `${row.qual ?? ""} ${row.with_check ?? ""}`;
    if (!body.includes("'documents'")) {
      flag(`storage policy "${row.policyname}" does not pin bucket_id = 'documents'.`);
    }
  }
  if (policies.length < 4) {
    flag(`only ${policies.length} documents policies found — expected 4 (select/insert/update/delete).`);
  } else {
    console.log(`  — ${policies.length} documents policies`);
  }
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
