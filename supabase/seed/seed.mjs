#!/usr/bin/env node
/**
 * Phase 0 seed — creates the three fixture users the Definition of Done needs.
 *
 *   admin   — Belle's role. Full access.
 *   staff   — one employee.
 *   parent  — one account holder, linked to a family with one rider.
 *
 * Plus the `levels` lookup (Intro → Fourth).
 *
 * SECURITY: this uses the SERVICE ROLE key and therefore bypasses RLS. It is a
 * developer script run from a terminal — it is NOT part of the app, is never
 * imported by app code, and must never run in a browser.
 *
 * Run (only after the migrations are applied):
 *   npm run db:seed
 *
 * It is safe to re-run: existing fixture users are updated in place.
 * Credentials are written to supabase/seed/seed-output.json (gitignored), which
 * the policy tests read.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run via `npm run db:seed`, which loads .env.local.",
  );
  process.exit(1);
}

if (SUPABASE_URL.includes("placeholder") || SERVICE_ROLE_KEY.includes("placeholder")) {
  console.error(
    "Refusing to run: .env.local still holds placeholder values.\n" +
      "Create a Supabase project and paste the real keys first (README → Part 2).",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** One shared password across the three fixtures, so the tests can sign in. */
const password =
  process.env.SEED_TEST_PASSWORD ?? `phase0-${randomBytes(9).toString("base64url")}`;

const LEVELS = ["Intro", "Training", "First", "Second", "Third", "Fourth"];

const FIXTURES = [
  { key: "admin", email: "phase0.admin@example.com", role: "admin", fullName: "Phase 0 Admin" },
  { key: "staff", email: "phase0.staff@example.com", role: "staff", fullName: "Phase 0 Staff" },
  { key: "parent", email: "phase0.parent@example.com", role: "parent", fullName: "Phase 0 Parent" },
];

const FAMILY_NAME = "Phase 0 Test Family";
const RIDER_NAME = "Phase 0 Test Rider";

/**
 * A second family the parent fixture is NOT part of. Without it the policy
 * tests could not tell "family-scoped" apart from "sees everything" — there
 * would be nothing to leak.
 */
const CONTROL_FAMILY_NAME = "Phase 0 Control Family";
const CONTROL_RIDER_NAME = "Phase 0 Control Rider";

function fail(message, error) {
  console.error(`\n✗ ${message}`);
  if (error) console.error(error.message ?? error);
  process.exit(1);
}

/** Find an auth user by email without assuming pagination order. */
async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`Could not list users while looking for ${email}`, error);
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function upsertAuthUser({ email, fullName }) {
  const existing = await findUserByEmail(email);

  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) fail(`Could not update auth user ${email}`, error);
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) fail(`Could not create auth user ${email}`, error);
  return data.user;
}

async function main() {
  console.log(`Seeding ${SUPABASE_URL}\n`);

  // --- levels -----------------------------------------------------------------
  const { data: levels, error: levelsError } = await supabase
    .from("levels")
    .upsert(
      LEVELS.map((name, index) => ({ name, sort: index })),
      { onConflict: "name" },
    )
    .select();
  if (levelsError) fail("Could not seed levels", levelsError);
  console.log(`  levels        ${levels.length} rows`);

  const trainingLevel = levels.find((l) => l.name === "Training");

  // --- families ---------------------------------------------------------------
  async function ensureFamily(name) {
    const { data: existing } = await supabase
      .from("families")
      .select("*")
      .eq("name", name)
      .maybeSingle();
    if (existing) return existing;

    const { data, error } = await supabase
      .from("families")
      .insert({ name, notes: "Phase 0 fixture. Delete before go-live." })
      .select()
      .single();
    if (error) fail(`Could not create the family "${name}"`, error);
    return data;
  }

  const family = await ensureFamily(FAMILY_NAME);
  const controlFamily = await ensureFamily(CONTROL_FAMILY_NAME);
  console.log(`  families      ${family.name}, ${controlFamily.name}`);

  // --- users + profiles -------------------------------------------------------
  const created = {};
  for (const fixture of FIXTURES) {
    const user = await upsertAuthUser(fixture);

    const profileRow = {
      user_id: user.id,
      role: fixture.role,
      full_name: fixture.fullName,
      // Only parents carry a family_id (enforced by a CHECK constraint).
      family_id: fixture.role === "parent" ? family.id : null,
    };

    const { data: profile, error } = await supabase
      .from("profiles")
      .upsert(profileRow, { onConflict: "user_id" })
      .select()
      .single();
    if (error) fail(`Could not upsert the profile for ${fixture.email}`, error);

    created[fixture.key] = {
      email: fixture.email,
      userId: user.id,
      profileId: profile.id,
      role: fixture.role,
      familyId: profile.family_id,
    };
    console.log(`  profiles      ${fixture.role.padEnd(6)} ${fixture.email}`);
  }

  // --- riders -----------------------------------------------------------------
  async function ensureRider(familyId, name) {
    const { data: existing } = await supabase
      .from("riders")
      .select("*")
      .eq("family_id", familyId)
      .eq("name", name)
      .maybeSingle();
    if (existing) return existing;

    const { data, error } = await supabase
      .from("riders")
      .insert({
        family_id: familyId,
        name,
        level_id: trainingLevel?.id ?? null,
        active: true,
      })
      .select()
      .single();
    if (error) fail(`Could not create the rider "${name}"`, error);
    return data;
  }

  const rider = await ensureRider(family.id, RIDER_NAME);
  const controlRider = await ensureRider(controlFamily.id, CONTROL_RIDER_NAME);
  console.log(`  riders        ${rider.name}, ${controlRider.name}`);

  // --- clear the time-clock ledger --------------------------------------------
  //
  // `punches` has no DELETE policy for any role — that immutability is the
  // point of the table. The seed uses the service role, which is the one thing
  // that legitimately sits outside RLS, so this is the only place fixture
  // punches can be cleared between test runs.
  for (const table of ["timesheet_approvals", "pay_periods", "punches"]) {
    const probe = await supabase.from(table).select("id").limit(1);
    if (probe.error && /schema cache|does not exist/i.test(probe.error.message)) continue;
    const { error } = await supabase.from(table).delete().not("id", "is", null);
    if (error) fail(`Could not clear ${table}`, error);
  }

  // --- clear generated notifications ------------------------------------------
  //
  // Every notification type a feature or a test run can produce. Clearing these
  // keeps per-user counts predictable and stops the table growing on every run;
  // only the seeded 'phase0_fixture' rows are meant to persist. Runs
  // unconditionally, so it still tidies up when a later table is missing.
  for (const type of [
    "announcement",
    "lesson_cancelled",
    "backfill_offer",
    "backfill_result",
    "lesson_reminder",
  ]) {
    const { error } = await supabase.from("notifications").delete().eq("type", type);
    if (error) fail(`Could not clear '${type}' notifications`, error);
  }

  // --- one notification per fixture user, so the tests can prove isolation -----
  for (const key of Object.keys(created)) {
    const { profileId } = created[key];
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("profile_id", profileId)
      .eq("type", "phase0_fixture")
      .maybeSingle();

    if (existing) {
      created[key].notificationId = existing.id;
      continue;
    }

    const { data, error } = await supabase
      .from("notifications")
      .insert({
        profile_id: profileId,
        type: "phase0_fixture",
        title: "Welcome to the barn app",
        body: "Phase 0 fixture notification. Delete before go-live.",
      })
      .select()
      .single();
    if (error) fail(`Could not create the fixture notification for ${key}`, error);
    created[key].notificationId = data.id;
  }
  console.log(`  notifications 1 per fixture user`);

  // --- announcements (Phase 1, slice 1) ---------------------------------------
  //
  // Both fixtures are notify=false on purpose. A notify=true announcement fans
  // out a notifications row per recipient, which would break the "each user
  // sees exactly one notification" assertions. The fan-out is tested separately,
  // at the end of the policy suite, after those counts have been checked.
  const announcements = {};
  {
    const probe = await supabase.from("announcements").select("id").limit(1);

    if (probe.error && /schema cache|does not exist/i.test(probe.error.message)) {
      console.log("  announcements SKIPPED — table not created yet (apply migration 0005)");
    } else if (probe.error) {
      fail("Could not read announcements", probe.error);
    } else {
      const FIXTURES = [
        {
          key: "all",
          title: "Phase 1 fixture — barn news for everyone",
          body_md: "Visible to families and staff. Delete before go-live.",
          audience: "all",
          pinned: true,
        },
        {
          key: "staff",
          title: "Phase 1 fixture — staff only notice",
          body_md: "Internal. A parent must never see this. Delete before go-live.",
          audience: "staff",
          pinned: false,
        },
      ];

      for (const fixture of FIXTURES) {
        const { key, ...row } = fixture;

        const { data: existing } = await supabase
          .from("announcements")
          .select("id")
          .eq("title", row.title)
          .maybeSingle();

        if (existing) {
          announcements[`${key}Id`] = existing.id;
          continue;
        }

        const { data, error } = await supabase
          .from("announcements")
          .insert({ ...row, notify: false, author: created.admin.profileId })
          .select()
          .single();
        if (error) fail(`Could not create the "${row.audience}" announcement fixture`, error);
        announcements[`${key}Id`] = data.id;
      }

      console.log(`  announcements 1 'all', 1 'staff'`);
    }
  }

  // --- record the fixture ids for the policy tests ----------------------------
  const output = {
    generatedAt: new Date().toISOString(),
    supabaseUrl: SUPABASE_URL,
    password,
    users: created,
    familyId: family.id,
    riderId: rider.id,
    controlFamilyId: controlFamily.id,
    controlRiderId: controlRider.id,
    levelCount: LEVELS.length,
    announcements,
  };

  mkdirSync(here, { recursive: true });
  writeFileSync(join(here, "seed-output.json"), `${JSON.stringify(output, null, 2)}\n`);

  console.log(`\n✓ Seed complete.`);
  console.log(`  Fixture password: ${password}`);
  console.log(`  Written to supabase/seed/seed-output.json (gitignored).`);
  console.log(`\n  Next: npm run test:policies`);
}

main().catch((error) => fail("Seed failed", error));
