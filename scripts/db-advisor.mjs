#!/usr/bin/env node
/**
 * Supabase Security Advisor, run from the terminal.
 *
 *   npm run db:advisor
 *
 * The dashboard's Security Advisor is a set of SQL lints published at
 * github.com/supabase/splinter (`lints/*.sql`). Each one is a view over the
 * Postgres catalog. This script runs the SECURITY-category lints directly
 * against SUPABASE_DB_URL, so the check that used to be "David remembers to
 * open the dashboard" is now part of the green gate after every migration.
 *
 * The SQL below is copied VERBATIM from splinter, minus the
 * `create view lint."…" as` wrapper. Keeping it byte-identical is the point:
 * a paraphrased lint is a lint that quietly stops matching the dashboard.
 * Re-copy from upstream if a rule changes.
 *
 * ── WHAT THIS DOES NOT COVER ──────────────────────────────────────────────
 * DATABASE advisors only. The dashboard also reports AUTH CONFIG advisors —
 * leaked-password protection, OTP expiry, MFA options, Postgres version
 * patches — which live in the Auth service configuration, not in the database,
 * and cannot be seen over a Postgres connection. Those still need a look at
 * Dashboard → Advisors → Security before a launch.
 *
 * ── ONE LINT DELIBERATELY OMITTED ─────────────────────────────────────────
 * 0029_authenticated_security_definer_function_executable warns about every
 * SECURITY DEFINER function `authenticated` may execute. This schema does that
 * ON PURPOSE for a small set of entry points (they are gated internally on
 * role — see the migrations), and for the policy helpers, which MUST be
 * callable or RLS denies everything. Including it would print a wall of
 * expected findings and train everyone to ignore the output.
 *
 * That exposure is not unguarded: `tests/policies.test.mjs` carries a standing,
 * data-driven guard that classifies EVERY function in the migrations as
 * internal / entry point / exposed-by-design and proves it behaviourally over
 * RPC. A new function that is neither revoked nor allowlisted fails the suite.
 * 0028 (the `anon` half) IS run here, because nothing in this app should ever
 * be executable signed-out.
 */
import pg from "pg";

const connectionString = process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.error("SUPABASE_DB_URL is not set. Run via `npm run db:advisor` (loads .env.local).");
  process.exit(1);
}

const redact = (text) => String(text).replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@");

/**
 * The lints, verbatim from github.com/supabase/splinter/lints.
 *
 * `level` is splinter's own severity. ERROR and WARN both fail this script:
 * on a schema this small there is no such thing as an acceptable security
 * warning, and "we always have three warnings" is how a real one hides.
 */
const LINTS = [
  {
    id: "0013_rls_disabled_in_public",
    sql: `
select
    format(
        'Table \`%s.%s\` is public, but RLS has not been enabled.',
        n.nspname,
        c.relname
    ) as detail,
    'ERROR' as level
from
    pg_catalog.pg_class c
    join pg_catalog.pg_namespace n
        on c.relnamespace = n.oid
where
    c.relkind = 'r' -- regular tables
    -- RLS is disabled
    and not c.relrowsecurity
    and (
        pg_catalog.has_table_privilege('anon', c.oid, 'SELECT')
        or pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT')
    )
    and n.nspname = any(array(select trim(unnest(string_to_array(coalesce(current_setting('pgrst.db_schemas', 't'), 'public'), ',')))))
    and n.nspname not in (
        '_timescaledb_cache', '_timescaledb_catalog', '_timescaledb_config', '_timescaledb_internal', 'auth', 'cron', 'extensions', 'graphql', 'graphql_public', 'information_schema', 'net', 'pgmq', 'pgroonga', 'pgsodium', 'pgsodium_masks', 'pgtle', 'pgbouncer', 'pg_catalog', 'realtime', 'repack', 'storage', 'supabase_functions', 'supabase_migrations', 'tiger', 'topology', 'vault'
    )`,
  },
  {
    id: "0007_policy_exists_rls_disabled",
    sql: `
select
    format(
        'Table \`%s.%s\` has RLS policies but RLS is not enabled on the table. Policies include %s.',
        n.nspname,
        c.relname,
        array_agg(p.polname order by p.polname)
    ) as detail,
    'ERROR' as level
from
    pg_catalog.pg_policy p
    join pg_catalog.pg_class c
        on p.polrelid = c.oid
    join pg_catalog.pg_namespace n
        on c.relnamespace = n.oid
    left join pg_catalog.pg_depend dep
        on c.oid = dep.objid
        and dep.deptype = 'e'
        and dep.classid = 'pg_catalog.pg_class'::regclass
where
    c.relkind = 'r' -- regular tables
    and n.nspname not in (
        '_timescaledb_cache', '_timescaledb_catalog', '_timescaledb_config', '_timescaledb_internal', 'auth', 'cron', 'extensions', 'graphql', 'graphql_public', 'information_schema', 'net', 'pgmq', 'pgroonga', 'pgsodium', 'pgsodium_masks', 'pgtle', 'pgbouncer', 'pg_catalog', 'realtime', 'repack', 'storage', 'supabase_functions', 'supabase_migrations', 'tiger', 'topology', 'vault'
    )
    -- RLS is disabled
    and not c.relrowsecurity
    and dep.objid is null -- exclude tables owned by extensions
group by
    n.nspname,
    c.relname`,
  },
  {
    id: "0008_rls_enabled_no_policy",
    sql: `
select
    format(
        'Table \`%s.%s\` has RLS enabled, but no policies exist',
        n.nspname,
        c.relname
    ) as detail,
    'INFO' as level
from
    pg_catalog.pg_class c
    left join pg_catalog.pg_policy p
        on p.polrelid = c.oid
    join pg_catalog.pg_namespace n
        on c.relnamespace = n.oid
    left join pg_catalog.pg_depend dep
        on c.oid = dep.objid
        and dep.deptype = 'e'
        and dep.classid = 'pg_catalog.pg_class'::regclass
where
    c.relkind = 'r' -- regular tables
    and n.nspname not in (
        '_timescaledb_cache', '_timescaledb_catalog', '_timescaledb_config', '_timescaledb_internal', 'auth', 'cron', 'extensions', 'graphql', 'graphql_public', 'information_schema', 'net', 'pgmq', 'pgroonga', 'pgsodium', 'pgsodium_masks', 'pgtle', 'pgbouncer', 'pg_catalog', 'realtime', 'repack', 'storage', 'supabase_functions', 'supabase_migrations', 'tiger', 'topology', 'vault'
    )
    -- RLS is enabled
    and c.relrowsecurity
    and p.polname is null
    and dep.objid is null -- exclude tables owned by extensions
group by
    n.nspname,
    c.relname`,
  },
  {
    id: "0010_security_definer_view",
    sql: `
select
    format(
        'View \`%s.%s\` is defined with the SECURITY DEFINER property',
        n.nspname,
        c.relname
    ) as detail,
    'ERROR' as level
from
    pg_catalog.pg_class c
    join pg_catalog.pg_namespace n
        on n.oid = c.relnamespace
    left join pg_catalog.pg_depend dep
        on c.oid = dep.objid
        and dep.deptype = 'e'
        and dep.classid = 'pg_catalog.pg_class'::regclass
where
    c.relkind = 'v'
    and (
        pg_catalog.has_table_privilege('anon', c.oid, 'SELECT')
        or pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT')
    )
    and substring(pg_catalog.version() from 'PostgreSQL ([0-9]+)') >= '15' -- security invoker was added in pg15
    and n.nspname = any(array(select trim(unnest(string_to_array(coalesce(current_setting('pgrst.db_schemas', 't'), 'public'), ',')))))
    and n.nspname not in (
        '_timescaledb_cache', '_timescaledb_catalog', '_timescaledb_config', '_timescaledb_internal', 'auth', 'cron', 'extensions', 'graphql', 'graphql_public', 'information_schema', 'net', 'pgmq', 'pgroonga', 'pgsodium', 'pgsodium_masks', 'pgtle', 'pgbouncer', 'pg_catalog', 'realtime', 'repack', 'storage', 'supabase_functions', 'supabase_migrations', 'tiger', 'topology', 'vault'
    )
    and dep.objid is null -- exclude views owned by extensions
    and not (
        lower(coalesce(c.reloptions::text,'{}'))::text[]
        && array[
            'security_invoker=1',
            'security_invoker=true',
            'security_invoker=yes',
            'security_invoker=on'
        ]
    )`,
  },
  {
    id: "0011_function_search_path_mutable",
    sql: `
select
    format(
        'Function \`%s.%s\` has a role mutable search_path',
        n.nspname,
        p.proname
    ) as detail,
    'WARN' as level
from
    pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n
        on p.pronamespace = n.oid
    left join pg_catalog.pg_depend dep
        on p.oid = dep.objid
        and dep.deptype = 'e'
        and dep.classid = 'pg_catalog.pg_proc'::regclass
where
    n.nspname not in (
        '_timescaledb_cache', '_timescaledb_catalog', '_timescaledb_config', '_timescaledb_internal', 'auth', 'cron', 'extensions', 'graphql', 'graphql_public', 'information_schema', 'net', 'pgmq', 'pgroonga', 'pgsodium', 'pgsodium_masks', 'pgtle', 'pgbouncer', 'pg_catalog', 'realtime', 'repack', 'storage', 'supabase_functions', 'supabase_migrations', 'tiger', 'topology', 'vault'
    )
    and dep.objid is null -- exclude functions owned by extensions
    -- Search path not set
    and not exists (
        select 1
        from unnest(coalesce(p.proconfig, '{}')) as config
        where config like 'search_path=%'
    )`,
  },
  {
    id: "0002_auth_users_exposed",
    sql: `
select
    format(
        'View/Materialized View "%s" in the public schema may expose \`auth.users\` data to anon or authenticated roles.',
        c.relname
    ) as detail,
    'ERROR' as level
from
    pg_catalog.pg_class auth_users_pg_class
    join pg_catalog.pg_namespace auth_users_pg_namespace
        on auth_users_pg_class.relnamespace = auth_users_pg_namespace.oid
        and auth_users_pg_class.relname = 'users'
        and auth_users_pg_namespace.nspname = 'auth'
    join pg_catalog.pg_depend d
        on d.refobjid = auth_users_pg_class.oid
    join pg_catalog.pg_rewrite r
        on r.oid = d.objid
    join pg_catalog.pg_class c
        on c.oid = r.ev_class
    join pg_catalog.pg_namespace n
        on n.oid = c.relnamespace
    join pg_catalog.pg_class pg_class_auth_users
        on d.refobjid = pg_class_auth_users.oid
where
    d.deptype = 'n'
    and (
      pg_catalog.has_table_privilege('anon', c.oid, 'SELECT')
      or pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT')
    )
    and n.nspname = any(array(select trim(unnest(string_to_array(coalesce(current_setting('pgrst.db_schemas', 't'), 'public'), ',')))))
    and c.relname <> '0002_auth_users_exposed'
    and
    (
        (c.relkind in ('m'))
        or
        (
            c.relkind = 'v'
            and not (
                lower(coalesce(c.reloptions::text,'{}'))::text[]
                && array[
                    'security_invoker=1',
                    'security_invoker=true',
                    'security_invoker=yes',
                    'security_invoker=on'
                ]
            )
        )
        or
        (
            c.relkind in ('v')
            and (
                lower(coalesce(c.reloptions::text,'{}'))::text[]
                && array[
                    'security_invoker=1',
                    'security_invoker=true',
                    'security_invoker=yes',
                    'security_invoker=on'
                ]
            )
            and not pg_class_auth_users.relrowsecurity
        )
    )
group by
    n.nspname,
    c.relname,
    c.oid`,
  },
  {
    id: "0028_anon_security_definer_function_executable",
    sql: `
select
    format(
        'Function \`%s.%s(%s)\` can be executed by the \`anon\` role as a \`SECURITY DEFINER\` function via \`/rest/v1/rpc/%s\`. Revoke \`EXECUTE\` or switch it to \`SECURITY INVOKER\` if that is not intentional.',
        schema_name,
        function_name,
        function_args,
        function_name
    ) as detail,
    'WARN' as level
from
    (
        select
            n.nspname as schema_name,
            p.proname as function_name,
            pg_catalog.pg_get_function_identity_arguments(p.oid) as function_args
        from
            pg_catalog.pg_proc p
            join pg_catalog.pg_namespace n
                on p.pronamespace = n.oid
            join pg_catalog.pg_language l
                on p.prolang = l.oid
        where
            p.prosecdef = true
            and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
            and n.nspname = any(array(select trim(unnest(string_to_array(coalesce(current_setting('pgrst.db_schemas', 't'), 'public'), ',')))))
            and n.nspname not in (
                '_timescaledb_cache', '_timescaledb_catalog', '_timescaledb_config', '_timescaledb_internal', 'auth', 'cron', 'extensions', 'graphql', 'graphql_public', 'information_schema', 'net', 'pgmq', 'pgroonga', 'pgsodium', 'pgsodium_masks', 'pgtle', 'pgbouncer', 'pg_catalog', 'realtime', 'repack', 'storage', 'supabase_functions', 'supabase_migrations', 'tiger', 'topology', 'vault'
            )
    ) exposed_functions
order by
    schema_name,
    function_name,
    function_args`,
  },
  {
    // Needs `splinter.public_buckets`, which the dashboard sets for the lint.
    // We set it below from storage.buckets, so this runs the same way here.
    id: "0025_public_bucket_allows_listing",
    sql: `
with public_buckets as (
    select
        bucket->>'bucket_id' as bucket_id,
        bucket->>'bucket_name' as bucket_name
    from pg_catalog.jsonb_array_elements(
        coalesce(
            nullif(pg_catalog.current_setting('splinter.public_buckets', true), '')::pg_catalog.jsonb,
            '[]'::pg_catalog.jsonb
        )
    ) as buckets(bucket)
),
matching_policies as (
    select
        b.bucket_id,
        b.bucket_name,
        p.policyname
    from
        public_buckets b
        join pg_catalog.pg_policies p
            on p.schemaname = 'storage'
            and p.tablename = 'objects'
            and p.cmd in ('SELECT', 'ALL')
            and p.permissive = 'PERMISSIVE'
            and p.roles && array['public'::name, 'anon'::name, 'authenticated'::name]
    where
        (
            p.qual is null
            or replace(replace(replace(lower(p.qual), ' ', ''), E'\\n', ''), E'\\t', '')
                in ('true', '(true)', '1=1', '(1=1)')
            or exists (
                select
                    1
                from
                    pg_catalog.regexp_match(
                        p.qual,
                        $re$\\A\\s*\\(*\\s*bucket_id\\s*=\\s*('(?:[^']|'')*')(\\s*::\\s*[[:alnum:]_\\.]+)?\\s*\\)*\\s*\\Z$re$,
                        'i'
                    ) as bucket_match(matches)
                where
                    bucket_match.matches[1] = '''' || replace(b.bucket_id, '''', '''''') || ''''
            )
        )
),
affected_buckets as (
    select
        bucket_id,
        bucket_name,
        array_agg(policyname order by policyname) as policy_names,
        count(*)::int as policy_count
    from
        matching_policies
    group by
        bucket_id,
        bucket_name
)
select
    format(
        'Public bucket \`%s\` has %s broad SELECT %s on \`storage.objects\` (%s), allowing clients to list all files.',
        bucket_name,
        policy_count,
        case when policy_count = 1 then 'policy' else 'policies' end,
        array_to_string(policy_names, ', ')
    ) as detail,
    'WARN' as level
from
    affected_buckets
order by
    bucket_id`,
  },
];

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

console.log("Supabase Security Advisor (splinter lints, DB-level)\n");

// The bucket-listing lint reads its input from a GUC the dashboard populates.
// Supply it the same way, so the lint behaves here as it does there.
try {
  const { rows } = await client.query(
    `select coalesce(jsonb_agg(jsonb_build_object('bucket_id', id, 'bucket_name', name)), '[]'::jsonb) as buckets
       from storage.buckets where public`,
  );
  await client.query("select set_config('splinter.public_buckets', $1, false)", [
    JSON.stringify(rows[0]?.buckets ?? []),
  ]);
} catch {
  // Storage not installed on this project; the lint then sees an empty list.
  await client.query("select set_config('splinter.public_buckets', '[]', false)");
}

const findings = [];
let failedLints = 0;

for (const lint of LINTS) {
  let rows = [];
  try {
    ({ rows } = await client.query(lint.sql));
  } catch (error) {
    failedLints++;
    console.log(`  [!] ${lint.id} — could not run: ${error.message}`);
    continue;
  }

  if (rows.length === 0) {
    console.log(`  [x] ${lint.id}`);
    continue;
  }

  console.log(`  [!] ${lint.id} — ${rows.length} finding(s)`);
  for (const row of rows) {
    findings.push({ lint: lint.id, level: row.level, detail: row.detail });
    console.log(`        ${row.level}: ${row.detail}`);
  }
}

await client.end();

console.log("");

if (failedLints > 0) {
  console.error(`✗ ${failedLints} lint(s) could not be evaluated. Treat that as a failure.`);
  process.exit(1);
}

if (findings.length > 0) {
  console.error(`✗ ${findings.length} security finding(s) across ${LINTS.length} lints.`);
  console.error("  Fix them, or add a documented exception here with the reason.");
  process.exit(1);
}

console.log(`✓ Clean — ${LINTS.length} security lints, no findings.`);
console.log("  Auth-config advisors (leaked passwords, OTP expiry, MFA, PG version)");
console.log("  are NOT covered here — check Dashboard → Advisors → Security before launch.");
