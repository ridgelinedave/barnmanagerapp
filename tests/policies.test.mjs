#!/usr/bin/env node
/**
 * RLS policy test suite (Phase 0).
 *
 * Two parts, deliberately separated:
 *
 *   PART 1 — ALLOW: for each role fixture, the exact rows that must be visible.
 *   PART 2 — DENY (adversarial): the reads and writes each role must NOT have.
 *
 * Part 2 is the part that matters. A suite that only checks the happy path
 * passes just as happily against a table with RLS switched off — every allow
 * assertion still succeeds, because "can see it" is true when everyone can see
 * everything. Only the deny cases can tell a working policy from an absent one.
 *
 * Everything here runs through the ANON key with a real signed-in session, i.e.
 * exactly what a browser gets. The service role key is never used, on purpose:
 * a test that bypasses RLS proves nothing about RLS.
 *
 * Prerequisites: migrations applied, `npm run db:seed` run (Part 2 of the
 * README). Run against a development project only — the deny tests deliberately
 * attempt destructive writes, which are expected to be refused. If a policy is
 * broken, a delete may actually land; re-run `npm run db:seed` to restore.
 *
 * Run:  npm run test:policies
 */
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * A direct connection, used by ONE section — the at-least-one-admin guard.
 *
 * That section tests a TRIGGER, not a policy, and it needs a transaction it
 * can roll back so it never touches a real account. PostgREST gives no
 * transaction control, so it cannot be done through the anon client. Required
 * rather than optional: a missing URL must fail loudly, because a section that
 * quietly skips itself is a guard nobody notices has stopped running.
 */
const DB_URL = process.env.SUPABASE_DB_URL;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}
if (!DB_URL) {
  console.error(
    "Missing SUPABASE_DB_URL — the at-least-one-admin guard needs a transaction it can roll back.",
  );
  process.exit(1);
}
if (SUPABASE_URL.includes("placeholder") || ANON_KEY.includes("placeholder")) {
  console.error(
    "Refusing to run: .env.local still holds placeholder values. Connect Supabase first (README → Part 2).",
  );
  process.exit(1);
}

let fixtures;
try {
  fixtures = JSON.parse(readFileSync(join(root, "supabase", "seed", "seed-output.json"), "utf8"));
} catch {
  console.error(
    "supabase/seed/seed-output.json not found. Run `npm run db:seed` before the policy tests.",
  );
  process.exit(1);
}

// -----------------------------------------------------------------------------
// Tiny assertion harness — no test-runner dependency.
// -----------------------------------------------------------------------------
let passed = 0;
let skipped = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Sign in as a fixture and return a client carrying that session. */
async function clientFor(key) {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  if (key === "anon") return client;

  const { email } = fixtures.users[key];
  const { error } = await client.auth.signInWithPassword({ email, password: fixtures.password });
  if (error) {
    console.error(`\nCould not sign in as ${email}: ${error.message}`);
    console.error("Re-run `npm run db:seed` — the fixture password may have rotated.");
    process.exit(1);
  }
  return client;
}

/** Row ids visible to this client for a table. */
async function visibleIds(client, table) {
  const { data, error } = await client.from(table).select("id");
  if (error) return { error: error.message, ids: [] };
  return { error: null, ids: data.map((row) => row.id) };
}

/**
 * True when a write was refused — either rejected outright (a policy or trigger
 * raised) or silently filtered to zero affected rows (RLS matched nothing).
 * Both are correct refusals; PostgREST reports them differently.
 */
async function writeRefused(promise) {
  const { data, error } = await promise;
  if (error) return true;
  return !data || (Array.isArray(data) && data.length === 0);
}

/** Describes HOW a write was refused, for the failure output. */
async function refusalMode(promise) {
  const { data, error } = await promise;
  if (error) return `rejected: ${error.code ?? ""} ${error.message}`.trim();
  if (!data || data.length === 0) return "filtered to zero rows";
  return `ALLOWED — ${data.length} row(s) affected`;
}

// -----------------------------------------------------------------------------
// Function-exposure inventory, parsed from the migrations.
//
// PostgREST publishes EVERY function in `public` as an RPC endpoint, and
// Postgres grants EXECUTE to PUBLIC by default — and on Supabase, separately to
// anon and authenticated. So a helper written as an internal primitive is a
// public API unless it is explicitly revoked from all three. That mistake
// already shipped once here: backfill_book_rider() was callable by any parent
// and really did seat a rider.
//
// Rather than one hand-written assertion per primitive, this reads the
// migrations, works out what each function was INTENDED to be, and then proves
// it behaviourally over RPC. A function added in a later migration that is
// neither revoked nor allowlisted fails the suite, which forces the decision to
// be made rather than defaulted.
// -----------------------------------------------------------------------------

/**
 * Functions that are exposed on purpose and need no gate: read-only, scoped to
 * the caller, and required by RLS policies (a policy calling a function the
 * user cannot execute would deny everything).
 */
const EXPOSED_BY_DESIGN = new Set([
  "current_role",
  "current_family",
  "current_profile",
  "has_permission",
  "family_sees_instance",
  "family_owns_rider",
  "instance_taken_seats",
  // Phase 2 slice 1. Policy helpers, so they MUST stay callable by
  // authenticated — an RLS policy is evaluated as the querying user, and a
  // user who cannot execute the helper is denied the table entirely. Both
  // answer only about the caller's own family (no family argument exists to
  // pass), and both return false when current_family() is null, which is every
  // staff, admin and signed-out caller.
  "family_owns_horse",
  "family_rides_horse",
  // Phase 2 slice 3. Policy helper for storage.objects — same reasoning: the
  // policy is evaluated as the querying user, so it must stay callable, and it
  // answers only about the caller's own family.
  "family_may_read_document",
]);

/** Reads the balanced parenthesised argument list starting at `open`. */
function readArgList(sql, open) {
  let depth = 0;
  for (let i = open; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") {
      depth--;
      if (depth === 0) return { text: sql.slice(open + 1, i), end: i };
    }
  }
  return { text: "", end: open };
}

/** "a uuid, b text default 'x'" → ["a", "b"], respecting nested parens. */
function argNames(argText) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of argText) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  if (current.trim()) parts.push(current);
  return parts
    .map((part) => part.trim().split(/\s+/)[0])
    .filter((name) => name && /^[a-z_][a-z0-9_]*$/i.test(name));
}

function parseMigrationFunctions() {
  const dir = join(root, "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("_"))
    .sort();
  const sql = files.map((f) => readFileSync(join(dir, f), "utf8")).join("\n");

  const functions = new Map();

  // Declarations.
  const declRe = /create\s+or\s+replace\s+function\s+public\.(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s*\(/gi;
  let match;
  while ((match = declRe.exec(sql)) !== null) {
    const name = match[1] ?? match[2];
    const open = declRe.lastIndex - 1;
    const { text, end } = readArgList(sql, open);
    const after = sql.slice(end + 1, end + 60);
    const returns = /returns\s+(?:table|setof\s+)?(\w+)/i.exec(after)?.[1]?.toLowerCase() ?? "";

    functions.set(name, {
      name,
      args: argNames(text),
      returnsTrigger: returns === "trigger",
      revokedFrom: functions.get(name)?.revokedFrom ?? new Set(),
      grantedTo: functions.get(name)?.grantedTo ?? new Set(),
    });
  }

  // Revokes and grants. Later statements win, which matches apply order.
  const revokeRe =
    /revoke\s+all\s+on\s+function\s+public\.(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s*\([^)]*\)\s*from\s+([^;]+);/gi;
  while ((match = revokeRe.exec(sql)) !== null) {
    const name = match[1] ?? match[2];
    const roles = match[3].split(",").map((r) => r.trim().toLowerCase());
    const entry = functions.get(name);
    if (entry) for (const role of roles) entry.revokedFrom.add(role);
  }

  const grantRe =
    /grant\s+execute\s+on\s+function\s+public\.(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s*\([^)]*\)\s*to\s+([^;]+);/gi;
  while ((match = grantRe.exec(sql)) !== null) {
    const name = match[1] ?? match[2];
    const roles = match[3].split(",").map((r) => r.trim().toLowerCase());
    const entry = functions.get(name);
    if (entry) for (const role of roles) entry.grantedTo.add(role);
  }

  return [...functions.values()];
}

/**
 * Did this RPC call bounce off the function's EXECUTE privilege, rather than
 * running and rejecting the caller on its own terms?
 *
 * The distinction is the whole point: a domain error like "that lesson no
 * longer exists" proves the function EXECUTED, which for an internal primitive
 * is a failure even though an error came back.
 */
function blockedAtTheDoor(error) {
  if (!error) return false;
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  // PGRST202: not in the exposed schema cache. 42883: no such function.
  if (code === "PGRST202" || code === "42883") return true;
  return code === "42501" && message.includes("permission denied for function");
}

/** Asserts a specific row id is invisible to this client. */
async function assertCannotSee(name, client, table, id) {
  const { data, error } = await client.from(table).select("id").eq("id", id);
  check(name, !error && (data?.length ?? 0) === 0, error?.message ?? `saw ${data?.length} row(s)`);
}

// -----------------------------------------------------------------------------
async function main() {
  console.log(`Policy tests against ${SUPABASE_URL}\n`);

  const anon = await clientFor("anon");
  const admin = await clientFor("admin");
  const staff = await clientFor("staff");
  const parent = await clientFor("parent");
  // The control family's own login. Null only when seed-output.json predates
  // this fixture, which the horses section reports as a skip rather than
  // quietly testing one direction and calling it symmetry.
  const parent2 = fixtures.users?.parent2 ? await clientFor("parent2") : null;

  const { familyId, controlFamilyId, riderId, controlRiderId, levelCount, users } = fixtures;

  // ===========================================================================
  console.log("═══ PART 1 — ALLOW: exact row visibility per role ═══\n");
  // ===========================================================================

  console.log("anon (signed out) — default deny everywhere");
  for (const table of ["levels", "families", "riders", "profiles", "notifications"]) {
    const { ids } = await visibleIds(anon, table);
    check(`anon sees 0 rows in ${table}`, ids.length === 0, `saw ${ids.length}`);
  }

  console.log("\nlevels — read-all-authenticated lookup");
  for (const [name, client] of [
    ["admin", admin],
    ["staff", staff],
    ["parent", parent],
  ]) {
    const { ids } = await visibleIds(client, "levels");
    check(`${name} sees all ${levelCount} levels`, ids.length >= levelCount, `saw ${ids.length}`);
  }
  {
    const { data, error } = await admin
      .from("levels")
      .insert({ name: "Policy Test Level", sort: 999 })
      .select()
      .single();
    check("admin can insert a level", !error && Boolean(data), error?.message);
    if (data) await admin.from("levels").delete().eq("id", data.id);
  }

  console.log("\nfamilies — admin/staff read all, parent reads only their own");
  {
    const { ids: adminIds } = await visibleIds(admin, "families");
    check(
      "admin sees both fixture families",
      adminIds.includes(familyId) && adminIds.includes(controlFamilyId),
    );
    const { ids: staffIds } = await visibleIds(staff, "families");
    check(
      "staff sees both fixture families",
      staffIds.includes(familyId) && staffIds.includes(controlFamilyId),
    );
    const { ids: parentIds } = await visibleIds(parent, "families");
    check("parent sees exactly 1 family", parentIds.length === 1, `saw ${parentIds.length}`);
    check("parent sees their own family", parentIds.includes(familyId));
  }

  console.log("\nriders — admin/staff read all, parent reads only their family's");
  {
    const { ids: adminIds } = await visibleIds(admin, "riders");
    check(
      "admin sees both fixture riders",
      adminIds.includes(riderId) && adminIds.includes(controlRiderId),
    );
    const { ids: staffIds } = await visibleIds(staff, "riders");
    check(
      "staff sees both fixture riders",
      staffIds.includes(riderId) && staffIds.includes(controlRiderId),
    );
    const { ids: parentIds } = await visibleIds(parent, "riders");
    check("parent sees exactly 1 rider", parentIds.length === 1, `saw ${parentIds.length}`);
    check("parent sees their own rider", parentIds.includes(riderId));
  }

  console.log("\nprofiles — self + own family; admin/staff see all");
  {
    const { ids: adminIds } = await visibleIds(admin, "profiles");
    check("admin sees all 3 fixture profiles", adminIds.length >= 3, `saw ${adminIds.length}`);
    const { ids: staffIds } = await visibleIds(staff, "profiles");
    check("staff sees all 3 fixture profiles", staffIds.length >= 3, `saw ${staffIds.length}`);
    const { ids: parentIds } = await visibleIds(parent, "profiles");
    check("parent sees exactly 1 profile", parentIds.length === 1, `saw ${parentIds.length}`);
    check("parent sees their own profile", parentIds.includes(users.parent.profileId));
  }

  console.log("\nthe writes each role legitimately has");
  {
    const { error } = await parent
      .from("profiles")
      .update({ full_name: "Renamed By Parent" })
      .eq("id", users.parent.profileId)
      .select();
    check("parent CAN edit their own name", !error, error?.message);
  }
  {
    const { error } = await staff
      .from("profiles")
      .update({ phone: "555-0100" })
      .eq("id", users.staff.profileId)
      .select();
    check("staff CAN edit their own phone", !error, error?.message);
  }
  {
    const { error } = await parent
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("type", "phase0_fixture")
      .select();
    check("parent CAN mark their own notification read", !error, error?.message);
  }

  console.log("\nnotifications — each user sees only their own");
  // Scoped to the seeded fixture type on purpose. Counting *all* notifications
  // would make this assertion depend on whether the announcement fan-out
  // section has run yet, so the suite would only pass immediately after a
  // re-seed. Tests that are order-dependent get ignored the first time they go
  // red for the wrong reason.
  for (const [name, client] of [
    ["admin", admin],
    ["staff", staff],
    ["parent", parent],
  ]) {
    const { data, error } = await client
      .from("notifications")
      .select("id, profile_id")
      .eq("type", "phase0_fixture");
    check(`${name} sees exactly 1 fixture notification`, !error && data?.length === 1, error?.message);
    check(
      `${name}'s notification belongs to them`,
      data?.every((row) => row.profile_id === users[name].profileId) ?? false,
    );
  }

  // ===========================================================================
  console.log("\n\n═══ PART 2 — DENY (adversarial): every case here MUST be refused ═══\n");
  // ===========================================================================

  // ---------------------------------------------------------------------------
  // (a) Privilege escalation on `profiles`.
  //
  // The UPDATE policy lets a user edit their own row. Without the
  // profiles_guard_privileged_columns trigger, that same policy would let them
  // set role='admin'. These are the cases that prove the trigger is live.
  // ---------------------------------------------------------------------------
  console.log("(a) privilege escalation — profiles trigger must reject");

  const escalations = [
    ["set role='admin'", { role: "admin" }],
    ["set role='staff'", { role: "staff" }],
    ["grant themselves manage_shows", { manage_shows: true }],
    ["grant themselves manage_schedule", { manage_schedule: true }],
    ["grant themselves manage_horses", { manage_horses: true }],
    ["move themselves into another family", { family_id: controlFamilyId }],
    ["detach themselves from their family", { family_id: null }],
    ["repoint their row at another auth user", { user_id: users.admin.userId }],
    ["claim another family's QBO customer mapping", { qbo_customer_id: "hijacked" }],
  ];

  for (const [label, patch] of escalations) {
    const mode = await refusalMode(
      parent.from("profiles").update(patch).eq("id", users.parent.profileId).select(),
    );
    check(`parent CANNOT ${label}`, !mode.startsWith("ALLOWED"), mode);
  }

  {
    const mode = await refusalMode(
      staff.from("profiles").update({ role: "admin" }).eq("id", users.staff.profileId).select(),
    );
    check("staff CANNOT promote themselves to admin", !mode.startsWith("ALLOWED"), mode);
  }
  {
    const mode = await refusalMode(
      staff
        .from("profiles")
        .update({ manage_horses: true })
        .eq("id", users.staff.profileId)
        .select(),
    );
    check("staff CANNOT grant themselves a manage_* flag", !mode.startsWith("ALLOWED"), mode);
  }

  // Escalation via someone else's row, and via INSERT rather than UPDATE.
  check(
    "parent CANNOT edit the admin's profile",
    await writeRefused(
      parent
        .from("profiles")
        .update({ full_name: "Hijacked" })
        .eq("id", users.admin.profileId)
        .select(),
    ),
  );
  check(
    "parent CANNOT insert a second, admin-role profile for themselves",
    await writeRefused(
      parent
        .from("profiles")
        .insert({ user_id: users.parent.userId, role: "admin", full_name: "Backdoor" })
        .select(),
    ),
  );
  check(
    "parent CANNOT delete their own profile row",
    await writeRefused(parent.from("profiles").delete().eq("id", users.parent.profileId).select()),
  );

  // ---------------------------------------------------------------------------
  // (b) Column-level protection on `notifications`.
  //
  // RLS is row-level: the recipient's row IS theirs, so a row policy alone
  // would let them rewrite its contents. Only read_at is granted.
  // ---------------------------------------------------------------------------
  console.log("\n(b) notifications — only read_at is writable by the recipient");

  for (const [label, patch] of [
    ["title", { title: "Tampered title" }],
    ["body", { body: "Tampered body" }],
    ["type", { type: "tampered" }],
    ["link_path", { link_path: "/tampered" }],
    ["profile_id (reassign to the admin)", { profile_id: users.admin.profileId }],
  ]) {
    const mode = await refusalMode(
      parent.from("notifications").update(patch).eq("type", "phase0_fixture").select(),
    );
    check(`parent CANNOT change a notification's ${label}`, !mode.startsWith("ALLOWED"), mode);
  }

  check(
    "parent CANNOT insert a notification",
    await writeRefused(
      parent
        .from("notifications")
        .insert({ profile_id: users.parent.profileId, type: "forged", title: "Forged" })
        .select(),
    ),
  );
  check(
    "staff CANNOT insert a notification for another user",
    await writeRefused(
      staff
        .from("notifications")
        .insert({ profile_id: users.parent.profileId, type: "forged", title: "Forged" })
        .select(),
    ),
  );
  check(
    "parent CANNOT delete a notification",
    await writeRefused(
      parent.from("notifications").delete().eq("profile_id", users.parent.profileId).select(),
    ),
  );

  // ---------------------------------------------------------------------------
  // (c) Cross-family reads. The control family exists solely so this section
  //     has something that CAN leak — without it, "family-scoped" and "sees
  //     everything" would look identical.
  // ---------------------------------------------------------------------------
  console.log("\n(c) cross-family reads — parent must see zero rows of another family");

  await assertCannotSee(
    "parent CANNOT read the control family row",
    parent,
    "families",
    controlFamilyId,
  );
  await assertCannotSee(
    "parent CANNOT read the control family's rider",
    parent,
    "riders",
    controlRiderId,
  );
  await assertCannotSee(
    "parent CANNOT read the admin's profile",
    parent,
    "profiles",
    users.admin.profileId,
  );
  await assertCannotSee(
    "parent CANNOT read the staff profile",
    parent,
    "profiles",
    users.staff.profileId,
  );
  await assertCannotSee(
    "parent CANNOT read the admin's notification",
    parent,
    "notifications",
    users.admin.notificationId,
  );
  await assertCannotSee(
    "staff CANNOT read the parent's notification",
    staff,
    "notifications",
    users.parent.notificationId,
  );

  // Filtering explicitly by another family must not widen visibility either.
  {
    const { data, error } = await parent
      .from("riders")
      .select("id")
      .eq("family_id", controlFamilyId);
    check(
      "parent CANNOT list riders by filtering on another family_id",
      !error && (data?.length ?? 0) === 0,
      error?.message ?? `saw ${data?.length} row(s)`,
    );
  }

  // Writes into another family are refused too.
  check(
    "parent CANNOT rename another family",
    await writeRefused(
      parent.from("families").update({ name: "Hijacked" }).eq("id", controlFamilyId).select(),
    ),
  );
  check(
    "parent CANNOT move their rider into another family",
    await writeRefused(
      parent.from("riders").update({ family_id: controlFamilyId }).eq("id", riderId).select(),
    ),
  );
  check(
    "parent CANNOT rename their OWN family",
    await writeRefused(
      parent.from("families").update({ name: "Renamed" }).eq("id", familyId).select(),
    ),
  );
  check(
    "parent CANNOT add a rider to their own family",
    await writeRefused(
      parent.from("riders").insert({ family_id: familyId, name: "Extra Rider" }).select(),
    ),
  );
  check(
    "parent CANNOT create a family",
    await writeRefused(parent.from("families").insert({ name: "Sneaky Family" }).select()),
  );
  check(
    "parent CANNOT insert a level",
    await writeRefused(parent.from("levels").insert({ name: "Parent Level", sort: 99 }).select()),
  );

  // ---------------------------------------------------------------------------
  // (d) Staff are read-mostly. They see everything operationally, but Phase 0
  //     gives them no write on any of these tables — the one exception being
  //     their own profile's name/phone, asserted in Part 1.
  // ---------------------------------------------------------------------------
  console.log("\n(d) staff — read all four tables, write none of them");

  for (const table of ["levels", "families", "riders", "profiles"]) {
    const { ids, error } = await visibleIds(staff, table);
    check(`staff CAN read ${table}`, !error && ids.length > 0, error ?? `saw ${ids.length}`);
  }

  const staffWrites = [
    ["INSERT levels", staff.from("levels").insert({ name: "Staff Level", sort: 98 }).select()],
    ["INSERT families", staff.from("families").insert({ name: "Staff Family" }).select()],
    [
      "INSERT riders",
      staff.from("riders").insert({ family_id: familyId, name: "Staff Rider" }).select(),
    ],
    [
      "INSERT profiles",
      staff
        .from("profiles")
        .insert({ user_id: users.staff.userId, role: "admin", full_name: "Second" })
        .select(),
    ],
    [
      "UPDATE families",
      staff.from("families").update({ name: "Staff Renamed" }).eq("id", familyId).select(),
    ],
    ["UPDATE riders", staff.from("riders").update({ name: "Staff Renamed" }).eq("id", riderId).select()],
    [
      "UPDATE another user's profile",
      staff
        .from("profiles")
        .update({ full_name: "Staff Renamed" })
        .eq("id", users.parent.profileId)
        .select(),
    ],
    ["DELETE levels", staff.from("levels").delete().eq("name", "Intro").select()],
    ["DELETE families", staff.from("families").delete().eq("id", familyId).select()],
    ["DELETE riders", staff.from("riders").delete().eq("id", riderId).select()],
    [
      "DELETE profiles",
      staff.from("profiles").delete().eq("id", users.parent.profileId).select(),
    ],
  ];

  for (const [label, query] of staffWrites) {
    const mode = await refusalMode(query);
    check(`staff CANNOT ${label}`, !mode.startsWith("ALLOWED"), mode);
  }

  // ===========================================================================
  // announcements (Phase 1, slice 1)
  //
  // Audience is the whole point: a 'staff' announcement is internal, and a
  // parent must not be able to reach it by any route — not by listing, not by
  // filtering, not by fetching it directly by id.
  // ===========================================================================
  const ann = fixtures.announcements ?? {};
  const haveAnnouncements = Boolean(ann.allId && ann.staffId);

  if (!haveAnnouncements) {
    console.log("\n\n═══ announcements — SKIPPED ═══");
    console.log("  Migration 0005 is not applied yet, so there are no fixtures to test.");
    console.log("  Paste supabase/migrations/20260728000100_announcements.sql, re-seed, re-run.");
    skipped += 1;
  } else {
    console.log("\n\n═══ announcements — ALLOW ═══\n");

    {
      const { ids: adminIds } = await visibleIds(admin, "announcements");
      check(
        "admin sees both the 'all' and 'staff' announcements",
        adminIds.includes(ann.allId) && adminIds.includes(ann.staffId),
      );

      const { ids: staffIds } = await visibleIds(staff, "announcements");
      check(
        "staff sees both the 'all' and 'staff' announcements",
        staffIds.includes(ann.allId) && staffIds.includes(ann.staffId),
      );

      const { ids: parentIds } = await visibleIds(parent, "announcements");
      check("parent sees the 'all' announcement", parentIds.includes(ann.allId));
    }

    {
      const { data, error } = await admin
        .from("announcements")
        .insert({ title: "Policy test announcement", body_md: "temp", audience: "all" })
        .select()
        .single();
      check("admin can post an announcement", !error && Boolean(data), error?.message);

      if (data) {
        const { error: updateError } = await admin
          .from("announcements")
          .update({ pinned: true })
          .eq("id", data.id)
          .select();
        check("admin can edit an announcement", !updateError, updateError?.message);

        const { data: deleted } = await admin
          .from("announcements")
          .delete()
          .eq("id", data.id)
          .select();
        check("admin can delete an announcement", (deleted?.length ?? 0) === 1);
      }
    }

    console.log("\n═══ announcements — DENY (adversarial) ═══\n");

    // (e) The staff-only leak. Three different routes to the same row.
    await assertCannotSee(
      "parent CANNOT see the staff-only announcement in a plain list",
      parent,
      "announcements",
      ann.staffId,
    );
    {
      const { data, error } = await parent
        .from("announcements")
        .select("id")
        .eq("audience", "staff");
      check(
        "parent CANNOT surface it by filtering audience='staff'",
        !error && (data?.length ?? 0) === 0,
        error?.message ?? `saw ${data?.length} row(s)`,
      );
    }
    {
      const { data, error } = await parent
        .from("announcements")
        .select("title, body_md")
        .eq("id", ann.staffId)
        .maybeSingle();
      check(
        "parent CANNOT fetch its body by id",
        !error && data === null,
        error?.message ?? "row returned",
      );
    }

    // Writes: parents and staff are readers only.
    for (const [label, client] of [
      ["parent", parent],
      ["staff", staff],
    ]) {
      const mode = await refusalMode(
        client
          .from("announcements")
          .insert({ title: `Forged by ${label}`, body_md: "x", audience: "all" })
          .select(),
      );
      check(`${label} CANNOT post an announcement`, !mode.startsWith("ALLOWED"), mode);

      const editMode = await refusalMode(
        client
          .from("announcements")
          .update({ title: `Edited by ${label}` })
          .eq("id", ann.allId)
          .select(),
      );
      check(`${label} CANNOT edit an announcement`, !editMode.startsWith("ALLOWED"), editMode);

      const deleteMode = await refusalMode(
        client.from("announcements").delete().eq("id", ann.allId).select(),
      );
      check(`${label} CANNOT delete an announcement`, !deleteMode.startsWith("ALLOWED"), deleteMode);
    }

    // Escalation through the audience column: flipping a staff-only notice to
    // 'all' would publish it to every family.
    {
      const mode = await refusalMode(
        staff
          .from("announcements")
          .update({ audience: "all" })
          .eq("id", ann.staffId)
          .select(),
      );
      check("staff CANNOT republish a staff-only notice to everyone", !mode.startsWith("ALLOWED"), mode);
    }

    check(
      "anon sees 0 announcements",
      (await visibleIds(anon, "announcements")).ids.length === 0,
    );

    // -------------------------------------------------------------------------
    // Notification fan-out. Runs LAST because it deliberately creates
    // notifications, which changes the per-user counts asserted earlier.
    // `npm run db:seed` clears them again.
    // -------------------------------------------------------------------------
    console.log("\n═══ announcements — notification fan-out ═══\n");

    // Measured as DELTAS, not absolute counts. A client using the anon key
    // cannot delete notifications (there is deliberately no DELETE policy), so
    // this section cannot clean up after itself and absolute counts would drift
    // on every re-run.
    const announcementNotifs = async (client) => {
      const { data } = await client.from("notifications").select("id").eq("type", "announcement");
      return data?.length ?? 0;
    };

    {
      // `author` is set explicitly because that is what the app does
      // (createAnnouncement passes the caller's profile id). Leaving it null
      // here would make the "author is not notified" assertion vacuous: the
      // trigger excludes `p.id is distinct from new.author`, and against a null
      // author that excludes nobody.
      const before = {
        admin: await announcementNotifs(admin),
        staff: await announcementNotifs(staff),
        parent: await announcementNotifs(parent),
      };

      const { data: posted, error } = await admin
        .from("announcements")
        .insert({
          title: "Fan-out test — staff only",
          body_md: "Should notify admin and staff, never the parent.",
          audience: "staff",
          notify: true,
          author: users.admin.profileId,
        })
        .select()
        .single();

      check("admin can post a notifying announcement", !error && Boolean(posted), error?.message);

      if (posted) {
        check("the announcement records notified_at", Boolean(posted.notified_at));

        const staffDelta = (await announcementNotifs(staff)) - before.staff;
        check(
          "staff received a notification for the staff-only announcement",
          staffDelta === 1,
          `delta ${staffDelta}`,
        );

        const parentDelta = (await announcementNotifs(parent)) - before.parent;
        check(
          "parent received NO notification for the staff-only announcement",
          parentDelta === 0,
          `delta ${parentDelta}`,
        );

        const adminDelta = (await announcementNotifs(admin)) - before.admin;
        check("the author does NOT notify themselves", adminDelta === 0, `delta ${adminDelta}`);

        // Editing must not re-notify.
        await admin
          .from("announcements")
          .update({ title: "Fan-out test — edited" })
          .eq("id", posted.id);

        const staffAfterEdit = (await announcementNotifs(staff)) - before.staff;
        check(
          "editing the announcement does NOT re-notify",
          staffAfterEdit === 1,
          `delta ${staffAfterEdit}`,
        );

        await admin.from("announcements").delete().eq("id", posted.id);
      }
    }

    // An announcement with no author — e.g. posted straight from the SQL
    // Editor, or by a future scheduled job — has nobody to exclude, so the
    // whole audience is notified. Asserted so the behaviour is a decision on
    // the record rather than an accident of `is distinct from null`.
    {
      const before = {
        admin: await announcementNotifs(admin),
        parent: await announcementNotifs(parent),
      };

      const { data: posted, error } = await admin
        .from("announcements")
        .insert({
          title: "Fan-out test — no author",
          body_md: "Authorless announcements notify the entire audience.",
          audience: "staff",
          notify: true,
        })
        .select()
        .single();

      check("admin can post an authorless announcement", !error && Boolean(posted), error?.message);

      if (posted) {
        const adminDelta = (await announcementNotifs(admin)) - before.admin;
        check(
          "an authorless announcement notifies the whole audience, admin included",
          adminDelta === 1,
          `delta ${adminDelta}`,
        );

        const parentDelta = (await announcementNotifs(parent)) - before.parent;
        check(
          "audience still holds — the parent is not notified of a staff-only post",
          parentDelta === 0,
          `delta ${parentDelta}`,
        );

        await admin.from("announcements").delete().eq("id", posted.id);
      }
    }
  }

  // ===========================================================================
  // tasks + task_templates (Phase 1, slice 2)
  //
  // The rule under test: a staff member sees ONLY work assigned to them, and
  // the only thing they may do to it is complete it. Everything else — who owns
  // it, what it says, when it is due, whether it exists — is the admin's.
  //
  // Fixtures are created here rather than in the seed, because the interesting
  // cases need two staff-owned tasks and there is only one staff fixture user;
  // the second task is assigned to the ADMIN's profile and stands in for
  // "somebody else's task".
  // ===========================================================================
  {
    const probe = await admin.from("tasks").select("id").limit(1);

    if (probe.error && /schema cache|does not exist/i.test(probe.error.message)) {
      console.log("\n\n═══ tasks — SKIPPED ═══");
      console.log("  Migration 0006 is not applied yet.");
      console.log("  Paste supabase/migrations/20260728000200_tasks.sql, then re-run.");
      skipped += 1;
    } else {
      console.log("\n\n═══ tasks — ALLOW ═══\n");

      const today = new Date().toISOString().slice(0, 10);
      const created = [];

      // Paused on purpose: the generator ignores inactive templates, so this one
      // exists solely to give the staff task something to be detached FROM.
      // Without a template attached, "staff cannot detach it from its template"
      // is a no-op update that the trigger has no reason to block — the
      // assertion would pass while testing nothing.
      const pausedTemplate = await admin
        .from("task_templates")
        .insert({ title: "Policy test template (paused)", recurrence: "daily", active: false })
        .select()
        .single();

      // A task belonging to the staff fixture, and one belonging to the admin.
      const mine = await admin
        .from("tasks")
        .insert({
          title: "Policy test — staff's own task",
          date: today,
          assignee: users.staff.profileId,
          template_id: pausedTemplate.data?.id ?? null,
        })
        .select()
        .single();
      check("admin can create a task", !mine.error && Boolean(mine.data), mine.error?.message);
      check(
        "the staff fixture task IS attached to a template (keeps the detach case real)",
        Boolean(mine.data?.template_id),
        "template_id is null — the detach assertion below would be vacuous",
      );
      if (mine.data) created.push(mine.data.id);

      const theirs = await admin
        .from("tasks")
        .insert({
          title: "Policy test — someone else's task",
          date: today,
          assignee: users.admin.profileId,
        })
        .select()
        .single();
      check("admin can create a task for another person", !theirs.error, theirs.error?.message);
      if (theirs.data) created.push(theirs.data.id);

      const template = await admin
        .from("task_templates")
        .insert({ title: "Policy test template", recurrence: "daily" })
        .select()
        .single();
      check("admin can create a template", !template.error, template.error?.message);

      if (mine.data && theirs.data) {
        const { ids: adminIds } = await visibleIds(admin, "tasks");
        check(
          "admin sees both tasks",
          adminIds.includes(mine.data.id) && adminIds.includes(theirs.data.id),
        );

        const { ids: staffIds } = await visibleIds(staff, "tasks");
        check("staff sees their own task", staffIds.includes(mine.data.id));

        // Staff completing their own task — the one write they have.
        const { error: doneError } = await staff
          .from("tasks")
          .update({
            status: "done",
            completed_at: new Date().toISOString(),
            completed_by: users.staff.profileId,
          })
          .eq("id", mine.data.id)
          .select();
        check("staff CAN mark their own task done", !doneError, doneError?.message);

        const { error: undoError } = await staff
          .from("tasks")
          .update({ status: "open", completed_at: null, completed_by: null })
          .eq("id", mine.data.id)
          .select();
        check("staff CAN un-complete their own task", !undoError, undoError?.message);
      }

      console.log("\n═══ tasks — DENY (adversarial) ═══\n");

      if (mine.data && theirs.data) {
        // Somebody else's task must be invisible and untouchable.
        await assertCannotSee(
          "staff CANNOT see another person's task",
          staff,
          "tasks",
          theirs.data.id,
        );
        {
          const mode = await refusalMode(
            staff
              .from("tasks")
              .update({ status: "done", completed_at: new Date().toISOString(), completed_by: users.staff.profileId })
              .eq("id", theirs.data.id)
              .select(),
          );
          check("staff CANNOT mark someone else's task done", !mode.startsWith("ALLOWED"), mode);
        }

        // Row is theirs, but the columns are not. Each of these would let a
        // staff member rewrite the work rather than just do it.
        for (const [label, patch] of [
          ["retitle their own task", { title: "Rewritten by staff" }],
          ["rewrite the description", { description: "Rewritten by staff" }],
          ["move it to another date", { date: "2030-01-01" }],
          ["hand it to someone else", { assignee: users.admin.profileId }],
          ["make it unassigned", { assignee: null }],
          ["detach it from its template", { template_id: null }],
        ]) {
          const mode = await refusalMode(
            staff.from("tasks").update(patch).eq("id", mine.data.id).select(),
          );
          check(`staff CANNOT ${label}`, !mode.startsWith("ALLOWED"), mode);
        }

        // Completions must be attributable to the person who made them.
        {
          const mode = await refusalMode(
            staff
              .from("tasks")
              .update({
                status: "done",
                completed_at: new Date().toISOString(),
                completed_by: users.admin.profileId,
              })
              .eq("id", mine.data.id)
              .select(),
          );
          check("staff CANNOT credit the completion to someone else", !mode.startsWith("ALLOWED"), mode);
        }

        {
          const mode = await refusalMode(
            staff.from("tasks").delete().eq("id", mine.data.id).select(),
          );
          check("staff CANNOT delete their own task", !mode.startsWith("ALLOWED"), mode);
        }
      }

      {
        const mode = await refusalMode(
          staff
            .from("tasks")
            .insert({ title: "Forged by staff", date: today, assignee: users.staff.profileId })
            .select(),
        );
        check("staff CANNOT create a task", !mode.startsWith("ALLOWED"), mode);
      }

      // Templates are admin-only in every direction, including reads: staff see
      // the generated work, never the machinery that produced it.
      check(
        "staff CANNOT read task templates",
        (await visibleIds(staff, "task_templates")).ids.length === 0,
      );
      {
        const mode = await refusalMode(
          staff
            .from("task_templates")
            .insert({ title: "Forged template", recurrence: "daily" })
            .select(),
        );
        check("staff CANNOT create a template", !mode.startsWith("ALLOWED"), mode);
      }
      if (template.data) {
        const mode = await refusalMode(
          staff.from("task_templates").update({ active: false }).eq("id", template.data.id).select(),
        );
        check("staff CANNOT edit a template", !mode.startsWith("ALLOWED"), mode);

        const delMode = await refusalMode(
          staff.from("task_templates").delete().eq("id", template.data.id).select(),
        );
        check("staff CANNOT delete a template", !delMode.startsWith("ALLOWED"), delMode);
      }

      // Only an admin may materialise a day's work.
      {
        const { error } = await staff.rpc("generate_tasks_for_date", { target_date: today });
        check("staff CANNOT call generate_tasks_for_date", Boolean(error), "no error raised");
      }
      {
        const { error } = await parent.rpc("generate_tasks_for_date", { target_date: today });
        check("parent CANNOT call generate_tasks_for_date", Boolean(error), "no error raised");
      }

      // Parents and anon have no business here at all.
      check("parent sees 0 tasks", (await visibleIds(parent, "tasks")).ids.length === 0);
      check(
        "parent sees 0 task templates",
        (await visibleIds(parent, "task_templates")).ids.length === 0,
      );
      check("anon sees 0 tasks", (await visibleIds(anon, "tasks")).ids.length === 0);
      check(
        "anon sees 0 task templates",
        (await visibleIds(anon, "task_templates")).ids.length === 0,
      );

      // Idempotency of the generator, which is the whole reason for the unique
      // index on (template_id, date).
      {
        const first = await admin.rpc("generate_tasks_for_date", { target_date: today });
        const second = await admin.rpc("generate_tasks_for_date", { target_date: today });
        check("admin CAN call generate_tasks_for_date", !first.error, first.error?.message);
        check(
          "running the generator twice creates no duplicates",
          second.data === 0,
          `second run created ${second.data}`,
        );
      }

      // Clean up: remove the fixtures this section made, including any tasks the
      // generator produced from the test templates.
      for (const tpl of [template.data, pausedTemplate.data]) {
        if (!tpl) continue;
        await admin.from("tasks").delete().eq("template_id", tpl.id);
        await admin.from("task_templates").delete().eq("id", tpl.id);
      }
      for (const id of created) await admin.from("tasks").delete().eq("id", id);
    }
  }

  // ===========================================================================
  // lessons (Phase 1, slice 3a)
  //
  // Every DENY below is preceded by a POSITIVE CONTROL proving the thing being
  // attacked actually exists and is reachable by somebody. Two assertions in
  // this suite have already passed while testing nothing — a null author, and a
  // null template_id — because the attack was a no-op against absent data. A
  // deny test that cannot distinguish "blocked" from "not there" is worthless.
  // ===========================================================================
  {
    const probe = await admin.from("lesson_instances").select("id").limit(1);

    if (probe.error && /schema cache|does not exist/i.test(probe.error.message)) {
      console.log("\n\n═══ lessons — SKIPPED ═══");
      console.log("  Migration 0007 is not applied yet.");
      console.log("  Paste supabase/migrations/20260728000300_lessons.sql, then re-run.");
      skipped += 1;
    } else {
      console.log("\n\n═══ lessons — ALLOW ═══\n");

      const today = new Date().toISOString().slice(0, 10);
      const isoDow = ((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

      const madeInstances = [];
      const madeTemplates = [];

      // --- fixtures ---------------------------------------------------------
      const template = await admin
        .from("lesson_templates")
        .insert({
          weekday: isoDow,
          start_time: "09:00:00",
          duration_min: 45,
          type: "private",
          max_riders: 1,
          active: true,
        })
        .select()
        .single();
      check("admin can create a lesson template", !template.error, template.error?.message);
      if (template.data) madeTemplates.push(template.data.id);

      // Instance A holds THIS family's rider. Instance B holds the control
      // family's rider and is what the parent must never reach.
      const insertInstance = (startTime) =>
        admin
          .from("lesson_instances")
          .insert({
            template_id: null,
            date: today,
            start_time: startTime,
            duration_min: 45,
            type: "private",
          })
          .select()
          .single();

      const instanceA = await insertInstance("10:00:00");
      const instanceB = await insertInstance("11:00:00");
      check("admin can create a lesson instance", !instanceA.error, instanceA.error?.message);
      if (instanceA.data) madeInstances.push(instanceA.data.id);
      if (instanceB.data) madeInstances.push(instanceB.data.id);

      const bookingMine = await admin
        .from("lesson_riders")
        .insert({ instance_id: instanceA.data?.id, rider_id: riderId })
        .select()
        .single();
      check("admin can book a rider into a lesson", !bookingMine.error, bookingMine.error?.message);

      const bookingTheirs = await admin
        .from("lesson_riders")
        .insert({ instance_id: instanceB.data?.id, rider_id: controlRiderId })
        .select()
        .single();
      check(
        "admin can book another family's rider",
        !bookingTheirs.error,
        bookingTheirs.error?.message,
      );

      // Double-booking is a unique-constraint violation, not a policy question.
      {
        const { error } = await admin
          .from("lesson_riders")
          .insert({ instance_id: instanceA.data?.id, rider_id: riderId })
          .select();
        check("the same rider cannot be booked into a lesson twice", Boolean(error), "no error");
      }

      // --- reads ------------------------------------------------------------
      check(
        "staff can read lesson templates",
        (await visibleIds(staff, "lesson_templates")).ids.length > 0,
      );
      if (instanceA.data && instanceB.data) {
        const { ids: staffIds } = await visibleIds(staff, "lesson_instances");
        check(
          "staff can read all lesson instances",
          staffIds.includes(instanceA.data.id) && staffIds.includes(instanceB.data.id),
        );

        const { ids: parentIds } = await visibleIds(parent, "lesson_instances");
        check(
          "parent CAN see the instance their own rider is in",
          parentIds.includes(instanceA.data.id),
        );
      }

      // --- the one write a parent has ---------------------------------------
      if (bookingMine.data) {
        const beforeCancel = await parent
          .from("lesson_riders")
          .select("status")
          .eq("id", bookingMine.data.id)
          .maybeSingle();
        check(
          "POSITIVE CONTROL — the parent can see their own booking, currently 'booked'",
          beforeCancel.data?.status === "booked",
          `saw ${beforeCancel.data?.status ?? "nothing"}`,
        );

        const { error } = await parent
          .from("lesson_riders")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
          .eq("id", bookingMine.data.id)
          .select();
        check("parent CAN cancel their own rider's booking", !error, error?.message);

        const afterCancel = await admin
          .from("lesson_riders")
          .select("status, cancelled_at")
          .eq("id", bookingMine.data.id)
          .maybeSingle();
        check("the cancellation is recorded with a timestamp", Boolean(afterCancel.data?.cancelled_at));
      }

      console.log("\n═══ lessons — DENY (adversarial, each with a positive control) ═══\n");

      // (1) Another family's instance must be invisible.
      if (instanceB.data) {
        const adminSeesB = await admin
          .from("lesson_instances")
          .select("id")
          .eq("id", instanceB.data.id)
          .maybeSingle();
        check(
          "POSITIVE CONTROL — instance B exists and is visible to the admin",
          Boolean(adminSeesB.data),
        );
        await assertCannotSee(
          "parent CANNOT see an instance none of their riders are in",
          parent,
          "lesson_instances",
          instanceB.data.id,
        );
      }

      // (2) Another family's booking must be invisible and uncancellable.
      if (bookingTheirs.data) {
        const adminSeesBooking = await admin
          .from("lesson_riders")
          .select("status")
          .eq("id", bookingTheirs.data.id)
          .maybeSingle();
        check(
          "POSITIVE CONTROL — the other family's booking exists and is 'booked'",
          adminSeesBooking.data?.status === "booked",
          `saw ${adminSeesBooking.data?.status ?? "nothing"}`,
        );
        await assertCannotSee(
          "parent CANNOT see another family's booking",
          parent,
          "lesson_riders",
          bookingTheirs.data.id,
        );
        {
          const mode = await refusalMode(
            parent
              .from("lesson_riders")
              .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
              .eq("id", bookingTheirs.data.id)
              .select(),
          );
          check("parent CANNOT cancel another family's booking", !mode.startsWith("ALLOWED"), mode);
        }
        // And it is genuinely untouched afterwards.
        const stillBooked = await admin
          .from("lesson_riders")
          .select("status")
          .eq("id", bookingTheirs.data.id)
          .maybeSingle();
        check(
          "the other family's booking is still 'booked' after the attempt",
          stillBooked.data?.status === "booked",
          `saw ${stillBooked.data?.status}`,
        );
      }

      // (3) A released slot must not be re-taken by flipping status back.
      if (bookingMine.data) {
        const nowCancelled = await parent
          .from("lesson_riders")
          .select("status")
          .eq("id", bookingMine.data.id)
          .maybeSingle();
        check(
          "POSITIVE CONTROL — the parent's own booking is reachable and now 'cancelled'",
          nowCancelled.data?.status === "cancelled",
          `saw ${nowCancelled.data?.status ?? "nothing"}`,
        );

        for (const [label, status] of [
          ["re-book a cancelled slot", "booked"],
          ["promote themselves to a backfill", "backfilled"],
        ]) {
          const mode = await refusalMode(
            parent.from("lesson_riders").update({ status }).eq("id", bookingMine.data.id).select(),
          );
          check(`parent CANNOT ${label}`, !mode.startsWith("ALLOWED"), mode);
        }
      }

      // (4) A booking must not be moved to another rider or another lesson.
      if (bookingMine.data && instanceB.data) {
        const targetsExist = await admin
          .from("lesson_instances")
          .select("id")
          .eq("id", instanceB.data.id)
          .maybeSingle();
        check(
          "POSITIVE CONTROL — the reassignment targets (other instance, other rider) really exist",
          Boolean(targetsExist.data) && Boolean(controlRiderId),
        );

        for (const [label, patch] of [
          ["move their booking to another lesson", { instance_id: instanceB.data.id }],
          ["reassign their booking to another family's rider", { rider_id: controlRiderId }],
        ]) {
          const mode = await refusalMode(
            parent.from("lesson_riders").update(patch).eq("id", bookingMine.data.id).select(),
          );
          check(`parent CANNOT ${label}`, !mode.startsWith("ALLOWED"), mode);
        }
      }

      // (5) Parents write nothing else; staff write nothing at all.
      {
        const mode = await refusalMode(
          parent
            .from("lesson_riders")
            .insert({ instance_id: instanceA.data?.id, rider_id: riderId })
            .select(),
        );
        check("parent CANNOT book a rider into a lesson", !mode.startsWith("ALLOWED"), mode);
      }
      {
        const mode = await refusalMode(
          parent.from("lesson_riders").delete().eq("id", bookingMine.data?.id).select(),
        );
        check("parent CANNOT delete a booking", !mode.startsWith("ALLOWED"), mode);
      }
      check(
        "parent CANNOT read lesson templates",
        (await visibleIds(parent, "lesson_templates")).ids.length === 0,
      );

      const staffWrites = [
        [
          "INSERT a lesson template",
          staff
            .from("lesson_templates")
            .insert({ weekday: 1, start_time: "08:00:00", duration_min: 45, type: "private" })
            .select(),
        ],
        [
          "UPDATE a lesson template",
          staff.from("lesson_templates").update({ active: false }).eq("id", template.data?.id).select(),
        ],
        [
          "DELETE a lesson template",
          staff.from("lesson_templates").delete().eq("id", template.data?.id).select(),
        ],
        [
          "INSERT a lesson instance",
          staff
            .from("lesson_instances")
            .insert({ date: today, start_time: "12:00:00", duration_min: 45, type: "private" })
            .select(),
        ],
        [
          "cancel a lesson instance",
          staff
            .from("lesson_instances")
            .update({ status: "cancelled" })
            .eq("id", instanceA.data?.id)
            .select(),
        ],
        [
          "DELETE a lesson instance",
          staff.from("lesson_instances").delete().eq("id", instanceA.data?.id).select(),
        ],
        [
          "book a rider",
          staff
            .from("lesson_riders")
            .insert({ instance_id: instanceB.data?.id, rider_id: riderId })
            .select(),
        ],
        [
          "cancel someone's booking",
          staff
            .from("lesson_riders")
            .update({ status: "cancelled" })
            .eq("id", bookingTheirs.data?.id)
            .select(),
        ],
      ];
      for (const [label, query] of staffWrites) {
        const mode = await refusalMode(query);
        check(`staff CANNOT ${label}`, !mode.startsWith("ALLOWED"), mode);
      }

      // (6) The generator is admin-only and idempotent.
      {
        const { error } = await staff.rpc("generate_lesson_instances", {
          from_date: today,
          through_date: today,
        });
        check("staff CANNOT call generate_lesson_instances", Boolean(error), "no error raised");
      }
      {
        const { error } = await parent.rpc("generate_lesson_instances", {
          from_date: today,
          through_date: today,
        });
        check("parent CANNOT call generate_lesson_instances", Boolean(error), "no error raised");
      }
      {
        const first = await admin.rpc("generate_lesson_instances", {
          from_date: today,
          through_date: today,
        });
        check(
          "admin CAN generate instances, and the active template produced one",
          !first.error && (first.data ?? 0) >= 1,
          first.error?.message ?? `created ${first.data}`,
        );
        const second = await admin.rpc("generate_lesson_instances", {
          from_date: today,
          through_date: today,
        });
        check(
          "running the generator twice creates no duplicates",
          second.data === 0,
          `second run created ${second.data}`,
        );
      }

      // (7) Signed out sees nothing anywhere.
      for (const table of ["lesson_templates", "lesson_instances", "lesson_riders"]) {
        check(`anon sees 0 rows in ${table}`, (await visibleIds(anon, table)).ids.length === 0);
      }

      // --- clean up ---------------------------------------------------------
      for (const id of madeTemplates) {
        await admin.from("lesson_instances").delete().eq("template_id", id);
        await admin.from("lesson_templates").delete().eq("id", id);
      }
      for (const id of madeInstances) await admin.from("lesson_instances").delete().eq("id", id);
    }
  }

  // ===========================================================================
  // backfill engine (Phase 1, slice 3b)
  //
  // The seat race is the reason this lives in the database. The concurrency
  // case below fires two accepts for one seat SIMULTANEOUSLY (Promise.all, not
  // sequentially) — run them one after the other and the test passes against a
  // completely unlocked implementation, which is the trap this whole slice was
  // split out to avoid.
  // ===========================================================================
  {
    const probe = await admin.from("backfill_offers").select("id").limit(1);

    if (probe.error && /schema cache|does not exist/i.test(probe.error.message)) {
      console.log("\n\n═══ backfill — SKIPPED ═══");
      console.log("  Migration 0008 is not applied yet.");
      console.log("  Paste supabase/migrations/20260728000400_backfill.sql, then re-run.");
      skipped += 1;
    } else {
      console.log("\n\n═══ backfill — ALLOW ═══\n");

      const today = new Date().toISOString().slice(0, 10);
      const madeInstances = [];

      // Level the two fixture riders onto the same rung so both are eligible.
      const { data: levels } = await admin.from("levels").select("id, name").order("sort");
      const levelId = levels?.[1]?.id ?? levels?.[0]?.id ?? null;
      await admin.from("riders").update({ level_id: levelId }).eq("id", riderId);
      await admin.from("riders").update({ level_id: levelId }).eq("id", controlRiderId);

      const newInstance = async (startTime, seats = 1) => {
        const { data } = await admin
          .from("lesson_instances")
          .insert({
            template_id: null,
            date: today,
            start_time: startTime,
            duration_min: 45,
            type: "private",
            level_id: levelId,
            max_riders: seats,
          })
          .select()
          .single();
        if (data) madeInstances.push(data.id);
        return data;
      };

      // --- eligibility ------------------------------------------------------
      const elig = await newInstance("14:00:00");
      {
        const { data, error } = await admin.rpc("eligible_backfill_riders", {
          instance: elig.id,
        });
        const ids = (data ?? []).map((r) => r.id);
        check(
          "eligibility includes both same-level riders on an empty lesson",
          !error && ids.includes(riderId) && ids.includes(controlRiderId),
          error?.message ?? `saw ${ids.length}`,
        );
      }
      {
        // Booking one of them must remove them from the eligible list.
        await admin
          .from("lesson_riders")
          .insert({ instance_id: elig.id, rider_id: riderId, status: "booked" });
        const { data } = await admin.rpc("eligible_backfill_riders", { instance: elig.id });
        const ids = (data ?? []).map((r) => r.id);
        check(
          "a rider already in the lesson is NOT eligible",
          !ids.includes(riderId) && ids.includes(controlRiderId),
        );
      }
      {
        // A different level must exclude a rider.
        const otherLevel = levels?.find((l) => l.id !== levelId)?.id ?? null;
        if (otherLevel) {
          await admin.from("riders").update({ level_id: otherLevel }).eq("id", controlRiderId);
          const { data } = await admin.rpc("eligible_backfill_riders", { instance: elig.id });
          check(
            "a rider at a different level is NOT eligible",
            !(data ?? []).map((r) => r.id).includes(controlRiderId),
          );
          await admin.from("riders").update({ level_id: levelId }).eq("id", controlRiderId);
        }
      }

      // --- a parent accepts their own offer ---------------------------------
      const solo = await newInstance("15:00:00");
      {
        const sent = await admin.rpc("send_backfill_offers", {
          instance: solo.id,
          rider_ids: [riderId],
        });
        check("admin can send a backfill offer", !sent.error && sent.data === 1, sent.error?.message);

        const { data: offer } = await admin
          .from("backfill_offers")
          .select("*")
          .eq("instance_id", solo.id)
          .eq("rider_id", riderId)
          .maybeSingle();
        check(
          "POSITIVE CONTROL — the offer exists and is 'sent'",
          offer?.status === "sent",
          `saw ${offer?.status ?? "nothing"}`,
        );

        const parentSees = await parent
          .from("backfill_offers")
          .select("id")
          .eq("id", offer?.id)
          .maybeSingle();
        check("parent CAN see their own offer", Boolean(parentSees.data));

        const parentSeesLesson = await parent
          .from("lesson_instances")
          .select("id")
          .eq("id", solo.id)
          .maybeSingle();
        check(
          "parent CAN see the offered lesson (offer grants visibility)",
          Boolean(parentSeesLesson.data),
        );

        const res = await parent.rpc("respond_to_backfill_offer", {
          offer: offer?.id,
          accept: true,
        });
        check("parent CAN accept their own offer", res.data === "accepted", res.error?.message ?? String(res.data));

        const { data: booking } = await admin
          .from("lesson_riders")
          .select("status")
          .eq("instance_id", solo.id)
          .eq("rider_id", riderId)
          .maybeSingle();
        check(
          "accepting books the rider as 'backfilled'",
          booking?.status === "backfilled",
          `saw ${booking?.status ?? "nothing"}`,
        );

        const { data: after } = await admin
          .from("backfill_offers")
          .select("status, responded_at")
          .eq("id", offer?.id)
          .maybeSingle();
        check("the offer is marked 'accepted' with a timestamp",
          after?.status === "accepted" && Boolean(after?.responded_at));
      }

      // --- decline ----------------------------------------------------------
      const declineInstance = await newInstance("16:00:00");
      {
        await admin.rpc("send_backfill_offers", {
          instance: declineInstance.id,
          rider_ids: [riderId],
        });
        const { data: offer } = await admin
          .from("backfill_offers")
          .select("id")
          .eq("instance_id", declineInstance.id)
          .maybeSingle();

        const res = await parent.rpc("respond_to_backfill_offer", {
          offer: offer?.id,
          accept: false,
        });
        check("parent CAN decline an offer", res.data === "declined", res.error?.message);

        const { data: seats } = await admin
          .from("lesson_riders")
          .select("id")
          .eq("instance_id", declineInstance.id);
        check("declining books nobody", (seats?.length ?? 0) === 0);
      }

      console.log("\n═══ backfill — RACE: two accepts, one seat ═══\n");

      // The heart of the slice. One seat, two outstanding offers, both accepted
      // at the same instant.
      {
        const contested = await newInstance("17:00:00", 1);

        const sent = await admin.rpc("send_backfill_offers", {
          instance: contested.id,
          rider_ids: [riderId, controlRiderId],
        });
        check("two offers went out for one seat", sent.data === 2, `sent ${sent.data}`);

        const { data: offers } = await admin
          .from("backfill_offers")
          .select("id, rider_id, status")
          .eq("instance_id", contested.id);
        check(
          "POSITIVE CONTROL — the seat is open and both offers are 'sent'",
          (offers ?? []).length === 2 &&
            (offers ?? []).every((o) => o.status === "sent") &&
            (await admin.rpc("instance_taken_seats", { instance: contested.id })).data === 0,
        );

        const offerMine = offers.find((o) => o.rider_id === riderId);
        const offerTheirs = offers.find((o) => o.rider_id === controlRiderId);

        // Fired together, not one after the other — sequential calls would pass
        // even with no locking at all.
        const [resA, resB] = await Promise.all([
          parent.rpc("respond_to_backfill_offer", { offer: offerMine.id, accept: true }),
          admin.rpc("respond_to_backfill_offer", { offer: offerTheirs.id, accept: true }),
        ]);

        const outcomes = [resA.data, resB.data].sort();
        check(
          "exactly one accept succeeds; the other is told the seat is gone",
          outcomes.length === 2 &&
            outcomes.includes("accepted") &&
            (outcomes.includes("full") || outcomes.includes("expired")),
          `outcomes: ${JSON.stringify([resA.data, resB.data])} errors: ${resA.error?.message ?? ""} ${resB.error?.message ?? ""}`,
        );

        const { data: seated } = await admin
          .from("lesson_riders")
          .select("rider_id, status")
          .eq("instance_id", contested.id)
          .in("status", ["booked", "backfilled"]);
        check(
          "max_riders is never exceeded — exactly one rider is seated",
          (seated?.length ?? 0) === 1,
          `seated ${seated?.length}`,
        );

        const { data: finalOffers } = await admin
          .from("backfill_offers")
          .select("status")
          .eq("instance_id", contested.id);
        const statuses = (finalOffers ?? []).map((o) => o.status).sort();
        check(
          "the losing offer is closed out, not left dangling as 'sent'",
          statuses.length === 2 && statuses.includes("accepted") && !statuses.includes("sent"),
          `statuses: ${JSON.stringify(statuses)}`,
        );
      }

      console.log("\n═══ backfill — DENY (adversarial, each with a positive control) ═══\n");

      // (1) Another family's offer.
      const foreign = await newInstance("18:00:00");
      {
        await admin.rpc("send_backfill_offers", {
          instance: foreign.id,
          rider_ids: [controlRiderId],
        });
        const { data: offer } = await admin
          .from("backfill_offers")
          .select("id, status")
          .eq("instance_id", foreign.id)
          .maybeSingle();
        check(
          "POSITIVE CONTROL — the other family's offer exists and is 'sent'",
          offer?.status === "sent",
          `saw ${offer?.status ?? "nothing"}`,
        );

        await assertCannotSee(
          "parent CANNOT see another family's offer",
          parent,
          "backfill_offers",
          offer.id,
        );

        for (const [label, accept] of [
          ["accept another family's offer", true],
          ["decline another family's offer", false],
        ]) {
          const { error } = await parent.rpc("respond_to_backfill_offer", {
            offer: offer.id,
            accept,
          });
          check(`parent CANNOT ${label}`, Boolean(error), "no error raised");
        }

        const { data: untouched } = await admin
          .from("backfill_offers")
          .select("status")
          .eq("id", offer.id)
          .maybeSingle();
        check(
          "that offer is still 'sent' after the attempts",
          untouched?.status === "sent",
          `saw ${untouched?.status}`,
        );
      }

      // (2) Direct table writes on offers.
      {
        const { data: myOffer } = await admin
          .from("backfill_offers")
          .select("id")
          .eq("rider_id", riderId)
          .limit(1)
          .maybeSingle();
        check("POSITIVE CONTROL — a real offer row for this family exists", Boolean(myOffer));

        const mode = await refusalMode(
          parent.from("backfill_offers").update({ status: "accepted" }).eq("id", myOffer.id).select(),
        );
        check("parent CANNOT directly UPDATE an offer to 'accepted'", !mode.startsWith("ALLOWED"), mode);

        const forge = await refusalMode(
          parent
            .from("backfill_offers")
            .insert({ instance_id: elig.id, rider_id: riderId, status: "sent" })
            .select(),
        );
        check("parent CANNOT forge an offer", !forge.startsWith("ALLOWED"), forge);

        const del = await refusalMode(
          parent.from("backfill_offers").delete().eq("id", myOffer.id).select(),
        );
        check("parent CANNOT delete an offer", !del.startsWith("ALLOWED"), del);
      }

      // (3) The guard bypass must not be reachable from outside the engine.
      {
        const openSeat = await newInstance("19:00:00");
        check("POSITIVE CONTROL — a lesson with a free seat exists", Boolean(openSeat));

        const direct = await refusalMode(
          parent
            .from("lesson_riders")
            .insert({ instance_id: openSeat.id, rider_id: riderId, status: "backfilled" })
            .select(),
        );
        check(
          "parent CANNOT insert a 'backfilled' booking directly",
          !direct.startsWith("ALLOWED"),
          direct,
        );

        // And via the update path on a row they DO own.
        await admin
          .from("lesson_riders")
          .insert({ instance_id: openSeat.id, rider_id: riderId, status: "booked" });
        const { data: own } = await admin
          .from("lesson_riders")
          .select("id, status")
          .eq("instance_id", openSeat.id)
          .eq("rider_id", riderId)
          .maybeSingle();
        check(
          "POSITIVE CONTROL — the parent owns a real booking on that lesson",
          own?.status === "booked",
        );
        const promote = await refusalMode(
          parent.from("lesson_riders").update({ status: "backfilled" }).eq("id", own.id).select(),
        );
        check(
          "parent CANNOT promote their own booking to 'backfilled'",
          !promote.startsWith("ALLOWED"),
          promote,
        );
      }

      // (4) Capacity cannot be exceeded, and a closed offer cannot be revived.
      {
        const full = await newInstance("20:00:00", 1);
        await admin
          .from("lesson_riders")
          .insert({ instance_id: full.id, rider_id: controlRiderId, status: "booked" });
        check(
          "POSITIVE CONTROL — the lesson is now at capacity",
          (await admin.rpc("instance_taken_seats", { instance: full.id })).data === 1,
        );

        const { error } = await admin.rpc("admin_assign_backfill", {
          instance: full.id,
          rider: riderId,
        });
        check("even an admin CANNOT overfill a lesson", Boolean(error), "no error raised");
      }
      {
        const { data: declined } = await admin
          .from("backfill_offers")
          .select("id, status")
          .eq("status", "declined")
          .limit(1)
          .maybeSingle();
        check(
          "POSITIVE CONTROL — a declined offer exists to attempt against",
          declined?.status === "declined",
        );
        const res = await parent.rpc("respond_to_backfill_offer", {
          offer: declined.id,
          accept: true,
        });
        check(
          "a declined offer CANNOT be accepted later",
          res.data === "declined",
          `returned ${JSON.stringify(res.data)}`,
        );
      }

      // (5) Staff and anon.
      {
        const mode = await refusalMode(
          staff
            .from("backfill_offers")
            .insert({ instance_id: elig.id, rider_id: riderId, status: "sent" })
            .select(),
        );
        check("staff CANNOT create an offer", !mode.startsWith("ALLOWED"), mode);
      }
      {
        const { error } = await staff.rpc("send_backfill_offers", {
          instance: elig.id,
          rider_ids: [controlRiderId],
        });
        check("staff CANNOT call send_backfill_offers", Boolean(error), "no error raised");
      }
      {
        const { error } = await parent.rpc("admin_assign_backfill", {
          instance: elig.id,
          rider: riderId,
        });
        check("parent CANNOT call admin_assign_backfill", Boolean(error), "no error raised");
      }
      {
        const { error } = await staff.rpc("enqueue_lesson_reminders", { target_date: today });
        check("staff CANNOT call enqueue_lesson_reminders", Boolean(error), "no error raised");
      }
      check("anon sees 0 backfill offers", (await visibleIds(anon, "backfill_offers")).ids.length === 0);

      // (5b) The one hand-written primitive case worth keeping: it attacks with
      // REAL arguments and then proves no rider was seated. The generic
      // "no internal function is reachable" sweep lives in the STANDING GUARD
      // section and covers every primitive, including ones added later.
      {
        const openSeat = await newInstance("21:00:00");
        const { error } = await parent.rpc("backfill_book_rider", {
          instance: openSeat.id,
          rider: riderId,
        });
        check(
          "parent CANNOT call backfill_book_rider directly (internal primitive)",
          Boolean(error),
          "no error raised — the primitive is exposed",
        );
        const { data: seated } = await admin
          .from("lesson_riders")
          .select("id")
          .eq("instance_id", openSeat.id);
        check("nobody was seated by that attempt", (seated?.length ?? 0) === 0);
      }

      // (6) Reminders are idempotent.
      {
        const first = await admin.rpc("enqueue_lesson_reminders", { target_date: today });
        check("admin CAN enqueue lesson reminders", !first.error, first.error?.message);
        const second = await admin.rpc("enqueue_lesson_reminders", { target_date: today });
        check(
          "running reminders twice sends nothing the second time",
          second.data === 0,
          `second run created ${second.data}`,
        );
      }

      // --- clean up ---------------------------------------------------------
      for (const id of madeInstances) await admin.from("lesson_instances").delete().eq("id", id);
    }
  }

  // ===========================================================================
  // time clock (Phase 1, slice 4)
  //
  // punches is an append-only ledger: it decides what people are paid, so the
  // absence of any UPDATE or DELETE policy — for EVERY role, admin included —
  // is the property under test. A correction is a new adjusting row; the
  // original stays. If a later migration ever adds an update path, the deny
  // cases here go red.
  // ===========================================================================
  {
    const probe = await admin.from("punches").select("id").limit(1);

    if (probe.error && /schema cache|does not exist/i.test(probe.error.message)) {
      console.log("\n\n═══ time clock — SKIPPED ═══");
      console.log("  Migration 0009 is not applied yet.");
      skipped += 1;
    } else {
      console.log("\n\n═══ time clock — ALLOW ═══\n");

      const madePunches = [];
      const madePeriods = [];

      // Staff clocking themselves in and out — the only write they have.
      const inPunch = await staff
        .from("punches")
        .insert({
          profile_id: users.staff.profileId,
          direction: "in",
          punched_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
        })
        .select()
        .single();
      check("staff CAN clock in", !inPunch.error && Boolean(inPunch.data), inPunch.error?.message);
      if (inPunch.data) madePunches.push(inPunch.data.id);

      const outPunch = await staff
        .from("punches")
        .insert({
          profile_id: users.staff.profileId,
          direction: "out",
          punched_at: new Date().toISOString(),
        })
        .select()
        .single();
      check("staff CAN clock out", !outPunch.error, outPunch.error?.message);
      if (outPunch.data) madePunches.push(outPunch.data.id);

      // A punch with no location must still be accepted — denying GPS cannot
      // cost someone their shift.
      {
        const { error } = await staff
          .from("punches")
          .insert({
            profile_id: users.staff.profileId,
            direction: "in",
            punched_at: new Date(Date.now() - 26 * 3600_000).toISOString(),
            lat: null,
            lng: null,
          })
          .select();
        check("a punch with no location is still accepted", !error, error?.message);
      }

      check(
        "staff CAN read their own punches",
        (await visibleIds(staff, "punches")).ids.includes(inPunch.data?.id),
      );
      check(
        "admin CAN read everyone's punches",
        (await visibleIds(admin, "punches")).ids.includes(inPunch.data?.id),
      );

      // Admin corrections.
      const correction = await admin
        .from("punches")
        .insert({
          profile_id: users.staff.profileId,
          direction: "out",
          punched_at: new Date().toISOString(),
          source: "admin_adjustment",
          adjusts_punch_id: inPunch.data?.id,
          note: "Forgot to clock out",
        })
        .select()
        .single();
      check("admin CAN insert a correction", !correction.error, correction.error?.message);
      if (correction.data) madePunches.push(correction.data.id);

      check(
        "the corrected punch is still in the ledger",
        Boolean(
          (await admin.from("punches").select("id").eq("id", inPunch.data?.id).maybeSingle()).data,
        ),
      );

      // Pay periods and approvals.
      const period = await admin
        .from("pay_periods")
        .insert({ start_date: "2026-01-05", end_date: "2026-01-11" })
        .select()
        .single();
      check("admin CAN open a pay period", !period.error, period.error?.message);
      if (period.data) madePeriods.push(period.data.id);

      const approval = await admin
        .from("timesheet_approvals")
        .insert({
          period_id: period.data?.id,
          profile_id: users.staff.profileId,
          total_minutes: 480,
          approved_by: users.admin.profileId,
          approved_at: new Date().toISOString(),
        })
        .select()
        .single();
      check("admin CAN approve a timesheet", !approval.error, approval.error?.message);

      check(
        "staff CAN read their own approval",
        (await visibleIds(staff, "timesheet_approvals")).ids.includes(approval.data?.id),
      );
      check(
        "staff CAN read pay periods",
        (await visibleIds(staff, "pay_periods")).ids.includes(period.data?.id),
      );

      console.log("\n═══ time clock — DENY (adversarial, each with a positive control) ═══\n");

      // (1) The ledger is immutable — for staff AND for admin.
      {
        const own = await staff
          .from("punches")
          .select("id, punched_at")
          .eq("id", inPunch.data.id)
          .maybeSingle();
        check(
          "POSITIVE CONTROL — the staff member can see their own punch, so the row is reachable",
          Boolean(own.data),
        );

        const edit = await refusalMode(
          staff
            .from("punches")
            .update({ punched_at: new Date().toISOString() })
            .eq("id", inPunch.data.id)
            .select(),
        );
        check("staff CANNOT edit their own punch", !edit.startsWith("ALLOWED"), edit);

        const del = await refusalMode(
          staff.from("punches").delete().eq("id", inPunch.data.id).select(),
        );
        check("staff CANNOT delete their own punch", !del.startsWith("ALLOWED"), del);

        // The admin is not exempt: this is an audit trail, not an admin's notes.
        const adminEdit = await refusalMode(
          admin
            .from("punches")
            .update({ note: "rewritten" })
            .eq("id", inPunch.data.id)
            .select(),
        );
        check("even an ADMIN cannot edit a punch", !adminEdit.startsWith("ALLOWED"), adminEdit);

        const adminDel = await refusalMode(
          admin.from("punches").delete().eq("id", inPunch.data.id).select(),
        );
        check("even an ADMIN cannot delete a punch", !adminDel.startsWith("ALLOWED"), adminDel);

        const stillThere = await admin
          .from("punches")
          .select("punched_at, note")
          .eq("id", inPunch.data.id)
          .maybeSingle();
        check(
          "the punch survived every attempt, unchanged",
          stillThere.data?.punched_at === inPunch.data.punched_at && stillThere.data?.note === "",
          JSON.stringify(stillThere.data),
        );
      }

      // (2) Staff cannot choose WHEN their punch happened.
      //
      // Paid hours must not be client-assertable: without this, anyone holding
      // the publishable key could POST a punch dated to last Tuesday.
      {
        const backdated = new Date(Date.now() - 3 * 86_400_000).toISOString();

        // POSITIVE CONTROL — punched_at really is settable, and a supplied time
        // really does survive. Without this, "staff cannot backdate" would pass
        // just as happily against a column that ignored the field for everyone.
        const adminBackdated = await admin
          .from("punches")
          .insert({
            profile_id: users.staff.profileId,
            direction: "in",
            punched_at: backdated,
            source: "admin_adjustment",
            adjusts_punch_id: inPunch.data.id,
            note: "Backdated correction — the whole point of an adjustment",
          })
          .select()
          .single();
        check(
          "POSITIVE CONTROL — an admin correction keeps the time it was given",
          !adminBackdated.error &&
            Math.abs(Date.parse(adminBackdated.data.punched_at) - Date.parse(backdated)) < 1000,
          adminBackdated.error?.message ?? `got ${adminBackdated.data?.punched_at}`,
        );
        if (adminBackdated.data) madePunches.push(adminBackdated.data.id);

        // The same field, from staff: silently overwritten with now().
        const staffBackdated = await staff
          .from("punches")
          .insert({
            profile_id: users.staff.profileId,
            direction: "out",
            punched_at: backdated,
          })
          .select()
          .single();
        check(
          "staff CAN still punch when they send a bogus time",
          !staffBackdated.error,
          staffBackdated.error?.message,
        );
        if (staffBackdated.data) madePunches.push(staffBackdated.data.id);

        const drift = staffBackdated.data
          ? Math.abs(Date.parse(staffBackdated.data.punched_at) - Date.now())
          : Infinity;
        check(
          "a backdated staff punch is recorded at ~now(), not the time it claimed",
          drift < 60_000,
          `recorded ${staffBackdated.data?.punched_at} — ${Math.round(drift / 1000)}s from now`,
        );

        // And forward, which is the direction that inflates a timesheet.
        const future = new Date(Date.now() + 6 * 3600_000).toISOString();
        const staffFuture = await staff
          .from("punches")
          .insert({
            profile_id: users.staff.profileId,
            direction: "in",
            punched_at: future,
          })
          .select()
          .single();
        if (staffFuture.data) madePunches.push(staffFuture.data.id);
        check(
          "a forward-dated staff punch is also recorded at ~now()",
          Boolean(staffFuture.data) &&
            Math.abs(Date.parse(staffFuture.data.punched_at) - Date.now()) < 60_000,
          `recorded ${staffFuture.data?.punched_at}`,
        );
      }

      // (3) Staff cannot punch for anyone else, or forge a correction.
      check(
        "POSITIVE CONTROL — another profile exists to attempt against",
        Boolean(users.admin.profileId) && users.admin.profileId !== users.staff.profileId,
      );
      {
        const mode = await refusalMode(
          staff
            .from("punches")
            .insert({
              profile_id: users.admin.profileId,
              direction: "in",
              punched_at: new Date().toISOString(),
            })
            .select(),
        );
        check("staff CANNOT punch for another profile", !mode.startsWith("ALLOWED"), mode);
      }
      {
        const mode = await refusalMode(
          staff
            .from("punches")
            .insert({
              profile_id: users.staff.profileId,
              direction: "out",
              punched_at: new Date().toISOString(),
              source: "admin_adjustment",
              adjusts_punch_id: inPunch.data.id,
              note: "self-approved",
            })
            .select(),
        );
        check("staff CANNOT record a punch as an admin_adjustment", !mode.startsWith("ALLOWED"), mode);
      }
      {
        const mode = await refusalMode(
          staff
            .from("punches")
            .insert({
              profile_id: users.staff.profileId,
              direction: "in",
              punched_at: new Date().toISOString(),
              adjusts_punch_id: inPunch.data.id,
            })
            .select(),
        );
        check("staff CANNOT attach adjusts_punch_id to their own punch", !mode.startsWith("ALLOWED"), mode);
      }

      // (4) One employee's hours are not another's business.
      {
        const adminPunch = await admin
          .from("punches")
          .insert({
            profile_id: users.admin.profileId,
            direction: "in",
            punched_at: new Date().toISOString(),
            source: "admin_adjustment",
            adjusts_punch_id: inPunch.data.id,
            note: "control row on another profile",
          })
          .select()
          .single();
        check(
          "POSITIVE CONTROL — a punch belonging to someone else exists and the admin can see it",
          !adminPunch.error && Boolean(adminPunch.data),
          adminPunch.error?.message,
        );
        if (adminPunch.data) madePunches.push(adminPunch.data.id);

        await assertCannotSee(
          "staff CANNOT read another employee's punch",
          staff,
          "punches",
          adminPunch.data.id,
        );
      }

      // (5) Pay periods and approvals are the barn's to manage.
      const staffWrites = [
        ["INSERT a pay period", staff.from("pay_periods").insert({ start_date: "2026-02-02", end_date: "2026-02-08" }).select()],
        ["UPDATE a pay period", staff.from("pay_periods").update({ status: "approved" }).eq("id", period.data.id).select()],
        ["DELETE a pay period", staff.from("pay_periods").delete().eq("id", period.data.id).select()],
        [
          "approve their own timesheet",
          staff
            .from("timesheet_approvals")
            .insert({ period_id: period.data.id, profile_id: users.staff.profileId, total_minutes: 9999 })
            .select(),
        ],
        [
          "inflate an existing approval",
          staff.from("timesheet_approvals").update({ total_minutes: 9999 }).eq("id", approval.data?.id).select(),
        ],
      ];
      for (const [label, query] of staffWrites) {
        const mode = await refusalMode(query);
        check(`staff CANNOT ${label}`, !mode.startsWith("ALLOWED"), mode);
      }
      {
        const after = await admin
          .from("timesheet_approvals")
          .select("total_minutes")
          .eq("id", approval.data?.id)
          .maybeSingle();
        check(
          "the approved total is untouched after those attempts",
          after.data?.total_minutes === 480,
          `saw ${after.data?.total_minutes}`,
        );
      }

      // (6) Parents and anon have no business in payroll at all.
      for (const table of ["punches", "pay_periods", "timesheet_approvals"]) {
        check(`parent sees 0 rows in ${table}`, (await visibleIds(parent, table)).ids.length === 0);
        check(`anon sees 0 rows in ${table}`, (await visibleIds(anon, table)).ids.length === 0);
      }
      {
        const mode = await refusalMode(
          parent
            .from("punches")
            .insert({
              profile_id: users.parent.profileId,
              direction: "in",
              punched_at: new Date().toISOString(),
            })
            .select(),
        );
        check("parent CANNOT clock in", !mode.startsWith("ALLOWED"), mode);
      }

      // --- clean up ---------------------------------------------------------
      // Pay periods and approvals can be removed (admin has a DELETE policy,
      // and approvals cascade). Punches deliberately CANNOT be: there is no
      // DELETE policy for anyone, which is the property this section exists to
      // prove. They are cleared by `npm run db:seed`, which uses the service
      // role — the one thing that legitimately sits outside RLS.
      //
      // That is also why nothing here counts punches absolutely: between two
      // runs without a re-seed, the previous run's rows are still there.
      for (const id of madePeriods) await admin.from("pay_periods").delete().eq("id", id);
      void madePunches;
    }
  }

  // ===========================================================================
  // horses, horse_riders, feed_plans (Phase 2, slice 1)
  //
  // The property under test is a COLUMN boundary, not a row boundary, so the
  // controls have to be sharper than usual. Three things must all be true at
  // once for "the riding family cannot read the breed" to mean anything:
  //
  //   1. the breed is actually stored on that row  (else nothing is hidden)
  //   2. somebody CAN read it — admin, staff, and the owning family
  //   3. the riding family, who demonstrably reaches the horse's basics,
  //      cannot
  //
  // Miss (1) and the assertion passes against a null. Miss (2) and it passes
  // against a column nobody can read. Miss (3) and it is not testing the tier
  // at all. Every deny below is preceded by the matching allow.
  // ===========================================================================
  {
    const horseFx = fixtures.horses ?? {};
    const haveHorses = Boolean(
      horseFx.owned?.id && horseFx.ridden?.id && horseFx.barn?.id && horseFx.unrelated?.id && parent2,
    );

    if (!haveHorses) {
      console.log("\n\n═══ horses — SKIPPED ═══");
      console.log("  Migration 0010 is not applied yet, or seed-output.json predates the second");
      console.log("  parent fixture. Apply supabase/migrations/20260728000600_horses.sql,");
      console.log("  re-seed, re-run.");
      skipped += 1;
    } else {
      const owned = horseFx.owned;
      const ridden = horseFx.ridden;
      const barnHorse = horseFx.barn;
      const unrelated = horseFx.unrelated;
      const fixtureHorseIds = [owned.id, ridden.id, barnHorse.id, unrelated.id];

      console.log("\n\n═══ horses — ALLOW ═══\n");

      // --- the fixtures themselves are the control ---------------------------
      check(
        "fixture control: every fixture horse carries a breed, dob and notes",
        [owned, ridden, barnHorse, unrelated].every((h) => h.breed && h.dob && h.notes),
        "a null sensitive column would make every deny below vacuous",
      );

      console.log("\nadmin and staff — full read on every horse");
      for (const [label, client] of [
        ["admin", admin],
        ["staff", staff],
      ]) {
        const { data, error } = await client
          .from("horses")
          .select("id, name, breed, dob, notes")
          .in("id", fixtureHorseIds);

        check(
          `${label} sees all 4 fixture horses`,
          !error && (data?.length ?? 0) === 4,
          error?.message ?? `saw ${data?.length}`,
        );

        // The row the parent will be refused, read in full by someone allowed
        // to. This is the positive control the column-deny tests hang off.
        const riddenRow = data?.find((h) => h.id === ridden.id);
        check(
          `${label} reads breed/dob/notes on the ridden horse`,
          Boolean(riddenRow?.breed && riddenRow?.dob && riddenRow?.notes),
          riddenRow ? "a sensitive column came back empty" : "row not visible",
        );
      }

      console.log("\nowner family — full read on the horse it owns");
      {
        const { data, error } = await parent
          .from("horses")
          .select("id, name, breed, dob, notes")
          .eq("id", owned.id)
          .maybeSingle();

        check("owner parent sees their own horse", !error && data?.id === owned.id, error?.message);
        check(
          "owner parent reads breed, dob and notes on their OWN horse",
          Boolean(data?.breed && data?.dob && data?.notes),
          "parents are not blanket-denied these columns — ownership is what decides",
        );
        check(
          "the values match what was seeded (not a coincidentally-truthy row)",
          data?.breed === owned.breed && data?.notes === owned.notes,
          `got ${data?.breed} / ${data?.notes}`,
        );
      }

      console.log("\nriding family — the basics tier, and only the basics tier");
      let basics = [];
      {
        const { data, error } = await parent.rpc("horses_basics");
        basics = data ?? [];

        check("parent can call horses_basics()", !error, error?.message);

        const riddenBasics = basics.find((h) => h.id === ridden.id);
        const barnBasics = basics.find((h) => h.id === barnHorse.id);

        // POSITIVE CONTROL for every "cannot reach breed" below: the parent
        // demonstrably reaches this horse, and gets real values for the three
        // columns they are entitled to.
        check(
          "parent reaches the ridden horse through basics",
          Boolean(riddenBasics),
          `basics returned ${basics.length} row(s)`,
        );
        check(
          "the basics row carries name, barn_name and photo",
          Boolean(riddenBasics?.name && riddenBasics?.barn_name && riddenBasics?.photo_url),
          JSON.stringify(riddenBasics ?? null),
        );
        check(
          "parent also reaches the barn-owned horse their rider rides",
          Boolean(barnBasics),
          "barn-owned + ridden is the same tier as another family's horse + ridden",
        );

        // The projection IS the boundary. Not "the app did not ask for breed" —
        // the columns are not in the return type at all.
        const keys = Object.keys(riddenBasics ?? {});
        check(
          "the basics projection contains no sensitive column",
          keys.length > 0 && !["breed", "dob", "notes", "owner_family_id"].some((k) => keys.includes(k)),
          `keys: ${keys.join(", ")}`,
        );

        check(
          "the unrelated horse is absent from basics — riding is what earns it",
          !basics.some((h) => h.id === unrelated.id),
        );
        check(
          "the owned horse is absent from basics — it is read in full from the table",
          !basics.some((h) => h.id === owned.id),
        );
      }

      console.log("\nfeed plans");
      {
        const { data, error } = await parent.from("feed_plans").select("*").eq("horse_id", owned.id);
        check(
          "owner parent reads their own horse's feed chart (both meals)",
          !error && (data?.length ?? 0) === 2,
          error?.message ?? `saw ${data?.length}`,
        );
        check(
          "the chart carries the special instructions staff and owner both need",
          Boolean(data?.some((p) => p.meal === "am" && p.special_instructions)),
          "the am plan came back without its instructions",
        );

        const { data: board, error: boardError } = await staff
          .from("feed_plans")
          .select("id, horse_id, meal")
          .in("horse_id", fixtureHorseIds)
          .eq("active", true);
        check(
          "staff sees every fixture horse's active plans — the feed board",
          !boardError && (board?.length ?? 0) === 4,
          boardError?.message ?? `saw ${board?.length}`,
        );
      }

      console.log("\nhorse_riders");
      {
        const { data, error } = await parent.from("horse_riders").select("horse_id, rider_id");
        const seen = new Set((data ?? []).map((r) => r.horse_id));
        check(
          "parent sees their own rider's horse assignments",
          !error && seen.has(ridden.id) && seen.has(barnHorse.id),
          error?.message ?? `saw ${[...seen].length} link(s)`,
        );
        check(
          "parent does NOT see another family's rider assignment",
          !seen.has(unrelated.id),
          "the control rider's link to the unrelated horse leaked",
        );
        // Both families have a rider on the barn horse, so "which horse" no
        // longer distinguishes them — assert on the rider instead. Every link
        // this parent can read must belong to their own rider.
        check(
          "every link the parent reads belongs to their own rider",
          (data ?? []).every((r) => r.rider_id === riderId),
          `saw rider ids: ${[...new Set((data ?? []).map((r) => r.rider_id))].join(", ")}`,
        );
      }

      // =======================================================================
      console.log("\n\nthe OTHER family, from their own login — the mirror image");
      //
      // Everything above is one family's view. A policy that leaked in the
      // other direction would pass every assertion so far, because there was
      // nobody signed in on the other side to notice. This section is that
      // second side: the control family's parent, checked against the same
      // rules, in reverse.
      // =======================================================================
      {
        const { data, error } = await parent2.from("horses").select("id, name, breed, notes");
        const visible = new Set((data ?? []).map((h) => h.id));

        // Control: they really do reach their own horses, in full.
        check(
          "the other family sees BOTH horses it owns",
          !error && visible.has(ridden.id) && visible.has(unrelated.id),
          error?.message ?? `saw ${visible.size} horse(s)`,
        );
        const riddenRow = (data ?? []).find((h) => h.id === ridden.id);
        check(
          "…and reads breed and notes on them, being the owner",
          Boolean(riddenRow?.breed && riddenRow?.notes),
          "the owner tier is not working from this side",
        );

        // The deny, in the direction nothing could previously test.
        check(
          "the other family CANNOT see the first family's horse",
          !visible.has(owned.id),
          "cross-family read leaked in the reverse direction",
        );
        check(
          "the other family CANNOT see the barn horse it does not own",
          !visible.has(barnHorse.id),
          "barn-owned is not the same as visible-to-everyone",
        );
        check(
          "the other family sees exactly the 2 fixture horses it owns",
          fixtureHorseIds.filter((id) => visible.has(id)).length === 2,
          `saw ${fixtureHorseIds.filter((id) => visible.has(id)).length} of the 4`,
        );
      }

      {
        const { data, error } = await parent2.rpc("horses_basics");
        const basics2 = data ?? [];

        // Control: the second family HAS a basics tier, so the deny below is
        // about scoping and not about an empty function.
        check(
          "the other family reaches the barn horse through basics",
          !error && basics2.some((h) => h.id === barnHorse.id),
          error?.message ?? `basics returned ${basics2.length} row(s)`,
        );
        check(
          "the other family's basics carry no sensitive column either",
          basics2.length > 0 &&
            !["breed", "dob", "notes"].some((k) => Object.keys(basics2[0]).includes(k)),
          `keys: ${Object.keys(basics2[0] ?? {}).join(", ")}`,
        );
        check(
          "the first family's horse is absent from the other family's basics",
          !basics2.some((h) => h.id === owned.id),
        );
      }

      {
        // Control first: they read their own horse's chart.
        const { data: own } = await parent2.from("feed_plans").select("id").eq("horse_id", ridden.id);
        check(
          "the other family reads the feed chart of a horse it owns",
          (own?.length ?? 0) === 1,
          `saw ${own?.length}`,
        );

        const { data: theirs } = await parent2
          .from("feed_plans")
          .select("id")
          .eq("horse_id", owned.id);
        check(
          "the other family CANNOT read the first family's feed chart",
          (theirs?.length ?? 0) === 0,
          `LEAKED ${theirs?.length} row(s)`,
        );
      }

      {
        const { data } = await parent2.from("horse_riders").select("rider_id");
        check(
          "every link the other family reads belongs to THEIR rider",
          (data ?? []).length > 0 && (data ?? []).every((r) => r.rider_id === controlRiderId),
          `saw rider ids: ${[...new Set((data ?? []).map((r) => r.rider_id))].join(", ")}`,
        );
      }

      {
        const mode = await refusalMode(
          parent2.from("horses").update({ notes: "rewritten" }).eq("id", ridden.id).select(),
        );
        check("the other family CANNOT edit the horse it owns either", !mode.startsWith("ALLOWED"), mode);
      }

      // =======================================================================
      console.log("\n\n═══ horses — DENY (adversarial) ═══\n");
      // =======================================================================

      console.log("the riding family cannot cross from basics to the table");
      await assertCannotSee(
        "parent CANNOT see the ridden horse's row in `horses`",
        parent,
        "horses",
        ridden.id,
      );
      await assertCannotSee(
        "parent CANNOT see the barn-owned horse's row in `horses`",
        parent,
        "horses",
        barnHorse.id,
      );
      await assertCannotSee(
        "parent CANNOT see the unrelated horse at all",
        parent,
        "horses",
        unrelated.id,
      );

      {
        // Asking for the sensitive columns by name, on a horse they provably
        // reach through basics. This is the query the app is not trusted to
        // avoid writing.
        const { data, error } = await parent
          .from("horses")
          .select("id, breed, dob, notes")
          .eq("id", ridden.id);
        check(
          "parent CANNOT read breed/dob/notes on the horse their rider rides",
          !error && (data?.length ?? 0) === 0,
          error?.message ?? `LEAKED: ${JSON.stringify(data)}`,
        );
      }

      {
        // The realistic bypass: reach the horse through a row they ARE allowed
        // to read. PostgREST embeds respect the embedded table's RLS, and this
        // proves it rather than assuming it.
        const { data, error } = await parent
          .from("horse_riders")
          .select("horse_id, horses(breed, notes)")
          .eq("horse_id", ridden.id);
        const leaked = (data ?? []).some((row) => row.horses?.breed || row.horses?.notes);
        check(
          "parent CANNOT reach breed/notes by embedding horses through horse_riders",
          !error && !leaked,
          error?.message ?? `LEAKED: ${JSON.stringify(data)}`,
        );
      }

      {
        // And the projection will not even name the column.
        const { error } = await parent.rpc("horses_basics").select("id, breed");
        check(
          "horses_basics() cannot be asked for breed — it is not in the return type",
          Boolean(error),
          "selecting a column that should not exist succeeded",
        );
      }

      console.log("\nunrelated family, and the write boundary");
      {
        const { data } = await parent.from("horses").select("id");
        const visible = new Set((data ?? []).map((h) => h.id));
        check(
          "parent sees exactly ONE fixture horse — the one they own",
          fixtureHorseIds.filter((id) => visible.has(id)).length === 1 && visible.has(owned.id),
          `saw ${fixtureHorseIds.filter((id) => visible.has(id)).length} of the 4 fixture horses`,
        );
      }

      {
        const mode = await refusalMode(
          parent.from("horses").insert({ name: "Parent-created horse" }).select(),
        );
        check("parent CANNOT create a horse", !mode.startsWith("ALLOWED"), mode);
      }

      {
        // The sharpest write test: a row the parent CAN see. Read access is
        // real, so a refusal here is about the write policy, not visibility.
        const mode = await refusalMode(
          parent.from("horses").update({ notes: "rewritten by a parent" }).eq("id", owned.id).select(),
        );
        check("parent CANNOT edit the horse they own", !mode.startsWith("ALLOWED"), mode);

        const { data } = await parent.from("horses").select("notes").eq("id", owned.id).maybeSingle();
        check(
          "…and the note is unchanged when re-read",
          data?.notes === owned.notes,
          `now: ${data?.notes}`,
        );
      }

      {
        const mode = await refusalMode(parent.from("horses").delete().eq("id", owned.id).select());
        check("parent CANNOT delete the horse they own", !mode.startsWith("ALLOWED"), mode);

        // Re-read rather than trust the refusal: a delete that reported zero
        // rows and still removed one would pass the line above.
        const { data } = await admin.from("horses").select("id").eq("id", owned.id).maybeSingle();
        check("…and the horse is still there when admin re-reads it", data?.id === owned.id);
      }

      {
        // Seating your own rider on any horse you like would be the horse
        // equivalent of the backfill_book_rider hole.
        const mode = await refusalMode(
          parent
            .from("horse_riders")
            .insert({ horse_id: unrelated.id, rider_id: riderId })
            .select(),
        );
        check("parent CANNOT assign their rider to a horse", !mode.startsWith("ALLOWED"), mode);
      }

      {
        const mode = await refusalMode(
          parent
            .from("feed_plans")
            .insert({ horse_id: owned.id, meal: "lunch", description: "parent-written" })
            .select(),
        );
        check("parent CANNOT write a feed plan for their own horse", !mode.startsWith("ALLOWED"), mode);
      }

      {
        // Feed access follows OWNERSHIP, not riding — and the control is that
        // this exact plan is readable by admin and sits on a horse the parent
        // provably reaches through basics.
        const { data: control } = await admin
          .from("feed_plans")
          .select("id")
          .eq("horse_id", ridden.id)
          .eq("active", true);
        check(
          "control: the ridden horse really does have an active feed plan",
          (control?.length ?? 0) === 1,
          `admin saw ${control?.length}`,
        );

        const { data, error } = await parent.from("feed_plans").select("*").eq("horse_id", ridden.id);
        check(
          "parent CANNOT read the feed chart of a horse they ride but do not own",
          !error && (data?.length ?? 0) === 0,
          error?.message ?? `LEAKED ${data?.length} row(s)`,
        );

        const { data: other } = await parent.from("feed_plans").select("*").eq("horse_id", unrelated.id);
        check(
          "parent CANNOT read an unrelated family's feed chart",
          (other?.length ?? 0) === 0,
          `LEAKED ${other?.length} row(s)`,
        );
      }

      console.log("\nstaff read everything, and write nothing");
      {
        // Control first: staff genuinely reach this row (asserted above), so a
        // refused write is about the write policy.
        const mode = await refusalMode(
          staff.from("horses").update({ notes: "rewritten by staff" }).eq("id", barnHorse.id).select(),
        );
        check("staff CANNOT edit a horse", !mode.startsWith("ALLOWED"), mode);

        const { data } = await staff.from("horses").select("notes").eq("id", barnHorse.id).maybeSingle();
        check(
          "…and the barn horse's notes are unchanged",
          data?.notes === barnHorse.notes,
          `now: ${data?.notes}`,
        );
      }

      {
        const mode = await refusalMode(
          staff.from("horses").insert({ name: "Staff-created horse" }).select(),
        );
        check("staff CANNOT create a horse", !mode.startsWith("ALLOWED"), mode);
      }

      {
        const mode = await refusalMode(staff.from("horses").delete().eq("id", barnHorse.id).select());
        check("staff CANNOT delete a horse", !mode.startsWith("ALLOWED"), mode);
      }

      {
        const mode = await refusalMode(
          staff
            .from("feed_plans")
            .update({ description: "rewritten by staff" })
            .eq("horse_id", owned.id)
            .eq("meal", "am")
            .select(),
        );
        check("staff CANNOT rewrite a feed plan", !mode.startsWith("ALLOWED"), mode);
      }

      {
        const mode = await refusalMode(
          staff
            .from("horse_riders")
            .insert({ horse_id: owned.id, rider_id: controlRiderId })
            .select(),
        );
        check("staff CANNOT assign a rider to a horse", !mode.startsWith("ALLOWED"), mode);
      }

      console.log("\nanon");
      for (const table of ["horses", "horse_riders", "feed_plans"]) {
        const { ids } = await visibleIds(anon, table);
        check(`anon sees 0 rows in ${table}`, ids.length === 0, `saw ${ids.length}`);
      }
      {
        const { data, error } = await anon.rpc("horses_basics");
        check(
          "anon CANNOT call horses_basics()",
          blockedAtTheDoor(error),
          error
            ? `it ran and returned ${error.code}: ${error.message}`
            : `it executed and returned ${data?.length ?? 0} row(s)`,
        );
      }

      // --- admin can, which is the control for every "cannot" above ----------
      console.log("\nadmin — the control proving the write policies are not simply broken");
      {
        const { data, error } = await admin
          .from("horses")
          .insert({ name: "Policy Test Horse", breed: "Test", active: true })
          .select()
          .single();
        check("admin CAN create a horse", !error && Boolean(data), error?.message);

        if (data) {
          const { error: updateError } = await admin
            .from("horses")
            .update({ notes: "admin edit" })
            .eq("id", data.id);
          check("admin CAN edit a horse", !updateError, updateError?.message);

          const { error: linkError } = await admin
            .from("horse_riders")
            .insert({ horse_id: data.id, rider_id: riderId });
          check("admin CAN assign a rider", !linkError, linkError?.message);

          const { error: planError } = await admin
            .from("feed_plans")
            .insert({ horse_id: data.id, meal: "am", description: "admin plan" });
          check("admin CAN write a feed plan", !planError, planError?.message);

          // Cascades clean up the link and the plan.
          await admin.from("horses").delete().eq("id", data.id);
          const { data: gone } = await admin.from("horses").select("id").eq("id", data.id);
          check("admin CAN delete a horse", (gone?.length ?? 0) === 0);
        }
      }
    }
  }

  // ===========================================================================
  // care_events (Phase 2, slice 2)
  //
  // The most sensitive table in the app, so the denials are the point and each
  // one is preceded by proof that the thing being denied exists and is
  // reachable by somebody.
  //
  // The sharpest control here is the riding family's: they provably reach the
  // ridden horse through horses_basics(), and that horse provably has care
  // events an admin can read. Only then does "they see zero care rows" mean
  // the care boundary held, rather than the horse simply being invisible or
  // the table being empty.
  // ===========================================================================
  {
    const horseFx = fixtures.horses ?? {};
    const care = horseFx.careEvents ?? {};
    const haveCare = Boolean(
      care.ownedVaccine?.id &&
        care.ownedFarrier?.id &&
        care.ownedOverdue?.id &&
        care.riddenCoggins?.id &&
        parent2,
    );

    if (!haveCare) {
      console.log("\n\n═══ care events — SKIPPED ═══");
      console.log("  Migration 0011 is not applied yet, or seed-output.json predates the care");
      console.log("  fixtures. Apply supabase/migrations/20260728000700_care_events.sql,");
      console.log("  re-seed, re-run.");
      skipped += 1;
    } else {
      const owned = horseFx.owned;
      const ridden = horseFx.ridden;
      const ownedCareIds = [care.ownedVaccine.id, care.ownedFarrier.id, care.ownedOverdue.id];
      const riddenCareIds = [care.riddenCoggins.id, care.riddenMedication.id];
      const allCareIds = [...ownedCareIds, ...riddenCareIds];

      console.log("\n\n═══ care events — ALLOW ═══\n");

      check(
        "fixture control: the care events carry a description and a performed date",
        [care.ownedVaccine, care.riddenCoggins].every((e) => e.description && e.performed_at),
        "an empty care row would make every deny below vacuous",
      );

      for (const [label, client] of [
        ["admin", admin],
        ["staff", staff],
      ]) {
        const { data, error } = await client
          .from("care_events")
          .select("id, type, description, performed_at, due_next")
          .in("id", allCareIds);
        check(
          `${label} reads every fixture care event`,
          !error && (data?.length ?? 0) === 5,
          error?.message ?? `saw ${data?.length}`,
        );
        const coggins = data?.find((e) => e.id === care.riddenCoggins.id);
        check(
          `${label} reads the description on another family's horse`,
          Boolean(coggins?.description),
          "the row came back without its description",
        );
      }

      console.log("\nthe owning family — full care history for the horse they own");
      {
        const { data, error } = await parent
          .from("care_events")
          .select("id, type, description, performed_at, due_next")
          .eq("horse_id", owned.id);
        check(
          "owner parent reads ALL THREE care events on their own horse",
          !error && (data?.length ?? 0) === 3,
          error?.message ?? `saw ${data?.length}`,
        );
        const vaccine = data?.find((e) => e.id === care.ownedVaccine.id);
        check(
          "…in full — description, date performed, and what is due next",
          Boolean(vaccine?.description && vaccine?.performed_at && vaccine?.due_next),
          JSON.stringify(vaccine ?? null),
        );
        check(
          "…and the worming/farrier history is there, which is the point for a boarder",
          data?.some((e) => e.type === "farrier") ?? false,
        );
      }

      console.log("\nstaff log care — insert only, attributed to them");
      const staffLogged = [];
      {
        // The spoof attempt: staff claims the admin logged it.
        const { data, error } = await staff
          .from("care_events")
          .insert({
            horse_id: owned.id,
            type: "wound",
            description: "Policy test — staff-logged care event.",
            performed_at: "2026-07-20",
            logged_by: users.admin.profileId,
          })
          .select()
          .single();

        check("staff CAN log a care event", !error && Boolean(data), error?.message);

        if (data) {
          staffLogged.push(data.id);
          check(
            "logged_by is forced to the caller — the claimed profile is ignored",
            data.logged_by === users.staff.profileId,
            `recorded ${data.logged_by}, staff is ${users.staff.profileId}, admin is ${users.admin.profileId}`,
          );
          check(
            "a past performed_at is accepted — care is routinely logged after the fact",
            data.performed_at === "2026-07-20",
            `stored ${data.performed_at}`,
          );
        }
      }

      console.log("\ndue soon, and the digest");
      {
        const { data, error } = await admin
          .from("care_events")
          .select("id, due_next")
          .not("due_next", "is", null)
          .gte("due_next", new Date().toISOString().slice(0, 10))
          .order("due_next", { ascending: true });

        check(
          "admin's due-soon surface finds the fixture item due in 14 days",
          !error && (data ?? []).some((e) => e.id === care.ownedVaccine.id),
          error?.message ?? `saw ${data?.length} due item(s)`,
        );
        const dues = (data ?? []).map((e) => e.due_next);
        check(
          "…soonest first",
          dues.every((d, i) => i === 0 || dues[i - 1] <= d),
          dues.join(", "),
        );
      }

      {
        const digestLink = `/manage/care?event=${care.ownedVaccine.id}`;
        const existedBefore = async () => {
          const { data } = await admin
            .from("notifications")
            .select("id")
            .eq("type", "care_due")
            .eq("link_path", digestLink);
          return (data?.length ?? 0) > 0;
        };

        const before = await existedBefore();
        const { data: firstRun, error } = await admin.rpc("enqueue_care_due_digest");
        check("admin CAN run the care digest", !error, error?.message);

        // Order-independent, and deliberately ONE assertion rather than a
        // conditional block: a check that only sometimes runs makes the suite
        // total change between runs, which reads like a flake.
        //
        // `db:seed` clears care_due, so on the first run after a seed `before`
        // is false and this genuinely tests that the digest creates. On the
        // second run of the same seed it is satisfied by `before`, and the two
        // assertions after it carry the weight instead.
        check(
          "the digest creates the notification when it is missing",
          before || (firstRun ?? 0) >= 1,
          `already present: ${before}, created this call: ${firstRun}`,
        );

        const { data: secondRun } = await admin.rpc("enqueue_care_due_digest");
        check(
          "running it again creates nothing — idempotent per care item",
          secondRun === 0,
          `created ${secondRun} on the second call`,
        );

        check(
          "the admin has a care_due notification for the item that is due",
          await existedBefore(),
          "the digest reported success but nothing landed",
        );

        // The amendment: overdue care is IN the digest, not only on the screen.
        // Control first — the fixture really is in the past, so this is not
        // just re-testing the future item under another name.
        check(
          "control: the overdue fixture's due date really is in the past",
          care.ownedOverdue.due_next < new Date().toISOString().slice(0, 10),
          `due_next is ${care.ownedOverdue.due_next}`,
        );

        const { data: overdueNotif } = await admin
          .from("notifications")
          .select("id")
          .eq("type", "care_due")
          .eq("link_path", `/manage/care?event=${care.ownedOverdue.id}`);
        check(
          "the digest includes care that is already OVERDUE",
          (overdueNotif?.length ?? 0) === 1,
          `found ${overdueNotif?.length} notification(s) for the overdue item`,
        );
      }

      // =======================================================================
      console.log("\n\n═══ care events — DENY (adversarial) ═══\n");
      // =======================================================================

      console.log("riding a horse earns NOTHING here — there is no basics tier for care");
      {
        // Control: they really do reach this horse.
        const { data: basics } = await parent.rpc("horses_basics");
        check(
          "control: the parent reaches the ridden horse through basics",
          (basics ?? []).some((h) => h.id === ridden.id),
          "if they cannot see the horse at all, the care denial proves nothing",
        );

        // Control: the horse really does have care events.
        const { data: exists } = await admin
          .from("care_events")
          .select("id")
          .eq("horse_id", ridden.id);
        check(
          "control: that horse really does have care events",
          (exists?.length ?? 0) === 2,
          `admin saw ${exists?.length}`,
        );

        const { data, error } = await parent
          .from("care_events")
          .select("*")
          .eq("horse_id", ridden.id);
        check(
          "parent sees ZERO care events for a horse their rider rides",
          !error && (data?.length ?? 0) === 0,
          error?.message ?? `LEAKED ${data?.length} row(s)`,
        );

        for (const id of riddenCareIds) {
          await assertCannotSee(
            `parent CANNOT fetch that care event by id (${id.slice(0, 8)}…)`,
            parent,
            "care_events",
            id,
          );
        }
      }

      console.log("\nand neither family can read the other's — checked from both logins");
      {
        // Control on each side first.
        const { data: mine } = await parent
          .from("care_events")
          .select("id")
          .in("id", ownedCareIds);
        check(
          "control: the first family reads its own three care events",
          (mine?.length ?? 0) === 3,
          `saw ${mine?.length}`,
        );

        const { data: theirs } = await parent2
          .from("care_events")
          .select("id")
          .in("id", riddenCareIds);
        check(
          "control: the other family reads its own two care events",
          (theirs?.length ?? 0) === 2,
          `saw ${theirs?.length}`,
        );

        const { data: leak1 } = await parent.from("care_events").select("id").in("id", riddenCareIds);
        check(
          "the first family CANNOT read the other family's care events",
          (leak1?.length ?? 0) === 0,
          `LEAKED ${leak1?.length}`,
        );

        const { data: leak2 } = await parent2.from("care_events").select("id").in("id", ownedCareIds);
        check(
          "the other family CANNOT read the first family's care events",
          (leak2?.length ?? 0) === 0,
          `LEAKED ${leak2?.length}`,
        );
      }

      console.log("\nstaff log, and nothing else — the append-only half");
      {
        const target = staffLogged[0] ?? care.ownedVaccine.id;

        // Control: staff can READ the row they are about to fail to change.
        const { data: readable } = await staff.from("care_events").select("id").eq("id", target);
        check(
          "control: staff can read the care event they are about to try to edit",
          (readable?.length ?? 0) === 1,
          "a refusal means nothing if the row is invisible",
        );

        const mode = await refusalMode(
          staff
            .from("care_events")
            .update({ description: "rewritten by staff" })
            .eq("id", target)
            .select(),
        );
        check(
          "staff CANNOT edit a care event — even one they logged themselves",
          !mode.startsWith("ALLOWED"),
          mode,
        );

        const { data: after } = await admin
          .from("care_events")
          .select("description")
          .eq("id", target)
          .maybeSingle();
        check(
          "…and the description is unchanged when admin re-reads it",
          after?.description !== "rewritten by staff",
          `now: ${after?.description}`,
        );

        const deleteMode = await refusalMode(
          staff.from("care_events").delete().eq("id", target).select(),
        );
        check("staff CANNOT delete a care event", !deleteMode.startsWith("ALLOWED"), deleteMode);

        const { data: survived } = await admin.from("care_events").select("id").eq("id", target);
        check("…and the row survives", (survived?.length ?? 0) === 1);
      }

      console.log("\nparents write nothing; anon sees nothing");
      {
        const mode = await refusalMode(
          parent
            .from("care_events")
            .insert({
              horse_id: owned.id,
              type: "vet",
              description: "Parent-logged care.",
              performed_at: "2026-07-20",
            })
            .select(),
        );
        check("parent CANNOT log care, even on their own horse", !mode.startsWith("ALLOWED"), mode);
      }
      {
        const mode = await refusalMode(
          parent
            .from("care_events")
            .update({ description: "rewritten by a parent" })
            .eq("id", care.ownedVaccine.id)
            .select(),
        );
        check("parent CANNOT edit their own horse's care history", !mode.startsWith("ALLOWED"), mode);
      }
      {
        const { ids } = await visibleIds(anon, "care_events");
        check("anon sees 0 care events", ids.length === 0, `saw ${ids.length}`);
      }
      {
        const { error } = await anon.rpc("enqueue_care_due_digest");
        check(
          "anon CANNOT run the care digest",
          blockedAtTheDoor(error),
          error ? `it ran and returned ${error.code}: ${error.message}` : "it executed",
        );
      }
      {
        // Granted to authenticated, gated on role INSIDE. So this must fail on
        // the function's own terms, not at the door — which is a different
        // failure from anon's above, and worth telling apart.
        const { error } = await staff.rpc("enqueue_care_due_digest");
        check(
          "staff CANNOT run the care digest — refused by the function, not the grant",
          Boolean(error) && !blockedAtTheDoor(error),
          error ? `blocked at the door: ${error.code}` : "it ran for a staff member",
        );
      }

      console.log("\nadmin — the control proving the write policies are not simply broken");
      {
        const { data, error } = await admin
          .from("care_events")
          .insert({
            horse_id: owned.id,
            type: "dental",
            description: "Policy test — admin-logged.",
            performed_at: "2026-07-21",
          })
          .select()
          .single();
        check("admin CAN log a care event", !error && Boolean(data), error?.message);

        if (data) {
          const { error: updateError } = await admin
            .from("care_events")
            .update({ description: "Policy test — admin-edited." })
            .eq("id", data.id);
          check("admin CAN correct a care event", !updateError, updateError?.message);

          await admin.from("care_events").delete().eq("id", data.id);
          const { data: gone } = await admin.from("care_events").select("id").eq("id", data.id);
          check("admin CAN delete a care event", (gone?.length ?? 0) === 0);
        }
      }

      // Clean up what this section created, so counts stay stable across runs.
      for (const id of staffLogged) await admin.from("care_events").delete().eq("id", id);
    }
  }

  // ===========================================================================
  // documents bucket — Storage (Phase 2, slice 3)
  //
  // Table RLS does not cover Storage, so none of the work above says anything
  // about this. Everything here runs through the storage API with a real
  // session, which is what a browser would do.
  //
  // The bucket being PRIVATE is asserted first and separately: if it were
  // public, every policy below could pass while anyone with the URL read the
  // file anyway, without a session and without evaluating a single policy.
  // ===========================================================================
  {
    const horseFx = fixtures.horses ?? {};
    const haveDocs = Boolean(horseFx.owned?.id && horseFx.ridden?.id && parent2);

    if (!haveDocs) {
      console.log("\n\n═══ documents (Storage) — SKIPPED ═══");
      console.log("  Horse fixtures are missing. Apply the migrations, re-seed, re-run.");
      skipped += 1;
    } else {
      const owned = horseFx.owned;
      const ridden = horseFx.ridden;
      const ownedPath = `horse_${owned.id}/policy-test-owned.txt`;
      const riddenPath = `horse_${ridden.id}/policy-test-ridden.txt`;
      const familyPath = `family_${familyId}/policy-test-family.txt`;
      const body = () => new Blob(["policy test document"], { type: "text/plain" });
      const uploaded = [];

      console.log("\n\n═══ documents (Storage) — ALLOW ═══\n");

      for (const [label, client, path] of [
        ["admin", admin, ownedPath],
        ["staff", staff, riddenPath],
      ]) {
        const { error } = await client.storage.from("documents").upload(path, body(), {
          upsert: true,
          contentType: "text/plain",
        });
        check(`${label} CAN upload a document`, !error, error?.message);
        if (!error) uploaded.push(path);
      }

      {
        const { error } = await admin.storage.from("documents").upload(familyPath, body(), {
          upsert: true,
          contentType: "text/plain",
        });
        check("admin CAN upload into a family folder", !error, error?.message);
        if (!error) uploaded.push(familyPath);
      }

      {
        // Control for every "cannot download" below: the file is really there
        // and is really readable by someone.
        const { data, error } = await admin.storage.from("documents").download(ownedPath);
        check(
          "admin CAN download it — the object exists and is reachable",
          !error && Boolean(data),
          error?.message,
        );
      }

      {
        // THE BUCKET IS PRIVATE — asserted behaviourally, not by reading a
        // flag. `listBuckets()` returns nothing useful over an anon-key
        // session (bucket metadata is service-role territory), and a flag is
        // the wrong thing to test anyway: what matters is that the public URL
        // for a real object, fetched with no session at all, does not serve
        // the file. If the bucket were public, every policy above would still
        // pass while anyone with the link read the document.
        const { data } = admin.storage.from("documents").getPublicUrl(ownedPath);
        const response = await fetch(data.publicUrl, { redirect: "manual" });
        check(
          "the bucket is PRIVATE — the public URL serves nothing without a session",
          !response.ok,
          `public URL returned ${response.status}`,
        );
      }

      console.log("\nthe owning family reads its own scope, and nothing else");
      {
        const { data, error } = await parent.storage.from("documents").download(ownedPath);
        check(
          "owner parent CAN download their own horse's document",
          !error && Boolean(data),
          error?.message,
        );
      }
      {
        const { data, error } = await parent.storage.from("documents").download(familyPath);
        check(
          "owner parent CAN download their own family folder's document",
          !error && Boolean(data),
          error?.message,
        );
      }
      {
        const { data, error } = await parent.storage.from("documents").list(`horse_${owned.id}`);
        check(
          "owner parent CAN list their own horse's folder",
          !error && (data ?? []).some((o) => o.name === "policy-test-owned.txt"),
          error?.message ?? `saw ${data?.length} object(s)`,
        );
      }

      // =======================================================================
      console.log("\n\n═══ documents (Storage) — DENY (adversarial) ═══\n");
      // =======================================================================

      console.log("riding a horse earns nothing here either");
      {
        // Control: they provably reach the horse itself.
        const { data: basics } = await parent.rpc("horses_basics");
        check(
          "control: the parent reaches the ridden horse through basics",
          (basics ?? []).some((h) => h.id === ridden.id),
          "if the horse were invisible the document denial would prove nothing",
        );

        const { data, error } = await parent.storage.from("documents").download(riddenPath);
        check(
          "parent CANNOT download a document for a horse they only ride",
          Boolean(error) || !data,
          "LEAKED the document",
        );

        const { data: listed } = await parent.storage.from("documents").list(`horse_${ridden.id}`);
        check(
          "…and CANNOT list that horse's folder",
          (listed ?? []).length === 0,
          `LEAKED ${listed?.length} object name(s)`,
        );
      }

      console.log("\nand neither family reaches the other's — both directions");
      {
        // Control: parent2 really can read its own horse's folder.
        const { data: own, error: ownError } = await parent2.storage
          .from("documents")
          .download(riddenPath);
        check(
          "control: the other family CAN download its own horse's document",
          !ownError && Boolean(own),
          ownError?.message,
        );

        const { data, error } = await parent2.storage.from("documents").download(ownedPath);
        check(
          "the other family CANNOT download the first family's horse document",
          Boolean(error) || !data,
          "LEAKED across families",
        );

        const { data: fam } = await parent2.storage.from("documents").download(familyPath);
        check(
          "the other family CANNOT download the first family's folder",
          !fam,
          "LEAKED a family folder",
        );
      }

      console.log("\nfamilies never write to the vault");
      {
        const { error } = await parent.storage
          .from("documents")
          .upload(`horse_${owned.id}/parent-upload.txt`, body(), { contentType: "text/plain" });
        check(
          "parent CANNOT upload, even for the horse they own",
          Boolean(error),
          "a family wrote to the legal vault",
        );
      }
      {
        const { error } = await parent.storage.from("documents").remove([ownedPath]);
        const { data: stillThere } = await admin.storage.from("documents").download(ownedPath);
        check(
          "parent CANNOT delete their own horse's document",
          Boolean(error) || Boolean(stillThere),
          "the document was removed by a family",
        );
        check("…and the document survives", Boolean(stillThere));
      }

      console.log("\nanon");
      {
        const { data, error } = await anon.storage.from("documents").download(ownedPath);
        check("anon CANNOT download from the vault", Boolean(error) || !data, "LEAKED to anon");
      }
      {
        const { data } = await anon.storage.from("documents").list(`horse_${owned.id}`);
        check("anon CANNOT list the vault", (data ?? []).length === 0, `saw ${data?.length}`);
      }

      // Clean up. Staff and admin both hold delete, so this also exercises it.
      {
        const { error } = await staff.storage.from("documents").remove(uploaded);
        check("staff CAN delete a document — the barn owns the vault", !error, error?.message);
      }
    }
  }

  // ===========================================================================
  // onboarding forms (Phase 2, slice 4)
  //
  // The property under test is that a SIGNATURE MEANS SOMETHING. Three ways it
  // could be worthless, each asserted:
  //
  //   * a family marks a form complete without signing it
  //   * a family edits a form after signing it
  //   * a family answers, or reads, another family's form
  //
  // The row policy decides which rows; the trigger decides which changes. Both
  // are exercised, and every deny is preceded by the matching allow so a
  // refusal cannot be confused with an unreachable row.
  // ===========================================================================
  {
    const formFx = fixtures.forms ?? {};
    const templates = formFx.templates ?? {};
    const submissions = formFx.submissions ?? {};
    const haveForms = Boolean(
      templates.waiver?.id && submissions.mainWaiver?.id && submissions.controlWaiver?.id && parent2,
    );

    if (!haveForms) {
      console.log("\n\n═══ onboarding forms — SKIPPED ═══");
      console.log("  Migration 0013 is not applied yet, or seed-output.json predates the form");
      console.log("  fixtures. Apply supabase/migrations/20260729000200_onboarding_forms.sql,");
      console.log("  re-seed, re-run.");
      skipped += 1;
    } else {
      const mine = submissions.mainWaiver;
      const theirs = submissions.controlWaiver;

      console.log("\n\n═══ onboarding forms — ALLOW ═══\n");

      {
        const { data, error } = await parent
          .from("form_templates")
          .select("id, name, schema")
          .eq("id", templates.waiver.id)
          .maybeSingle();
        check(
          "parent can read the template they have to fill in",
          !error && data?.id === templates.waiver.id,
          error?.message,
        );
        check(
          "…including its field definitions, or there is nothing to render",
          Array.isArray(data?.schema) && data.schema.length > 0,
          JSON.stringify(data?.schema ?? null),
        );
      }

      {
        const { data, error } = await parent
          .from("form_submissions")
          .select("id, status")
          .eq("id", mine.id)
          .maybeSingle();
        check(
          "parent sees their own pending submission",
          !error && data?.id === mine.id,
          error?.message,
        );
        check("…and it starts pending", data?.status === "pending", `status ${data?.status}`);
      }

      {
        // Filling in answers without signing: allowed, stays pending.
        const { error } = await parent
          .from("form_submissions")
          .update({ data: { emergency_contact: "A Person", emergency_phone: "555-0111" } })
          .eq("id", mine.id);
        check("parent CAN save answers without signing", !error, error?.message);

        const { data } = await parent
          .from("form_submissions")
          .select("status, signed_at, data")
          .eq("id", mine.id)
          .maybeSingle();
        check("…it is still pending", data?.status === "pending", `status ${data?.status}`);
        check("…with no signature recorded", data?.signed_at === null, `signed_at ${data?.signed_at}`);
        check(
          "…and the answers were stored",
          data?.data?.emergency_contact === "A Person",
          JSON.stringify(data?.data),
        );
      }

      {
        // Signing it.
        const { error } = await parent
          .from("form_submissions")
          .update({ status: "complete", signed_name: "A Parent" })
          .eq("id", mine.id);
        check("parent CAN sign their own form", !error, error?.message);

        const { data } = await parent
          .from("form_submissions")
          .select("status, signed_name, signed_at")
          .eq("id", mine.id)
          .maybeSingle();
        check("…it is complete", data?.status === "complete", `status ${data?.status}`);
        check("…the signed name is recorded", data?.signed_name === "A Parent", data?.signed_name);
        check(
          "…and signed_at was set BY THE DATABASE, not sent by the client",
          Boolean(data?.signed_at),
          "no signing timestamp",
        );
      }

      {
        const { data, error } = await admin.from("form_submissions").select("id, family_id");
        const ids = new Set((data ?? []).map((s) => s.id));
        check(
          "admin reads every family's submissions",
          !error && ids.has(mine.id) && ids.has(theirs.id),
          error?.message ?? `saw ${ids.size}`,
        );
      }

      {
        const { data, error } = await admin.rpc("ensure_family_onboarding", {
          family: fixtures.familyId,
        });
        check("admin CAN materialise a family's onboarding checklist", !error, error?.message);
        // Idempotent: everything already exists from the seed, so a second run
        // adds nothing. Asserted rather than assumed — this function will be
        // re-run every time the barn adds a template.
        const { data: again } = await admin.rpc("ensure_family_onboarding", {
          family: fixtures.familyId,
        });
        check(
          "…and running it again creates nothing",
          again === 0,
          `created ${again} on the second call (first: ${data})`,
        );
      }

      // =======================================================================
      console.log("\n\n═══ onboarding forms — DENY (adversarial) ═══\n");
      // =======================================================================

      console.log("a signature cannot be faked, skipped, or edited away");
      {
        // Control: the row is signed and complete (asserted above), and the
        // parent can still SEE it — so a refusal is about the change, not the
        // row being gone.
        const { data: visible } = await parent
          .from("form_submissions")
          .select("id")
          .eq("id", mine.id);
        check(
          "control: the parent can still see their signed form",
          (visible?.length ?? 0) === 1,
          "the row vanished, which would make the next assertions vacuous",
        );

        const mode = await refusalMode(
          parent
            .from("form_submissions")
            .update({ data: { emergency_contact: "Changed After Signing" } })
            .eq("id", mine.id)
            .select(),
        );
        check("parent CANNOT edit a form after signing it", !mode.startsWith("ALLOWED"), mode);

        const { data } = await parent
          .from("form_submissions")
          .select("data")
          .eq("id", mine.id)
          .maybeSingle();
        check(
          "…and the signed answers are unchanged",
          data?.data?.emergency_contact === "A Person",
          JSON.stringify(data?.data),
        );
      }

      {
        // The unsigned rider form is the vehicle for the "complete without a
        // signature" attempt, since the waiver is already signed.
        const riderSubmission = submissions.mainRider;
        if (riderSubmission?.id) {
          const mode = await refusalMode(
            parent
              .from("form_submissions")
              .update({ status: "complete" })
              .eq("id", riderSubmission.id)
              .select(),
          );
          check(
            "parent CANNOT mark a form complete without signing it",
            !mode.startsWith("ALLOWED"),
            mode,
          );

          const { data } = await parent
            .from("form_submissions")
            .select("status")
            .eq("id", riderSubmission.id)
            .maybeSingle();
          check(
            "…and it is still pending",
            data?.status === "pending",
            `status is now ${data?.status}`,
          );

          const blankMode = await refusalMode(
            parent
              .from("form_submissions")
              .update({ status: "complete", signed_name: "   " })
              .eq("id", riderSubmission.id)
              .select(),
          );
          check(
            "parent CANNOT sign with whitespace for a name",
            !blankMode.startsWith("ALLOWED"),
            blankMode,
          );
        }
      }

      console.log("\nand a family cannot reach another family's forms");
      {
        // Control: the other family's form provably exists and its own owner
        // provably reaches it.
        const { data: control } = await parent2
          .from("form_submissions")
          .select("id")
          .eq("id", theirs.id);
        check(
          "control: the other family reaches its own submission",
          (control?.length ?? 0) === 1,
          `saw ${control?.length}`,
        );

        await assertCannotSee(
          "parent CANNOT see another family's submission",
          parent,
          "form_submissions",
          theirs.id,
        );
        await assertCannotSee(
          "the other family CANNOT see this family's submission",
          parent2,
          "form_submissions",
          mine.id,
        );

        const mode = await refusalMode(
          parent
            .from("form_submissions")
            .update({ status: "complete", signed_name: "Not Their Name" })
            .eq("id", theirs.id)
            .select(),
        );
        check("parent CANNOT sign another family's form", !mode.startsWith("ALLOWED"), mode);

        const { data: after } = await admin
          .from("form_submissions")
          .select("status")
          .eq("id", theirs.id)
          .maybeSingle();
        check(
          "…and it is still pending when admin re-reads it",
          after?.status === "pending",
          `status ${after?.status}`,
        );
      }

      {
        // Moving a form to another family would be a way to read it.
        const riderSubmission = submissions.mainRider;
        if (riderSubmission?.id) {
          const mode = await refusalMode(
            parent
              .from("form_submissions")
              .update({ family_id: controlFamilyId })
              .eq("id", riderSubmission.id)
              .select(),
          );
          check(
            "parent CANNOT move their form to another family",
            !mode.startsWith("ALLOWED"),
            mode,
          );
        }
      }

      {
        const mode = await refusalMode(
          parent
            .from("form_submissions")
            .insert({ template_id: templates.waiver.id, family_id: controlFamilyId })
            .select(),
        );
        check("parent CANNOT create a submission for another family", !mode.startsWith("ALLOWED"), mode);
      }

      {
        const mode = await refusalMode(
          parent.from("form_submissions").delete().eq("id", mine.id).select(),
        );
        check("parent CANNOT delete a signed form", !mode.startsWith("ALLOWED"), mode);

        const { data } = await admin.from("form_submissions").select("id").eq("id", mine.id);
        check("…and it survives", (data?.length ?? 0) === 1);
      }

      console.log("\nstaff see nothing here; parents cannot author templates");
      {
        const { ids } = await visibleIds(staff, "form_submissions");
        check("staff sees 0 form submissions", ids.length === 0, `saw ${ids.length}`);
        const { ids: templateIds } = await visibleIds(staff, "form_templates");
        check("staff sees 0 form templates", templateIds.length === 0, `saw ${templateIds.length}`);
      }
      {
        const mode = await refusalMode(
          parent
            .from("form_templates")
            .insert({ name: "Parent-authored template", applies_to: "family" })
            .select(),
        );
        check("parent CANNOT create a template", !mode.startsWith("ALLOWED"), mode);
      }
      {
        const mode = await refusalMode(
          parent
            .from("form_templates")
            .update({ required: false })
            .eq("id", templates.waiver.id)
            .select(),
        );
        check("parent CANNOT make a required form optional", !mode.startsWith("ALLOWED"), mode);
      }
      {
        const { error } = await parent.rpc("ensure_family_onboarding", {
          family: fixtures.familyId,
        });
        check(
          "parent CANNOT run the onboarding materialiser — refused by the function",
          Boolean(error) && !blockedAtTheDoor(error),
          error ? `blocked at the door: ${error.code}` : "it ran for a parent",
        );
      }
      {
        for (const table of ["form_templates", "form_submissions"]) {
          const { ids } = await visibleIds(anon, table);
          check(`anon sees 0 rows in ${table}`, ids.length === 0, `saw ${ids.length}`);
        }
      }

      console.log("\nadmin — the control proving the write rules are not simply broken");
      {
        const { error } = await admin
          .from("form_submissions")
          .update({ data: { emergency_contact: "Corrected By The Barn" } })
          .eq("id", mine.id);
        check("admin CAN correct a signed form", !error, error?.message);
      }

      // --- restore the fixture ------------------------------------------------
      //
      // This section SIGNS a submission, which is a one-way door for the family
      // that owns it — that is the whole point of the table. Without putting it
      // back, the second run of the suite would find an already-complete form
      // and "parent CAN sign their own form" would go red for a reason that has
      // nothing to do with a policy.
      //
      // Admin is the right hand to do it: a signed form being un-signed is
      // exactly the barn-only correction path, so this exercises it rather than
      // working around it. The suite must pass twice with no re-seed, and this
      // is what makes that true here.
      {
        const { error } = await admin
          .from("form_submissions")
          .update({ status: "pending", signed_name: null, signed_at: null, data: {} })
          .eq("id", mine.id);
        check(
          "the signed fixture is reset for the next run — admin can un-sign",
          !error,
          error?.message,
        );

        const { data } = await admin
          .from("form_submissions")
          .select("status, signed_at")
          .eq("id", mine.id)
          .maybeSingle();
        check(
          "…and it really is pending again",
          data?.status === "pending" && data?.signed_at === null,
          `status ${data?.status}, signed_at ${data?.signed_at}`,
        );
      }
    }
  }

  // ===========================================================================
  // events + ical_tokens (Phase 2, slice 5)
  //
  // Two separate properties:
  //
  //   events      — a staff-only entry must never reach a family. Ordinary RLS.
  //   ical_tokens — the token is a BEARER CREDENTIAL. Anyone holding it reads
  //                 that person's calendar with no session, so "only its owner
  //                 can read it" includes the admin. That is the unusual rule
  //                 here and it gets the most assertions.
  // ===========================================================================
  {
    const eventFx = fixtures.events ?? {};
    const haveEvents = Boolean(eventFx.public?.id && eventFx.staffOnly?.id && parent2);

    if (!haveEvents) {
      console.log("\n\n═══ events + iCal — SKIPPED ═══");
      console.log("  Migration 0014 is not applied yet, or seed-output.json predates the event");
      console.log("  fixtures. Apply supabase/migrations/20260729000300_events_ical.sql,");
      console.log("  re-seed, re-run.");
      skipped += 1;
    } else {
      const publicEvent = eventFx.public;
      const staffEvent = eventFx.staffOnly;

      console.log("\n\n═══ events + iCal — ALLOW ═══\n");

      for (const [label, client] of [
        ["admin", admin],
        ["staff", staff],
      ]) {
        const { data, error } = await client
          .from("events")
          .select("id, title, visibility")
          .in("id", [publicEvent.id, staffEvent.id]);
        check(
          `${label} sees both the public and the staff-only event`,
          !error && (data?.length ?? 0) === 2,
          error?.message ?? `saw ${data?.length}`,
        );
      }

      {
        const { data, error } = await parent
          .from("events")
          .select("id, title, description")
          .eq("id", publicEvent.id)
          .maybeSingle();
        check(
          "parent sees the barn-wide event",
          !error && data?.id === publicEvent.id,
          error?.message,
        );
        check(
          "…with its details, which is what makes the calendar worth subscribing to",
          Boolean(data?.title && data?.description),
          JSON.stringify(data ?? null),
        );
      }

      console.log("\ncalendar tokens");
      let parentToken = null;
      {
        // Always attempted, never conditionally: a check that only runs on some
        // runs makes the suite total move between them, which reads like a
        // flake. A second attempt hits the unique constraint on profile_id,
        // which is itself the right answer — one token per person.
        const { error: mintError } = await parent
          .from("ical_tokens")
          .insert({ profile_id: users.parent.profileId })
          .select()
          .single();
        check(
          "parent CAN mint their own calendar token, and only one",
          !mintError || mintError.code === "23505",
          mintError ? `${mintError.code}: ${mintError.message}` : "",
        );

        const { data: row } = await parent
          .from("ical_tokens")
          .select("*")
          .eq("profile_id", users.parent.profileId)
          .maybeSingle();
        parentToken = row;

        check("the token exists", Boolean(parentToken?.token), "no token row");
        check(
          "…and it is a server-generated uuid, not something the client chose",
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            parentToken?.token ?? "",
          ),
          `token is ${parentToken?.token}`,
        );
      }

      {
        // Rotation: ask for a new one, get one, and it is different.
        const before = parentToken.token;
        const { data, error } = await parent
          .from("ical_tokens")
          .update({ token: "00000000-0000-0000-0000-000000000000" })
          .eq("profile_id", users.parent.profileId)
          .select()
          .single();

        check("parent CAN rotate their own token", !error, error?.message);
        check(
          "…the chosen value is IGNORED — the database mints the replacement",
          data?.token !== "00000000-0000-0000-0000-000000000000",
          `token became ${data?.token}`,
        );
        check("…and it really changed", data?.token !== before, "rotation was a no-op");
        check("…and the rotation is timestamped", Boolean(data?.rotated_at));
        parentToken = data;
      }

      // =======================================================================
      console.log("\n\n═══ events + iCal — DENY (adversarial) ═══\n");
      // =======================================================================

      console.log("a staff-only event never reaches a family");
      {
        // Control: it exists and staff really do see it (asserted above).
        await assertCannotSee(
          "parent CANNOT see the staff-only event",
          parent,
          "events",
          staffEvent.id,
        );
        await assertCannotSee(
          "the other family CANNOT see it either",
          parent2,
          "events",
          staffEvent.id,
        );

        const { data } = await parent.from("events").select("id");
        check(
          "the staff-only event is absent from the family's whole event list",
          !(data ?? []).some((e) => e.id === staffEvent.id),
          "it leaked into an unfiltered read",
        );
      }

      console.log("\nfamilies and staff do not author the calendar");
      {
        const mode = await refusalMode(
          parent
            .from("events")
            .insert({ title: "Parent-created event", start_at: new Date().toISOString() })
            .select(),
        );
        check("parent CANNOT create an event", !mode.startsWith("ALLOWED"), mode);
      }
      {
        const mode = await refusalMode(
          parent
            .from("events")
            .update({ title: "Renamed by a parent" })
            .eq("id", publicEvent.id)
            .select(),
        );
        check("parent CANNOT edit an event they can see", !mode.startsWith("ALLOWED"), mode);

        const { data } = await admin
          .from("events")
          .select("title")
          .eq("id", publicEvent.id)
          .maybeSingle();
        check("…and the title is unchanged", data?.title === publicEvent.title, data?.title);
      }
      {
        // Staff hold manage_schedule false by default, so they read the whole
        // calendar and write none of it.
        const mode = await refusalMode(
          staff
            .from("events")
            .update({ title: "Renamed by staff" })
            .eq("id", staffEvent.id)
            .select(),
        );
        check("staff CANNOT edit an event", !mode.startsWith("ALLOWED"), mode);
      }

      console.log("\nthe calendar token is a credential — owner only, admin included");
      {
        // Control: the owner reads their own, and it is really there.
        const { data: own } = await parent
          .from("ical_tokens")
          .select("token")
          .eq("profile_id", users.parent.profileId);
        check(
          "control: the owner reads their own token",
          (own?.length ?? 0) === 1 && Boolean(own[0].token),
          `saw ${own?.length}`,
        );

        // THE UNUSUAL RULE: not even the admin.
        const { data: byAdmin } = await admin.from("ical_tokens").select("token, profile_id");
        check(
          "ADMIN CANNOT read anyone's calendar token",
          (byAdmin ?? []).every((row) => row.profile_id !== users.parent.profileId),
          `admin saw ${byAdmin?.length} token row(s) including the parent's`,
        );

        // "Staff sees zero rows" was the old assertion, and it was wrong: the
        // policy is READ OWN, so a staff member who has ever opened /more has
        // a token of their own and legitimately reads it. That test only
        // passed while the fixture had never used the app, which is an
        // assumption about usage rather than about the policy — it went red
        // the first time anyone browsed as staff.
        //
        // What actually matters is that staff cannot read SOMEONE ELSE'S,
        // which is what the admin assertion above already checks.
        const { data: byStaff } = await staff.from("ical_tokens").select("token, profile_id");
        check(
          "staff CANNOT read anyone ELSE'S calendar token",
          (byStaff ?? []).every((row) => row.profile_id === users.staff.profileId),
          `staff saw ${byStaff?.length} row(s), including one not their own`,
        );
        check(
          "control: staff sees at most their own single row",
          (byStaff ?? []).length <= 1,
          `saw ${byStaff?.length}`,
        );

        const { data: byOther } = await parent2
          .from("ical_tokens")
          .select("token")
          .eq("profile_id", users.parent.profileId);
        check(
          "another family CANNOT read this family's token",
          (byOther?.length ?? 0) === 0,
          `saw ${byOther?.length}`,
        );
      }

      {
        const mode = await refusalMode(
          parent2
            .from("ical_tokens")
            .update({ token: "11111111-1111-1111-1111-111111111111" })
            .eq("profile_id", users.parent.profileId)
            .select(),
        );
        check("another family CANNOT rotate this family's token", !mode.startsWith("ALLOWED"), mode);

        const { data } = await parent
          .from("ical_tokens")
          .select("token")
          .eq("profile_id", users.parent.profileId)
          .maybeSingle();
        check(
          "…and the token is unchanged when its owner re-reads it",
          data?.token === parentToken.token,
          "somebody else's rotation landed",
        );
      }

      {
        const mode = await refusalMode(
          parent2
            .from("ical_tokens")
            .insert({ profile_id: users.parent.profileId })
            .select(),
        );
        check(
          "another family CANNOT mint a token pointed at someone else",
          !mode.startsWith("ALLOWED"),
          mode,
        );
      }

      {
        const { ids } = await visibleIds(anon, "events");
        check("anon sees 0 events", ids.length === 0, `saw ${ids.length}`);
        const { ids: tokenIds } = await visibleIds(anon, "ical_tokens");
        check("anon sees 0 calendar tokens", tokenIds.length === 0, `saw ${tokenIds.length}`);
      }

      console.log("\nadmin — the control proving the write rules are not simply broken");
      {
        const { data, error } = await admin
          .from("events")
          .insert({
            type: "closure",
            title: "Policy Test Closure",
            start_at: new Date().toISOString(),
            visibility: "all",
          })
          .select()
          .single();
        check("admin CAN create an event", !error && Boolean(data), error?.message);

        if (data) {
          const { error: updateError } = await admin
            .from("events")
            .update({ title: "Policy Test Closure (edited)" })
            .eq("id", data.id);
          check("admin CAN edit an event", !updateError, updateError?.message);

          await admin.from("events").delete().eq("id", data.id);
          const { data: gone } = await admin.from("events").select("id").eq("id", data.id);
          check("admin CAN delete an event", (gone?.length ?? 0) === 0);
        }
      }
    }
  }

  // ===========================================================================
  // invites (migration 0017) — the table that can manufacture a login
  //
  // Gated on the TABLE EXISTING rather than on the feature flag, so this runs
  // by itself the moment the migration is applied — no one has to remember to
  // come back and switch a test on.
  //
  // What this section covers is what the DATABASE guarantees: who may read and
  // write the table, that the token is the server's to mint, that the CHECKs
  // refuse an incoherent invite, and that the claim predicate matches exactly
  // one pending row. The claim ROUTE's own logic — never reading the role from
  // the request, refusing an email that already has an account — is not
  // reachable from here; it is exercised end-to-end after the migration is
  // applied, and that is stated in PHASE-2-PROGRESS.md rather than implied.
  // ===========================================================================
  {
    const probe = await admin.from("invites").select("id").limit(1);
    const tableMissing = probe.error?.code === "42P01" || /schema cache/i.test(probe.error?.message ?? "");

    if (tableMissing) {
      console.log("\n\n═══ invites — SKIPPED ═══");
      console.log("  Migration 0017 has not been applied. Apply it and re-run.");
      skipped += 1;
    } else {
      console.log("\n\n═══ invites — ALLOW ═══\n");

      const madeInvites = [];
      // A token the CLIENT chooses. If any of it survives, the guard is broken.
      const CHOSEN = "11111111-1111-1111-1111-111111111111";
      const future = new Date(Date.now() + 7 * 86_400_000).toISOString();

      const { data: created, error: createError } = await admin
        .from("invites")
        .insert({
          role: "staff",
          full_name: "Policy Test Invitee",
          token: CHOSEN,
          expires_at: future,
          manage_horses: true,
        })
        .select()
        .single();

      check("admin CAN create an invite", !createError && Boolean(created), createError?.message);
      if (created) madeInvites.push(created.id);

      check(
        "the token the client chose was NOT stored — the server minted its own",
        created?.token !== CHOSEN,
        `stored ${created?.token}`,
      );
      check(
        "and what it minted is a uuid",
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(created?.token ?? ""),
        `stored ${created?.token}`,
      );
      check(
        "created_by is pinned to the caller, not left to the client",
        created?.created_by === users.admin.profileId,
        `got ${created?.created_by}`,
      );
      check("the invited flags are stored as sent", created?.manage_horses === true);

      // --- regenerate mints again, and still not what was asked for ----------
      const { data: regenerated } = await admin
        .from("invites")
        .update({ token: CHOSEN })
        .eq("id", created?.id ?? "")
        .select()
        .single();

      check(
        "regenerating mints a NEW token, again not the one supplied",
        Boolean(regenerated) &&
          regenerated.token !== CHOSEN &&
          regenerated.token !== created?.token,
        `was ${created?.token}, now ${regenerated?.token}`,
      );

      // --- the claim predicate ------------------------------------------------
      // The exact WHERE the claim route uses. Testing it through the admin
      // session rather than the service role keeps this suite's rule intact:
      // it never uses the service key, because a test that bypasses RLS proves
      // nothing about RLS. The predicate is the same either way.
      const claim = (id) =>
        admin
          .from("invites")
          .update({ accepted_at: new Date().toISOString() })
          .eq("id", id)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .select();

      const { data: firstClaim } = await claim(created?.id ?? "");
      check(
        "control: claiming a pending invite matches exactly one row",
        (firstClaim?.length ?? 0) === 1,
        `matched ${firstClaim?.length}`,
      );

      const { data: secondClaim } = await claim(created?.id ?? "");
      check(
        "a SECOND claim on the same invite matches ZERO rows — one token, one account",
        (secondClaim?.length ?? 0) === 0,
        `matched ${secondClaim?.length}`,
      );

      // Revoked and expired are refused by the same predicate.
      //
      // Each is created PENDING and then moved into its state by an UPDATE,
      // not born that way. That is not ceremony: invites_token_guard forces
      // accepted_at and revoked_at to null on INSERT, so an invite cannot be
      // created already-revoked — a fact this test originally got wrong and
      // the suite caught. Revoking is an update, which the guard leaves alone.
      for (const [label, patch] of [
        ["revoked", { revoked_at: new Date().toISOString() }],
        ["expired", { expires_at: new Date(Date.now() - 86_400_000).toISOString() }],
      ]) {
        const { data: made } = await admin
          .from("invites")
          .insert({ role: "staff", full_name: `Policy Test ${label}`, expires_at: future })
          .select()
          .single();
        if (made) madeInvites.push(made.id);

        const { data: moved } = await admin
          .from("invites")
          .update(patch)
          .eq("id", made?.id ?? "")
          .select()
          .single();

        // Prove the setup actually took before trusting the deny below — a
        // deny test whose fixture never reached the state passes for free.
        const field = label === "revoked" ? "revoked_at" : "expires_at";
        check(
          `control: the ${label} fixture really is ${label}`,
          label === "revoked"
            ? Boolean(moved?.revoked_at)
            : new Date(moved?.expires_at ?? 0).getTime() < Date.now(),
          `${field} = ${moved?.[field]}`,
        );

        const { data: attempt } = await claim(made?.id ?? "");
        check(
          `claiming a ${label} invite matches ZERO rows`,
          (attempt?.length ?? 0) === 0,
          `matched ${attempt?.length}`,
        );
      }

      // The guard's own rule, asserted directly rather than left implicit.
      {
        const { data: born } = await admin
          .from("invites")
          .insert({
            role: "staff",
            full_name: "Policy Test Born Pending",
            expires_at: future,
            revoked_at: new Date().toISOString(),
            accepted_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (born) madeInvites.push(born.id);
        check(
          "an invite CANNOT be created already-revoked or already-accepted — it is born pending",
          born?.revoked_at === null && born?.accepted_at === null,
          `revoked_at=${born?.revoked_at}, accepted_at=${born?.accepted_at}`,
        );
      }

      console.log("\n═══ invites — DENY (adversarial) ═══\n");

      // --- the CHECK constraints ---------------------------------------------
      check(
        "an invite CANNOT give a staff member a family — mirrors profiles_family_only_for_parents",
        await writeRefused(
          admin
            .from("invites")
            .insert({
              role: "staff",
              full_name: "Should Not Exist",
              family_id: familyId,
              expires_at: future,
            })
            .select(),
        ),
      );
      check(
        "an invite CANNOT give a parent a manage_* flag — has_permission() would honour it",
        await writeRefused(
          admin
            .from("invites")
            .insert({
              role: "parent",
              full_name: "Should Not Exist",
              family_id: familyId,
              manage_horses: true,
              expires_at: future,
            })
            .select(),
        ),
      );
      check(
        "an invite CANNOT be created with a blank name",
        await writeRefused(
          admin
            .from("invites")
            .insert({ role: "staff", full_name: "   ", expires_at: future })
            .select(),
        ),
      );

      // --- RLS: nobody but an admin -------------------------------------------
      // Reading is the one that matters most: the token is IN the row, so a
      // staff member who could read this table could create an admin account.
      for (const [label, client] of [
        ["staff", staff],
        ["parent", parent],
      ]) {
        const { ids } = await visibleIds(client, "invites");
        check(
          `${label} CANNOT read the invites table — the token is in it`,
          ids.length === 0,
          `saw ${ids.length} invite(s)`,
        );
        check(
          `${label} CANNOT create an invite`,
          await writeRefused(
            client
              .from("invites")
              .insert({ role: "admin", full_name: "Self Promotion", expires_at: future })
              .select(),
          ),
        );
        check(
          `${label} CANNOT revoke an invite`,
          await writeRefused(
            client
              .from("invites")
              .update({ revoked_at: new Date().toISOString() })
              .eq("id", created?.id ?? "")
              .select(),
          ),
        );
        check(
          `${label} CANNOT delete an invite`,
          await writeRefused(client.from("invites").delete().eq("id", created?.id ?? "").select()),
        );
      }

      check(
        "anon CANNOT read the invites table at all",
        (await visibleIds(anon, "invites")).ids.length === 0,
      );

      // --- clean up so the next run starts where this one did ------------------
      //
      // Asserts THIS RUN'S invites are gone, NOT that the table is empty. The
      // empty-table version passed only while the suite was the sole writer;
      // the moment Belle was actually invited through the app it failed, and
      // the only way to make it pass again would have been to delete a real
      // pending invitation. A fixture assertion must never be satisfiable by
      // destroying live data.
      for (const id of madeInvites) {
        await admin.from("invites").delete().eq("id", id);
      }
      const { ids: leftovers } = await visibleIds(admin, "invites");
      const mineLeft = leftovers.filter((id) => madeInvites.includes(id));
      check(
        "the test invites are cleaned up",
        mineLeft.length === 0,
        `${mineLeft.length} of this run's invites left behind`,
      );
    }
  }

  // ===========================================================================
  // training_logs (migration 0020) — the boarder-visible training history
  //
  // Gated on the TABLE EXISTING rather than on a flag, so it runs by itself the
  // moment the migration is applied.
  //
  // The whole point of this section is the OWNS-vs-RIDES line. Training is less
  // sensitive than a medical record, but the visibility question is identical —
  // whose horse is it — and 0020 mirrors care_events verb for verb precisely so
  // that one answer serves both. These assertions are the proof it actually
  // does: a family whose rider merely RIDES a horse must see zero rows.
  // ===========================================================================
  {
    const probe = await admin.from("training_logs").select("id").limit(1);
    const tableMissing =
      probe.error?.code === "42P01" || /schema cache/i.test(probe.error?.message ?? "");

    if (tableMissing) {
      console.log("\n\n═══ training_logs — SKIPPED ═══");
      console.log("  Migration 0020 has not been applied. Apply it and re-run.");
      skipped += 1;
    } else {
      const horseFx = fixtures.horses ?? {};
      const owned = horseFx.owned?.id ?? null;
      const ridden = horseFx.ridden?.id ?? null;

      console.log("\n\n═══ training_logs — ALLOW ═══\n");

      const made = [];
      const mk = async (client, horseId, focus) => {
        const { data, error } = await client
          .from("training_logs")
          .insert({
            horse_id: horseId,
            performed_at: "2026-07-20",
            discipline: "flatwork",
            focus,
            notes: "policy test",
          })
          .select()
          .single();
        if (data) made.push(data.id);
        return { data, error };
      };

      const asAdmin = await mk(admin, owned, "Policy test — admin");
      check("admin CAN log training", !asAdmin.error && Boolean(asAdmin.data), asAdmin.error?.message);

      // The guard trigger: logged_by is pinned to the caller, never sent.
      check(
        "logged_by is pinned to the caller, not left to the client",
        asAdmin.data?.logged_by === users.admin.profileId,
        `got ${asAdmin.data?.logged_by}`,
      );
      check(
        "performed_at is NOT pinned to today — a past training day is the normal case",
        asAdmin.data?.performed_at === "2026-07-20",
        `got ${asAdmin.data?.performed_at}`,
      );

      const asStaff = await mk(staff, owned, "Policy test — staff");
      check("staff CAN log training", !asStaff.error && Boolean(asStaff.data), asStaff.error?.message);
      check(
        "and staff's row is attributed to staff, not to whoever they claimed",
        asStaff.data?.logged_by === users.staff.profileId,
        `got ${asStaff.data?.logged_by}`,
      );

      // A client-chosen logged_by must be overwritten, not obeyed.
      const { data: spoofed } = await staff
        .from("training_logs")
        .insert({
          horse_id: owned,
          performed_at: "2026-07-21",
          discipline: "hacking",
          notes: "policy test spoof",
          logged_by: users.admin.profileId,
        })
        .select()
        .single();
      if (spoofed) made.push(spoofed.id);
      check(
        "a client-supplied logged_by is OVERWRITTEN with the real caller",
        spoofed?.logged_by === users.staff.profileId,
        `stored ${spoofed?.logged_by}`,
      );

      // Control before the deny: the OWNING family can read.
      const { ids: ownerSees } = await visibleIds(parent, "training_logs");
      check(
        "control: the OWNING family CAN read their horse's training",
        ownerSees.length > 0,
        `owner saw ${ownerSees.length}`,
      );

      console.log("\n═══ training_logs — DENY (adversarial) ═══\n");

      // THE LINE THAT MATTERS. Same rule as care_events: owns, never rides.
      const riddenLog = await mk(admin, ridden, "Policy test — ridden horse");
      check("control: a log exists on the RIDDEN horse", Boolean(riddenLog.data));

      const { data: riddenSeen } = await parent
        .from("training_logs")
        .select("id")
        .eq("horse_id", ridden);
      check(
        "a family whose rider merely RIDES a horse sees NONE of its training",
        (riddenSeen?.length ?? 0) === 0,
        `saw ${riddenSeen?.length} — family_owns_horse has become family_rides_horse`,
      );

      if (parent2) {
        // NOT "parent2 sees zero rows". The fixture's `ridden` horse is OWNED
        // BY THE CONTROL FAMILY — that is how it is a horse the test family's
        // rider rides without owning — so parent2 reading a log on it is the
        // policy working, not failing. The real question is whether they can
        // reach the horse that belongs to the OTHER family.
        const { data: otherFamily } = await parent2
          .from("training_logs")
          .select("id")
          .eq("horse_id", owned);
        check(
          "another family sees NONE of this family's OWN horse's training",
          (otherFamily?.length ?? 0) === 0,
          `saw ${otherFamily?.length}`,
        );

        // Control, so the deny above cannot pass by parent2 simply seeing
        // nothing at all: they must still read their own horse's training.
        const { data: ownHorse } = await parent2
          .from("training_logs")
          .select("id")
          .eq("horse_id", ridden);
        check(
          "control: that family DOES read the training on the horse they own",
          (ownHorse?.length ?? 0) > 0,
          `saw ${ownHorse?.length}`,
        );
      }

      check(
        "a parent CANNOT log training",
        await writeRefused(
          parent
            .from("training_logs")
            .insert({ horse_id: owned, performed_at: "2026-07-22", discipline: "jumping" })
            .select(),
        ),
      );

      // Append-only for staff: they log, the barn corrects.
      check(
        "staff CANNOT edit a training log — the barn corrects, not the writer",
        await writeRefused(
          staff
            .from("training_logs")
            .update({ notes: "rewritten" })
            .eq("id", asStaff.data?.id ?? "")
            .select(),
        ),
      );
      check(
        "staff CANNOT delete a training log",
        await writeRefused(
          staff.from("training_logs").delete().eq("id", asStaff.data?.id ?? "").select(),
        ),
      );

      check(
        "anon sees no training at all",
        (await visibleIds(anon, "training_logs")).ids.length === 0,
      );

      // Clean up so the next run starts where this one did.
      //
      // NOT "the table is empty". Demo data lives in this table too, and it is
      // supposed to — the assertion is that none of the rows THIS SECTION made
      // survive, which is the only thing the section is responsible for. The
      // empty-table version passed only until `npm run demo:seed` had ever
      // been run, which is the third time that shape of assumption has bitten
      // in this suite (see also the ical-token and parent2 cases).
      for (const id of made) await admin.from("training_logs").delete().eq("id", id);
      const { ids: remaining } = await visibleIds(admin, "training_logs");
      const survivors = made.filter((id) => remaining.includes(id));
      check(
        "the test training logs are cleaned up",
        survivors.length === 0,
        `${survivors.length} of this section's ${made.length} rows survived`,
      );
    }
  }

  // ===========================================================================
  // STANDING GUARD — a parent row can never carry a permission flag (0018)
  //
  // public.has_permission() short-circuits to true for admin and otherwise
  // reads the flag column WITHOUT checking the role is staff, so a parent
  // carrying manage_horses would genuinely hold barn-wide write access. That
  // was verified live before the constraint existed: with the flag off the
  // parent's insert into `horses` was refused, with it on the insert LANDED.
  // Migration 0018 makes the combination impossible in the data.
  //
  // POSITIVE CONTROL FIRST: a STAFF profile must still be able to hold the
  // flag. A constraint that refused every flag would pass the deny case below
  // and look correct while breaking the feature the flags exist for.
  //
  // Every change is reverted before the section ends.
  // ===========================================================================
  console.log("\n\n═══ STANDING GUARD — a parent row carries no permission flag ═══\n");
  {
    const staffProfileId = users.staff.profileId;
    const parentProfileId = users.parent.profileId;

    const flagsOf = async (id) => {
      const { data } = await admin
        .from("profiles")
        .select("role, manage_shows, manage_schedule, manage_horses")
        .eq("id", id)
        .single();
      return data;
    };

    // --- CONTROL: staff MAY hold a flag -------------------------------------
    const { error: staffGrant } = await admin
      .from("profiles")
      .update({ manage_horses: true })
      .eq("id", staffProfileId);
    check(
      "control: a STAFF profile CAN be given manage_horses — the flags still work",
      !staffGrant,
      staffGrant?.message,
    );
    check("control: and it really stored", (await flagsOf(staffProfileId))?.manage_horses === true);

    // --- DENY: a parent may NOT ---------------------------------------------
    const { error: parentGrant } = await admin
      .from("profiles")
      .update({ manage_horses: true })
      .eq("id", parentProfileId);
    check(
      "an admin CANNOT give a PARENT manage_horses — has_permission() would honour it",
      Boolean(parentGrant),
      parentGrant ? "" : "the update was accepted — a parent now holds barn-wide write access",
    );
    check(
      "the refusal is the 23514 check violation, not an incidental failure",
      parentGrant?.code === "23514",
      `got ${parentGrant?.code}: ${parentGrant?.message}`,
    );
    check(
      "and the parent's flag is still false",
      (await flagsOf(parentProfileId))?.manage_horses === false,
    );

    // --- DENY: nor by demoting a flagged staff member into a parent ---------
    // The lingering-flag path. Changing the role alone leaves the flags behind
    // on a row where they now grant real access, so the database refuses it.
    const { error: demote } = await admin
      .from("profiles")
      .update({ role: "parent" })
      .eq("id", staffProfileId);
    check(
      "demoting a FLAGGED staff member to parent is REFUSED — the flags cannot linger",
      Boolean(demote),
      demote ? "" : "accepted — the flags survived onto a parent row",
    );

    // --- CONTROL: clearing the flags in the same statement IS allowed --------
    // This is exactly what updatePersonRole() does, and the reason it has to.
    const { error: demoteClean } = await admin
      .from("profiles")
      .update({ role: "parent", manage_horses: false, family_id: null })
      .eq("id", staffProfileId);
    check(
      "control: demoting WITH the flags cleared in the same statement succeeds — the hand-over path is open",
      !demoteClean,
      demoteClean?.message,
    );

    // --- Restore --------------------------------------------------------------
    await admin.from("profiles").update({ role: "staff" }).eq("id", staffProfileId);
    const restored = await flagsOf(staffProfileId);
    const parentRestored = await flagsOf(parentProfileId);
    check(
      "the fixtures are restored — staff is staff with no flags, parent is clean",
      restored?.role === "staff" &&
        restored?.manage_horses === false &&
        parentRestored?.role === "parent" &&
        parentRestored?.manage_horses === false,
      `staff=${restored?.role}/${restored?.manage_horses}, parent=${parentRestored?.role}/${parentRestored?.manage_horses}`,
    );
  }

  // ===========================================================================
  // STANDING GUARD — the barn always has at least one admin (migration 0016)
  //
  // The Team panel's server action already refuses to demote the last admin,
  // but that is a read-then-write: two admins demoting each other in the same
  // instant could both pass. Migration 0016 moves the rule into a trigger,
  // which is the one place a race cannot slip through.
  //
  // WHY THIS ONE SECTION USES A DIRECT CONNECTION. Everything else in this file
  // goes through the anon key with a real session, because a test that bypasses
  // RLS proves nothing about RLS. This section is the exception, deliberately:
  // the subject is a TRIGGER, which fires on every write no matter who
  // connects, so the connection is irrelevant to what is being proven. What the
  // trigger DOES need is a state no shared database can be assumed to be in —
  // exactly one admin — and a transaction to undo it.
  //
  // The old version simply asserted the barn had one admin and mutated the
  // fixtures in place. That held only while the seed was the only thing in the
  // database. The moment a real permanent admin existed, "the last admin" was
  // no longer last: the demotion SUCCEEDED, the admin fixture was left demoted,
  // and every admin assertion after this point failed for reasons that had
  // nothing to do with them. So the state is now built here and thrown away.
  //
  // Everything happens inside BEGIN … ROLLBACK. Real accounts — David's
  // permanent admin included — are demoted only inside that transaction and
  // are never actually written. The final assertion re-reads every profile
  // after the rollback and proves the table is byte-for-byte what it was.
  //
  // The assertion COUNT is fixed at ten regardless of how many real admins
  // exist: the stand-down is a single statement, not one assertion per admin,
  // and every check is emitted after the transaction closes so a mid-way
  // failure cannot make the suite's totals drift between runs.
  // ===========================================================================
  console.log("\n\n═══ STANDING GUARD — the barn always has at least one admin ═══\n");
  {
    const adminProfileId = users.admin.profileId;
    const staffProfileId = users.staff.profileId;

    const db = new pg.Client({
      connectionString: DB_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    });
    await db.connect();

    /** Every profile's id and role, ordered — the before/after fingerprint. */
    const snapshot = async () =>
      (await db.query("select id, role from public.profiles order by id")).rows;
    const adminIds = async () =>
      (await db.query("select id from public.profiles where role = 'admin' order by id")).rows.map(
        (r) => r.id,
      );

    /** Run a statement expected to FAIL, without poisoning the transaction. */
    const attempt = async (name, sql, params) => {
      await db.query(`savepoint ${name}`);
      try {
        await db.query(sql, params);
        await db.query(`rollback to savepoint ${name}`);
        return null; // no error — the write was accepted
      } catch (error) {
        await db.query(`rollback to savepoint ${name}`);
        return error;
      }
    };

    const before = await snapshot();

    // Defaults chosen so that if anything below throws unexpectedly, each
    // assertion fails rather than silently vanishing from the totals.
    const r = {
      soleAdmin: null,
      promoted: null,
      twoAdmins: null,
      demoteTwoError: "did not run",
      oneLeft: null,
      lastDemote: null,
      lastDelete: null,
      unexpected: null,
    };

    try {
      await db.query("begin");

      // --- build the state this guard needs, transiently -------------------
      // Promote the fixture first so an admin is standing at every instant,
      // THEN stand every other admin down. Done in the other order the last
      // demotion would trip the very trigger under test.
      await db.query("update public.profiles set role = 'admin' where id = $1", [adminProfileId]);
      await db.query(
        "update public.profiles set role = 'staff' where role = 'admin' and id <> $1",
        [adminProfileId],
      );
      const sole = await adminIds();
      r.soleAdmin = sole.length === 1 && sole[0] === adminProfileId ? true : sole;

      // --- CONTROL 1: promoting a second admin is allowed ------------------
      await db.query("update public.profiles set role = 'admin' where id = $1", [staffProfileId]);
      r.promoted = true;
      r.twoAdmins = (await adminIds()).length;

      // --- CONTROL 2: demoting one of TWO admins is allowed ----------------
      // The assertion that proves the trigger discriminates rather than
      // refusing every demotion outright.
      try {
        await db.query("update public.profiles set role = 'staff' where id = $1", [staffProfileId]);
        r.demoteTwoError = null;
      } catch (error) {
        r.demoteTwoError = error.message;
      }
      r.oneLeft = (await adminIds()).length;

      // --- DENY: the last admin cannot be demoted --------------------------
      r.lastDemote = await attempt(
        "s_demote",
        "update public.profiles set role = 'staff' where id = $1",
        [adminProfileId],
      );

      // --- DENY: the last admin cannot be deleted --------------------------
      // A separate branch in the trigger. Deleting the row leaves zero admins
      // just as surely as demoting it.
      r.lastDelete = await attempt("s_delete", "delete from public.profiles where id = $1", [
        adminProfileId,
      ]);
    } catch (error) {
      r.unexpected = error.message;
    } finally {
      // Unconditional. Nothing above is allowed to survive this line.
      await db.query("rollback").catch(() => {});
    }

    const after = await snapshot();
    await db.end();

    const same =
      before.length === after.length &&
      before.every((row, i) => row.id === after[i].id && row.role === after[i].role);

    check(
      "setup: inside the transaction the fixture is the only admin",
      r.soleAdmin === true,
      r.unexpected ?? `admins: ${JSON.stringify(r.soleAdmin)}`,
    );
    check("control: the staff fixture CAN be promoted to admin", r.promoted === true, r.unexpected);
    check("control: there are now two admins", r.twoAdmins === 2, `got ${r.twoAdmins}`);
    check(
      "control: demoting one of two admins SUCCEEDS — the trigger is not a blanket refusal",
      r.demoteTwoError === null,
      r.demoteTwoError ?? undefined,
    );
    check("control: one admin is left", r.oneLeft === 1, `got ${r.oneLeft}`);
    check(
      "demoting the LAST admin is REFUSED",
      Boolean(r.lastDemote),
      r.lastDemote ? "" : "the update was accepted — the barn would have zero admins",
    );
    check(
      "the refusal is the 23514 check violation, not an incidental failure",
      r.lastDemote?.code === "23514",
      `got ${r.lastDemote?.code}: ${r.lastDemote?.message}`,
    );
    check(
      "deleting the LAST admin is REFUSED",
      Boolean(r.lastDelete),
      r.lastDelete ? "" : "the delete was accepted — the barn would have zero admins",
    );
    check(
      "that refusal is 23514 too",
      r.lastDelete?.code === "23514",
      `got ${r.lastDelete?.code}: ${r.lastDelete?.message}`,
    );
    // The one that makes all of the above safe to run against a live barn.
    check(
      "the ROLLBACK left every real account exactly as it was",
      same,
      `${before.filter((x) => x.role === "admin").length} admin(s) before, ` +
        `${after.filter((x) => x.role === "admin").length} after`,
    );
  }

  // ===========================================================================
  // STANDING GUARD — function exposure
  //
  // Data-driven from the migrations, so it covers functions added later without
  // anyone remembering to write a test. Replaces the hand-written per-primitive
  // assertions that only existed for the three helpers someone thought of.
  // ===========================================================================
  console.log("\n\n═══ STANDING GUARD — no internal function is reachable over RPC ═══\n");
  {
    const inventory = parseMigrationFunctions();
    const exposable = inventory.filter((fn) => !fn.returnsTrigger);

    check(
      "the migrations were parsed and functions were found",
      exposable.length >= 10,
      `found ${exposable.length}`,
    );

    const internal = exposable.filter(
      (fn) => fn.revokedFrom.has("anon") && fn.revokedFrom.has("authenticated") && !fn.grantedTo.has("authenticated"),
    );
    const entryPoints = exposable.filter((fn) => fn.grantedTo.has("authenticated"));
    const unclassified = exposable.filter(
      (fn) =>
        !internal.includes(fn) && !entryPoints.includes(fn) && !EXPOSED_BY_DESIGN.has(fn.name),
    );

    console.log(
      `  inventory: ${internal.length} internal, ${entryPoints.length} entry point(s), ` +
        `${exposable.length - internal.length - entryPoints.length} exposed-by-design, ` +
        `${inventory.length - exposable.length} trigger function(s) skipped`,
    );

    // A new function that is neither locked down nor consciously allowlisted is
    // a decision nobody made. Fail rather than default to exposed.
    check(
      "every public function is classified — no new one silently defaults to exposed",
      unclassified.length === 0,
      unclassified.length > 0
        ? `unclassified: ${unclassified.map((f) => f.name).join(", ")} — revoke it, grant it, or add it to EXPOSED_BY_DESIGN`
        : "",
    );

    check(
      "the known internal primitives are all classified as internal",
      ["backfill_book_rider", "notify_rider_family", "notify_admins"].every((name) =>
        internal.some((fn) => fn.name === name),
      ),
      `internal: ${internal.map((f) => f.name).join(", ")}`,
    );

    // --- internal primitives must bounce off the privilege, for both roles ---
    for (const fn of internal) {
      const args = Object.fromEntries(fn.args.map((name) => [name, null]));

      for (const [label, client] of [
        ["parent", parent],
        ["anon", anon],
      ]) {
        const { error } = await client.rpc(fn.name, args);
        check(
          `${label} CANNOT execute ${fn.name}() — internal`,
          blockedAtTheDoor(error),
          error
            ? `it ran and returned ${error.code}: ${error.message}`
            : "no error at all — the function executed",
        );
      }
    }

    // --- entry points must remain reachable for an authorised caller --------
    //
    // POSITIVE CONTROL for the block above: if a revoke were somehow applied to
    // everything, every "cannot execute" assertion would pass while the app was
    // completely broken. These prove the check discriminates.
    for (const fn of entryPoints) {
      const args = Object.fromEntries(fn.args.map((name) => [name, null]));
      const { error } = await admin.rpc(fn.name, args);
      check(
        `admin CAN reach ${fn.name}() — entry point`,
        !blockedAtTheDoor(error),
        error ? `blocked: ${error.code} ${error.message}` : "",
      );
    }

    // --- NOTHING is executable signed-out -----------------------------------
    //
    // Every SECURITY DEFINER function in `public` runs with its owner's
    // privileges and therefore bypasses RLS on everything it touches. Postgres
    // grants EXECUTE to PUBLIC by default, and Supabase ships a SEPARATE
    // default grant to anon and authenticated — so for three phases every
    // function nobody had explicitly closed was callable by a signed-out
    // caller. `db:advisor` found 26 of them (splinter lint 0028); migration
    // 0015 closed the default and re-granted only what a signed-in session
    // calls.
    //
    // This is the assertion that stops it drifting back. It is behavioural and
    // data-driven for the same reason as the classification guard above: a
    // function added in a later phase is covered without anyone remembering to
    // write a test for it.
    //
    // Trigger functions are included deliberately. PostgREST will not route to
    // them today, which is a property of PostgREST rather than of our grants —
    // so "blocked" is asserted, not assumed.
    for (const fn of inventory) {
      const args = Object.fromEntries(fn.args.map((name) => [name, null]));
      const { error } = await anon.rpc(fn.name, args);
      check(
        `anon CANNOT execute ${fn.name}() — no definer function is reachable signed-out`,
        blockedAtTheDoor(error),
        error
          ? `it ran and returned ${error.code}: ${error.message}`
          : "no error at all — the function executed for a signed-out caller",
      );
    }

    // --- and the policy helpers must stay callable, or RLS denies everything -
    for (const name of ["current_role", "current_family", "current_profile"]) {
      const { error } = await parent.rpc(name);
      check(
        `parent CAN reach ${name}() — required by RLS policies`,
        !blockedAtTheDoor(error),
        error ? `blocked: ${error.code} ${error.message}` : "",
      );
    }
  }

  // ---------------------------------------------------------------------------
  console.log(`\n\n${passed} passed, ${failures.length} failed${skipped ? `, ${skipped} section(s) skipped` : ""}`);
  if (failures.length > 0) {
    console.error("\nFailures:");
    for (const f of failures) console.error(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
    process.exit(1);
  }
  console.log(
    skipped > 0
      ? "All runnable policy assertions passed — but a section was SKIPPED, so this is not a full pass."
      : "All policy assertions passed.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
