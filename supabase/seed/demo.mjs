#!/usr/bin/env node
/**
 * DEMO DATA — realistic content so the app looks lived-in for a walkthrough.
 *
 *   npm run demo:seed
 *
 * This is NOT the test fixture seed. `db:seed` owns the three fixture users and
 * everything the policy suite asserts against; this script must never touch
 * those rows, because the suite's expectations are exact ("parent sees exactly
 * 1 rider") and a stray demo rider would turn it red for the wrong reason.
 *
 * The boundary is kept by naming: every row created here is prefixed DEMO_TAG
 * and the script only ever writes rows it can identify as its own. Re-running
 * is safe — it upserts by that name and creates nothing twice.
 *
 * Only builds what is behind a flag that is currently ON. clockIn is off
 * pending David's audit, so no punches are created.
 *
 * To remove it all again:  npm run demo:seed -- --clean
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing env. Run via `npm run demo:seed`.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Every demo row carries this so it can be found and removed again. */
const DEMO_TAG = "[demo]";
const clean = process.argv.includes("--clean");

const fail = (message, error) => {
  console.error(`\n✗ ${message}`);
  if (error) console.error(error.message ?? error);
  process.exit(1);
};

const isoDate = (offsetDays = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------
async function removeDemoData() {
  // EVERY delete here is keyed to the DEMO_TAG. Nothing is removed by
  // "everything of this type" — the fixture rows the policy suite depends on
  // live in the same tables, and a broad delete would take them with it.
  //
  // FK cascades do most of the work: removing an instance takes its bookings
  // and offers, and removing a family takes its riders.
  const removed = {};

  const del = async (table, column) => {
    const { data, error } = await supabase
      .from(table)
      .delete()
      .like(column, `${DEMO_TAG}%`)
      .select("id");
    if (error && !/schema cache|does not exist/i.test(error.message)) {
      fail(`Could not clear demo rows from ${table}`, error);
    }
    removed[table] = data?.length ?? 0;
  };

  await del("lesson_instances", "notes");
  await del("tasks", "title");
  await del("task_templates", "title");
  await del("announcements", "title");
  await del("families", "name"); // riders cascade

  for (const [table, count] of Object.entries(removed)) {
    console.log(`  ${table.padEnd(18)} ${count} removed`);
  }
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`${clean ? "Removing" : "Seeding"} demo data on ${SUPABASE_URL}\n`);

  if (clean) {
    await removeDemoData();
    console.log("✓ Demo data removed.");
    return;
  }

  // --- the admin who "posts" everything -------------------------------------
  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (!adminProfile) fail("No admin profile found. Run `npm run db:seed` first.");

  const { data: staffProfiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "staff");
  const staffId = staffProfiles?.[0]?.id ?? null;

  const { data: levels } = await supabase.from("levels").select("id, name").order("sort");
  const levelByName = new Map((levels ?? []).map((l) => [l.name, l.id]));

  // --- demo families and riders ---------------------------------------------
  const FAMILIES = [
    { name: `${DEMO_TAG} Whitfield`, riders: [["Ava Whitfield", "Training"]] },
    { name: `${DEMO_TAG} Marchetti`, riders: [["Luca Marchetti", "First"]] },
    { name: `${DEMO_TAG} Okonkwo`, riders: [["Ada Okonkwo", "Training"]] },
    { name: `${DEMO_TAG} Sørensen`, riders: [["Freya Sørensen", "Intro"]] },
  ];

  const demoRiders = [];
  for (const family of FAMILIES) {
    const { data: existing } = await supabase
      .from("families")
      .select("id")
      .eq("name", family.name)
      .maybeSingle();

    let familyId = existing?.id;
    if (!familyId) {
      const { data, error } = await supabase
        .from("families")
        .insert({ name: family.name, notes: "Demo data — safe to delete." })
        .select()
        .single();
      if (error) fail(`Could not create family ${family.name}`, error);
      familyId = data.id;
    }

    for (const [riderName, levelName] of family.riders) {
      const { data: rider } = await supabase
        .from("riders")
        .select("id")
        .eq("family_id", familyId)
        .eq("name", riderName)
        .maybeSingle();

      if (rider) {
        demoRiders.push(rider.id);
        continue;
      }
      const { data, error } = await supabase
        .from("riders")
        .insert({
          family_id: familyId,
          name: riderName,
          level_id: levelByName.get(levelName) ?? null,
          active: true,
        })
        .select()
        .single();
      if (error) fail(`Could not create rider ${riderName}`, error);
      demoRiders.push(data.id);
    }
  }
  console.log(`  families      ${FAMILIES.length} with ${demoRiders.length} riders`);

  // --- announcements ---------------------------------------------------------
  const ANNOUNCEMENTS = [
    {
      title: `${DEMO_TAG} Arena footing refreshed`,
      body_md:
        "The outdoor arena was dragged and watered this week. It's riding beautifully — come use it.",
      audience: "all",
      pinned: true,
    },
    {
      title: `${DEMO_TAG} Winter blanket check`,
      body_md: "Please make sure your horse's blankets are labelled before the cold snap.",
      audience: "all",
      pinned: false,
    },
    {
      title: `${DEMO_TAG} Staff: new feed order day`,
      body_md: "Feed orders now go in on Wednesdays. Let me know Tuesday if you're short.",
      audience: "staff",
      pinned: false,
    },
  ];

  for (const a of ANNOUNCEMENTS) {
    const { data: existing } = await supabase
      .from("announcements")
      .select("id")
      .eq("title", a.title)
      .maybeSingle();
    if (existing) continue;
    // notify=false: demo data should not fill everyone's bell.
    const { error } = await supabase
      .from("announcements")
      .insert({ ...a, notify: false, author: adminProfile.id });
    if (error) fail(`Could not create announcement ${a.title}`, error);
  }
  console.log(`  announcements ${ANNOUNCEMENTS.length}`);

  // --- tasks -----------------------------------------------------------------
  const TASK_TEMPLATES = [
    { title: `${DEMO_TAG} Morning feed`, recurrence: "daily", weekday: null },
    { title: `${DEMO_TAG} Turn out geldings`, recurrence: "daily", weekday: null },
    { title: `${DEMO_TAG} Scrub water troughs`, recurrence: "weekly", weekday: 3 },
    { title: `${DEMO_TAG} Sweep the aisle`, recurrence: "weekday", weekday: null },
  ];

  for (const t of TASK_TEMPLATES) {
    const { data: existing } = await supabase
      .from("task_templates")
      .select("id")
      .eq("title", t.title)
      .maybeSingle();
    if (existing) continue;
    const { error } = await supabase
      .from("task_templates")
      .insert({ ...t, description: "", default_assignee: staffId, active: true });
    if (error) fail(`Could not create task template ${t.title}`, error);
  }

  // Today's tasks, a couple already done so the screen isn't a wall of open work.
  const today = isoDate(0);
  const { data: demoTemplates } = await supabase
    .from("task_templates")
    .select("id, title")
    .like("title", `${DEMO_TAG}%`);

  let doneCount = 0;
  for (const [index, template] of (demoTemplates ?? []).entries()) {
    const { data: existing } = await supabase
      .from("tasks")
      .select("id")
      .eq("template_id", template.id)
      .eq("date", today)
      .maybeSingle();
    if (existing) continue;

    const done = index < 2;
    if (done) doneCount++;
    const { error } = await supabase.from("tasks").insert({
      template_id: template.id,
      title: template.title,
      description: "",
      date: today,
      assignee: staffId,
      status: done ? "done" : "open",
      completed_at: done ? new Date().toISOString() : null,
      completed_by: done ? staffId : null,
    });
    if (error) fail(`Could not create task ${template.title}`, error);
  }
  console.log(`  tasks         ${demoTemplates?.length ?? 0} templates, today's generated (${doneCount} done)`);

  // --- lessons ---------------------------------------------------------------
  // Two weeks of instances, tagged in `notes` so teardown can find them.
  const SLOTS = [
    { weekday: 1, start: "16:00:00", type: "private", seats: 1, level: "Training" },
    { weekday: 2, start: "17:00:00", type: "group", seats: 4, level: "Intro" },
    { weekday: 4, start: "16:00:00", type: "private", seats: 1, level: "First" },
    { weekday: 6, start: "10:00:00", type: "group", seats: 4, level: "Training" },
  ];

  const instanceIds = [];
  for (let offset = 0; offset < 14; offset++) {
    const date = isoDate(offset);
    const isoDow = ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    for (const slot of SLOTS) {
      if (slot.weekday !== isoDow) continue;

      const { data: existing } = await supabase
        .from("lesson_instances")
        .select("id")
        .eq("date", date)
        .eq("start_time", slot.start)
        .like("notes", `${DEMO_TAG}%`)
        .maybeSingle();
      if (existing) {
        instanceIds.push(existing.id);
        continue;
      }

      const { data, error } = await supabase
        .from("lesson_instances")
        .insert({
          template_id: null,
          date,
          start_time: slot.start,
          duration_min: slot.type === "private" ? 45 : 60,
          type: slot.type,
          instructor_id: adminProfile.id,
          status: "scheduled",
          level_id: levelByName.get(slot.level) ?? null,
          max_riders: slot.seats,
          notes: `${DEMO_TAG} sample lesson`,
        })
        .select()
        .single();
      if (error) fail("Could not create a demo lesson", error);
      instanceIds.push(data.id);
    }
  }

  // Book riders into most of them, leaving one seat free for the offer below.
  let booked = 0;
  for (const [index, instanceId] of instanceIds.entries()) {
    const rider = demoRiders[index % demoRiders.length];
    const { data: existing } = await supabase
      .from("lesson_riders")
      .select("id")
      .eq("instance_id", instanceId)
      .eq("rider_id", rider)
      .maybeSingle();
    if (existing) continue;
    const { error } = await supabase
      .from("lesson_riders")
      .insert({ instance_id: instanceId, rider_id: rider, status: "booked" });
    if (!error) booked++;
  }
  console.log(`  lessons       ${instanceIds.length} instances, ${booked} riders booked`);

  // One open backfill offer, so the parent view has something live in it.
  if (instanceIds.length > 0) {
    const target = instanceIds[instanceIds.length - 1];
    // Free the seat first, so the offer is genuinely fillable.
    await supabase.from("lesson_riders").delete().eq("instance_id", target);

    const candidate = demoRiders[0];
    const { data: existing } = await supabase
      .from("backfill_offers")
      .select("id")
      .eq("instance_id", target)
      .eq("rider_id", candidate)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from("backfill_offers").insert({
        instance_id: target,
        rider_id: candidate,
        offered_by: adminProfile.id,
        status: "sent",
      });
      if (error) fail("Could not create the demo backfill offer", error);
    }
    console.log(`  backfill      1 open offer`);
  }

  console.log(`\n✓ Demo data seeded. Everything is prefixed "${DEMO_TAG}".`);
  console.log(`  Remove it with:  npm run demo:seed -- --clean`);
  console.log(`  Fixture users and the policy suite are untouched.`);
}

main().catch((error) => fail("Demo seed failed", error));
