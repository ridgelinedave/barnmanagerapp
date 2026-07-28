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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.");
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

      // (5b) The internal primitives must not be reachable as RPC endpoints.
      // Postgres grants EXECUTE to PUBLIC by default and PostgREST exposes
      // every function in `public`, so forgetting to revoke these would let a
      // parent seat any rider anywhere with one HTTP call.
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
      {
        const { error } = await parent.rpc("notify_admins", {
          kind: "forged",
          title: "Forged",
          body: "x",
          link_path: "/",
        });
        check("parent CANNOT call notify_admins directly", Boolean(error), "no error raised");
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
