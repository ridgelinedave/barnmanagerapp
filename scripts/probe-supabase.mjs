#!/usr/bin/env node
/**
 * Read-only connectivity + state probe. Reports which Phase 0 objects exist and
 * whether RLS is actually enforcing. Creates nothing permanent — the one row it
 * writes to test enforcement is deleted before exit.
 *
 *   node --env-file=.env.local scripts/probe-supabase.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !secretKey) {
  console.error("Missing env. Run via: node --env-file=.env.local scripts/probe-supabase.mjs");
  process.exit(1);
}

console.log(`Project: ${url}\n`);

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TABLES = ["families", "levels", "profiles", "riders", "notifications"];

const missing = [];

console.log("Tables");
for (const table of TABLES) {
  // Must be a real row select. A `head: true` count request against a missing
  // table returns 204 with no error, which reads as a false "exists".
  const { error } = await admin.from(table).select("*").limit(1);
  if (!error) console.log(`  [x] ${table}`);
  else if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|schema cache/i.test(error.message)
  ) {
    console.log(`  [ ] ${table} — NOT CREATED`);
    missing.push(table);
  } else console.log(`  [?] ${table} — ${error.code ?? ""} ${error.message}`);
}

console.log("\nHelper functions (migration 0002)");
for (const fn of ["current_role", "current_family", "current_profile"]) {
  const { error } = await admin.rpc(fn);
  if (!error) console.log(`  [x] ${fn}()`);
  else if (error.code === "PGRST202") console.log(`  [ ] ${fn}() — NOT CREATED`);
  else console.log(`  [?] ${fn}() — ${error.code ?? ""} ${error.message}`);
}
{
  const { error } = await admin.rpc("has_permission", { perm: "manage_shows" });
  if (!error) console.log("  [x] has_permission()");
  else if (error.code === "PGRST202") console.log("  [ ] has_permission() — NOT CREATED");
  else console.log(`  [?] has_permission() — ${error.code ?? ""} ${error.message}`);
}

// ---------------------------------------------------------------------------
// Is RLS actually enforcing? Write a row with the secret key (which bypasses
// RLS) and try to read it back with the anon key (which must not see it).
// This is the only way to tell "RLS on, default deny" from "RLS never enabled"
// without catalog access — an empty table looks identical either way.
// ---------------------------------------------------------------------------
console.log("\nRLS enforcement (behavioural test)");

if (missing.includes("families")) {
  console.log("  - skipped: families does not exist yet");
} else {
  const marker = "ZZ probe row — safe to delete";
  const { data: inserted, error: insertError } = await admin
    .from("families")
    .insert({ name: marker })
    .select()
    .single();

  if (insertError) {
    console.log(`  [?] could not insert probe row: ${insertError.message}`);
  } else {
    const { data: anonRead, error: anonError } = await anon
      .from("families")
      .select("id")
      .eq("id", inserted.id);

    if (anonError) {
      console.log(`  [x] anon read refused outright (${anonError.code}) — RLS is enforcing`);
    } else if ((anonRead?.length ?? 0) === 0) {
      console.log("  [x] anon sees 0 rows — RLS is enabled and denying by default");
    } else {
      console.log("  [!] ANON CAN READ THE ROW — RLS is NOT enforcing on families.");
      console.log("      Every family's data is world-readable with the publishable key.");
    }

    const { data: anonInsert, error: anonInsertError } = await anon
      .from("families")
      .insert({ name: "ZZ anon probe" })
      .select();

    if (anonInsertError) {
      console.log(`  [x] anon insert refused (${anonInsertError.code}) — write path is closed`);
    } else if ((anonInsert?.length ?? 0) === 0) {
      console.log("  [x] anon insert filtered to zero rows — write path is closed");
    } else {
      console.log("  [!] ANON CAN INSERT — RLS is NOT enforcing writes on families.");
      await admin
        .from("families")
        .delete()
        .in("id", anonInsert.map((r) => r.id));
    }

    await admin.from("families").delete().eq("id", inserted.id);
    console.log("  - probe rows removed");
  }
}

console.log("\nAuth");
{
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) console.log(`  [ ] auth admin API — ${error.message}`);
  else {
    console.log(`  [x] auth admin API reachable — ${data.users.length} existing user(s)`);
    for (const u of data.users) console.log(`      - ${u.email}`);
  }
}
