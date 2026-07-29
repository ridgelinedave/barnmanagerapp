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

/**
 * `family` picks which fixture family a parent belongs to.
 *
 * There are TWO parents on purpose. With one, every cross-family assertion is
 * one-directional — "this family cannot see the other's data" is only ever
 * checked from the side that has a login, and a policy that leaked the other
 * way would pass. The second parent makes both directions testable.
 */
const FIXTURES = [
  { key: "admin", email: "phase0.admin@example.com", role: "admin", fullName: "Phase 0 Admin" },
  { key: "staff", email: "phase0.staff@example.com", role: "staff", fullName: "Phase 0 Staff" },
  {
    key: "parent",
    email: "phase0.parent@example.com",
    role: "parent",
    fullName: "Phase 0 Parent",
    family: "main",
  },
  {
    key: "parent2",
    email: "phase0.parent2@example.com",
    role: "parent",
    fullName: "Phase 0 Control Parent",
    family: "control",
  },
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
      family_id:
        fixture.role === "parent"
          ? fixture.family === "control"
            ? controlFamily.id
            : family.id
          : null,
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

  // --- horses, rider links and feed plans (Phase 2, slice 1) -------------------
  //
  // Four horses, one per visibility tier as seen BY THE FIRST PARENT:
  //
  //   owned      the parent's family owns it        → full read
  //   ridden     control family owns it, parent's rider rides it → basics only
  //   barn       nobody owns it, parent's rider rides it         → basics only
  //   unrelated  control family owns it, only the control rider rides it → none
  //
  // The SECOND parent (the control family) sees the mirror image: they own
  // `ridden` and `unrelated` in full, get `barn` as basics, and must not see
  // `owned` at all. Both directions of every cross-family rule are therefore
  // real assertions rather than one side assumed from the other.
  //
  // breed / dob / notes are populated on ALL FOUR on purpose. They are the
  // positive control for the column-projection tests: "the parent cannot see
  // the breed" means nothing if the breed is null in the first place.
  const horses = {};
  {
    const probe = await supabase.from("horses").select("id").limit(1);

    if (probe.error && /schema cache|does not exist/i.test(probe.error.message)) {
      console.log("  horses        SKIPPED — tables not created yet (apply migration 0010)");
    } else if (probe.error) {
      fail("Could not read horses", probe.error);
    } else {
      const HORSE_FIXTURES = [
        {
          key: "owned",
          name: "Phase 2 Fixture Owned Horse",
          barn_name: "Fixture Owned",
          owner_family_id: family.id,
          breed: "Hanoverian",
          dob: "2015-04-01",
          notes: "Owner-visible note. A riding family must never read this line.",
        },
        {
          key: "ridden",
          name: "Phase 2 Fixture Ridden Horse",
          barn_name: "Fixture Ridden",
          owner_family_id: controlFamily.id,
          breed: "Dutch Warmblood",
          dob: "2013-05-02",
          notes: "Another family's private note. Delete before go-live.",
        },
        {
          key: "barn",
          name: "Phase 2 Fixture Barn Horse",
          barn_name: "Fixture Barn",
          owner_family_id: null,
          breed: "Quarter Horse",
          dob: "2012-06-03",
          notes: "Barn-owned schooling note. Staff and admin only.",
        },
        {
          key: "unrelated",
          name: "Phase 2 Fixture Unrelated Horse",
          barn_name: "Fixture Unrelated",
          owner_family_id: controlFamily.id,
          breed: "Trakehner",
          dob: "2011-07-04",
          notes: "Belongs to a family the fixture parent has nothing to do with.",
        },
      ];

      for (const fixture of HORSE_FIXTURES) {
        const { key, ...row } = fixture;

        const { data: existing } = await supabase
          .from("horses")
          .select("*")
          .eq("name", row.name)
          .maybeSingle();

        if (existing) {
          // Re-assert the columns the tests depend on, in case a previous run
          // (or a failed deny test) left them changed.
          const { data, error } = await supabase
            .from("horses")
            .update({ ...row, active: true, photo_url: `/brand/fixture-${key}.png` })
            .eq("id", existing.id)
            .select()
            .single();
          if (error) fail(`Could not refresh the "${row.name}" fixture`, error);
          horses[key] = data;
          continue;
        }

        const { data, error } = await supabase
          .from("horses")
          .insert({ ...row, active: true, photo_url: `/brand/fixture-${key}.png` })
          .select()
          .single();
        if (error) fail(`Could not create the horse "${row.name}"`, error);
        horses[key] = data;
      }

      // Rider links. The parent's rider is on the ridden and barn horses; the
      // control rider is on the unrelated horse, so a link EXISTS on it — the
      // parent's blindness to it is about whose rider, not about links being
      // empty.
      const LINKS = [
        [horses.ridden.id, rider.id],
        [horses.barn.id, rider.id],
        [horses.unrelated.id, controlRider.id],
        // The control rider is on the barn horse too, so the SECOND parent also
        // has a basics tier. Without it their basics list would be empty and
        // "the other family sees only basics" would be untestable from that
        // side — it would pass against a function that returns nothing at all.
        [horses.barn.id, controlRider.id],
      ];
      for (const [horseId, riderId] of LINKS) {
        const { data: existing } = await supabase
          .from("horse_riders")
          .select("id")
          .eq("horse_id", horseId)
          .eq("rider_id", riderId)
          .maybeSingle();
        if (existing) continue;

        const { error } = await supabase
          .from("horse_riders")
          .insert({ horse_id: horseId, rider_id: riderId });
        if (error) fail("Could not link a fixture rider to a fixture horse", error);
      }

      // Feed plans. The owned horse has a chart the parent MUST read; the
      // ridden horse has one they must NOT — feed access follows ownership,
      // not riding, and only a plan on a horse they demonstrably ride can
      // prove that.
      const PLANS = [
        {
          key: "ownedAm",
          horse_id: horses.owned.id,
          meal: "am",
          description: "2 scoops fixture feed",
          supplements: "Fixture joint supplement",
          special_instructions: "Soak for 10 minutes.",
        },
        {
          key: "ownedPm",
          horse_id: horses.owned.id,
          meal: "pm",
          description: "1 scoop fixture feed",
          supplements: "",
          special_instructions: "",
        },
        {
          key: "riddenAm",
          horse_id: horses.ridden.id,
          meal: "am",
          description: "Another family's feed chart",
          supplements: "",
          special_instructions: "",
        },
        {
          key: "unrelatedAm",
          horse_id: horses.unrelated.id,
          meal: "am",
          description: "Unrelated family's feed chart",
          supplements: "",
          special_instructions: "",
        },
      ];

      const feedPlans = {};
      for (const plan of PLANS) {
        const { key, ...row } = plan;

        const { data: existing } = await supabase
          .from("feed_plans")
          .select("id")
          .eq("horse_id", row.horse_id)
          .eq("meal", row.meal)
          .eq("active", true)
          .maybeSingle();

        if (existing) {
          feedPlans[key] = existing.id;
          continue;
        }

        const { data, error } = await supabase
          .from("feed_plans")
          .insert({ ...row, active: true })
          .select()
          .single();
        if (error) fail(`Could not create the "${key}" feed plan fixture`, error);
        feedPlans[key] = data.id;
      }

      horses.feedPlans = feedPlans;
      console.log(`  horses        4 (owned, ridden, barn, unrelated) + 4 feed plans`);

      // --- care events (Phase 2, slice 2) ---------------------------------
      //
      // One past event and one with a future due date on BOTH the owned horse
      // and the ridden horse. The pair on the ridden horse is the whole point:
      // the fixture parent provably reaches that horse through basics, so
      // "sees no care events" cannot be confused with "cannot see the horse".
      //
      // due_next on the owned horse is 14 days out — inside the digest's
      // 30-day window, and computed from today so it never ages out of it.
      const careProbe = await supabase.from("care_events").select("id").limit(1);

      if (careProbe.error && /schema cache|does not exist/i.test(careProbe.error.message)) {
        console.log("  care_events   SKIPPED — table not created yet (apply migration 0011)");
      } else if (careProbe.error) {
        fail("Could not read care_events", careProbe.error);
      } else {
        const day = (offset) => {
          const d = new Date();
          d.setDate(d.getDate() + offset);
          return d.toISOString().slice(0, 10);
        };

        const CARE = [
          {
            key: "ownedVaccine",
            horse_id: horses.owned.id,
            type: "vaccine",
            description: "Fixture spring shots. Owner and barn only.",
            performed_at: day(-60),
            due_next: day(14),
          },
          {
            key: "ownedFarrier",
            horse_id: horses.owned.id,
            type: "farrier",
            description: "Fixture reset, front shoes.",
            performed_at: day(-21),
            due_next: null,
          },
          {
            // Already lapsed. The digest deliberately has no lower bound on
            // due_next, so this must appear in it — an item nobody acted on is
            // the one most worth a reminder.
            key: "ownedOverdue",
            horse_id: horses.owned.id,
            type: "deworm",
            description: "Fixture worming, now overdue.",
            performed_at: day(-120),
            due_next: day(-7),
          },
          {
            key: "riddenCoggins",
            horse_id: horses.ridden.id,
            type: "coggins",
            description: "Another family's Coggins. The riding family must never read this.",
            performed_at: day(-90),
            due_next: day(20),
          },
          {
            key: "riddenMedication",
            horse_id: horses.ridden.id,
            type: "medication",
            description: "Another family's medication record.",
            performed_at: day(-3),
            due_next: null,
          },
        ];

        const careEvents = {};
        for (const event of CARE) {
          const { key, ...row } = event;

          const { data: existing } = await supabase
            .from("care_events")
            .select("*")
            .eq("horse_id", row.horse_id)
            .eq("type", row.type)
            .maybeSingle();

          if (existing) {
            // Re-assert the dates so the due item stays inside the 30-day
            // window however long ago the fixture was first created.
            const { data, error } = await supabase
              .from("care_events")
              .update({ ...row, logged_by: created.staff.profileId })
              .eq("id", existing.id)
              .select()
              .single();
            if (error) fail(`Could not refresh the "${key}" care fixture`, error);
            careEvents[key] = data;
            continue;
          }

          const { data, error } = await supabase
            .from("care_events")
            .insert({ ...row, logged_by: created.staff.profileId })
            .select()
            .single();
          if (error) fail(`Could not create the "${key}" care fixture`, error);
          careEvents[key] = data;
        }

        horses.careEvents = careEvents;
        console.log(`  care_events   5 (3 owned incl. 1 overdue, 2 on another family's horse)`);
      }
    }
  }

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
    // Cleared so the digest's "it really does create rows" path is exercised
    // on the first run after a seed. The idempotency assertion holds on the
    // second run precisely because these are NOT cleared between runs.
    "care_due",
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
    // Phase 2 slice 1. Empty when migration 0010 is not applied yet, which is
    // what makes the horses section of the suite report a SKIP rather than a
    // pass.
    horses,
  };

  mkdirSync(here, { recursive: true });
  writeFileSync(join(here, "seed-output.json"), `${JSON.stringify(output, null, 2)}\n`);

  console.log(`\n✓ Seed complete.`);
  console.log(`  Fixture password: ${password}`);
  console.log(`  Written to supabase/seed/seed-output.json (gitignored).`);
  console.log(`\n  Next: npm run test:policies`);
}

main().catch((error) => fail("Seed failed", error));
