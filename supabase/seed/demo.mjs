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
  // care_events, feed_plans and training_logs cascade from horses;
  // submissions from templates.
  await del("form_templates", "name");
  await del("horses", "name");
  await del("families", "name"); // riders cascade

  // Demo staff have auth users of their own, so they need removing on both
  // sides — a profile deleted without its login leaves an account that can
  // sign in and reach nothing.
  const { data: demoStaff } = await supabase
    .from("profiles")
    .select("id, user_id")
    .like("full_name", `${DEMO_TAG}%`);
  for (const person of demoStaff ?? []) {
    await supabase.from("profiles").delete().eq("id", person.id);
    await supabase.auth.admin.deleteUser(person.user_id).catch(() => {});
  }
  removed.profiles = demoStaff?.length ?? 0;

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
    {
      name: `${DEMO_TAG} Whitfield`,
      riders: [
        ["Ava Whitfield", "Training", "2011-04-18"],
        ["Beau Whitfield", "Intro", "2015-09-02"],
      ],
    },
    { name: `${DEMO_TAG} Marchetti`, riders: [["Luca Marchetti", "First", "2009-06-30"]] },
    { name: `${DEMO_TAG} Okonkwo`, riders: [["Ada Okonkwo", "Training", "2012-01-22"]] },
    { name: `${DEMO_TAG} Sørensen`, riders: [["Freya Sørensen", "Intro", "2014-11-07"]] },
    { name: `${DEMO_TAG} Harper`, riders: [["Rowan Harper", "Second", "2007-03-14"]] },
    { name: `${DEMO_TAG} Delgado`, riders: [["Mateo Delgado", "First", "2010-08-25"]] },
  ];

  const demoRiders = [];
  const familyIdByName = new Map();
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

    familyIdByName.set(family.name, familyId);

    for (const [riderName, levelName, dob] of family.riders) {
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
          // Real dates of birth so the age groups on the Team panel render —
          // age is derived, never stored, so a fixed date is the only way to
          // make that column show anything.
          dob,
          active: true,
        })
        .select()
        .single();
      if (error) fail(`Could not create rider ${riderName}`, error);
      demoRiders.push(data.id);
    }
  }
  console.log(`  families      ${FAMILIES.length} with ${demoRiders.length} riders`);

  // --- horses, with their feed charts ----------------------------------------
  //
  // Colour, sex and height are real columns as of migration 0019, so they are
  // seeded as data rather than smuggled into `breed` and `notes` the way this
  // block did before it landed. The feed board's "Bay gelding · 16.2h" is now
  // composed from three fields that can be sorted and validated.
  const HORSES = [
    {
      name: "Winston",
      colour: "Bay",
      sex: "gelding",
      height: 16.2,
      breed: "Thoroughbred",
      family: `${DEMO_TAG} Harper`,
      am: { description: "2 flakes timothy", supplements: "SmartVite · MSM", note: "Soak grain 10 min." },
      pm: { description: "2 flakes timothy", supplements: "SmartVite", note: "Muzzle on turnout after evening feed." },
    },
    {
      name: "Dakota",
      colour: "Chestnut",
      sex: "mare",
      height: 15.3,
      breed: "Quarter Horse",
      family: `${DEMO_TAG} Whitfield`,
      am: { description: "2 flakes orchard", supplements: "Vitamin E", note: "" },
      pm: { description: "2 flakes orchard", supplements: "", note: "Slow feeder net." },
    },
    {
      name: "Miller",
      colour: "Grey",
      sex: "gelding",
      height: 16.1,
      breed: "Connemara",
      family: null,
      am: { description: "3 flakes timothy", supplements: "Joint supplement", note: "Morning feed only." },
      pm: null,
    },
    {
      name: "Juno",
      colour: "Bay",
      sex: "mare",
      height: 15.2,
      breed: "Warmblood",
      family: `${DEMO_TAG} Marchetti`,
      am: { description: "2 flakes alfalfa mix", supplements: "SmartVite", note: "" },
      pm: { description: "2 flakes alfalfa mix", supplements: "SmartVite · Biotin", note: "" },
    },
    {
      name: "Remy",
      colour: "Palomino",
      sex: "gelding",
      // A whole number, so the display drops the decimal: "14h", not "14.0h".
      height: 14,
      breed: "Welsh Cob",
      family: `${DEMO_TAG} Sørensen`,
      am: { description: "1 flake timothy", supplements: "", note: "Small feeds — easy keeper." },
      pm: { description: "1 flake timothy", supplements: "Magnesium", note: "" },
    },
    {
      name: "Sable",
      colour: "Black",
      sex: "mare",
      height: 16,
      breed: "Friesian cross",
      family: null,
      am: { description: "2 flakes orchard", supplements: "Omega oil", note: "" },
      pm: { description: "2 flakes orchard", supplements: "Omega oil", note: "Feed alone — bolts." },
    },
  ];

  const horseIds = [];
  for (const horse of HORSES) {
    const tagged = `${DEMO_TAG} ${horse.name}`;
    let { data: existing } = await supabase
      .from("horses")
      .select("id")
      .eq("name", tagged)
      .maybeSingle();

    if (!existing) {
      const { data, error } = await supabase
        .from("horses")
        .insert({
          name: tagged,
          barn_name: horse.name,
          colour: horse.colour,
          sex: horse.sex,
          height_hands: horse.height,
          breed: horse.breed,
          owner_family_id: horse.family ? (familyIdByName.get(horse.family) ?? null) : null,
          notes: "Demo horse, safe to delete.",
          active: true,
        })
        .select()
        .single();
      if (error) fail(`Could not create horse ${horse.name}`, error);
      existing = data;
    }
    horseIds.push({ id: existing.id, spec: horse });

    for (const meal of ["am", "pm"]) {
      const plan = horse[meal];
      if (!plan) continue;
      const { data: already } = await supabase
        .from("feed_plans")
        .select("id")
        .eq("horse_id", existing.id)
        .eq("meal", meal)
        .eq("active", true)
        .maybeSingle();
      if (already) continue;

      const { error } = await supabase.from("feed_plans").insert({
        horse_id: existing.id,
        meal,
        description: plan.description,
        supplements: plan.supplements,
        special_instructions: plan.note,
        active: true,
      });
      if (error) fail(`Could not create the ${meal} feed plan for ${horse.name}`, error);
    }
  }
  console.log(`  horses        ${horseIds.length} with feed charts`);

  // --- who rides what --------------------------------------------------------
  let assigned = 0;
  for (const [index, rider] of demoRiders.entries()) {
    const horse = horseIds[index % horseIds.length];
    const { data: already } = await supabase
      .from("horse_riders")
      .select("id")
      .eq("horse_id", horse.id)
      .eq("rider_id", rider)
      .maybeSingle();
    if (already) continue;
    const { error } = await supabase
      .from("horse_riders")
      .insert({ horse_id: horse.id, rider_id: rider });
    if (!error) assigned++;
  }
  console.log(`  horse_riders  ${assigned} assignments`);

  // --- care events, some overdue so the due-soon screen has teeth ------------
  const CARE = [
    { type: "vaccine", description: "Spring 5-way", performed: -120, due: 245 },
    { type: "coggins", description: "Annual Coggins", performed: -200, due: 165 },
    { type: "farrier", description: "Reset, front shoes", performed: -38, due: -4 },
    { type: "deworm", description: "Ivermectin", performed: -95, due: -12 },
    { type: "dental", description: "Float", performed: -300, due: 65 },
    { type: "vet", description: "Lameness recheck — sound", performed: -21, due: null },
  ];

  let careCount = 0;
  for (const [index, horse] of horseIds.entries()) {
    const care = CARE[index % CARE.length];
    const performed = isoDate(care.performed);
    const { data: already } = await supabase
      .from("care_events")
      .select("id")
      .eq("horse_id", horse.id)
      .eq("performed_at", performed)
      .maybeSingle();
    if (already) continue;

    const { error } = await supabase.from("care_events").insert({
      horse_id: horse.id,
      type: care.type,
      description: care.description,
      performed_at: performed,
      due_next: care.due === null ? null : isoDate(care.due),
    });
    if (!error) careCount++;
  }
  console.log(`  care_events   ${careCount} (2 overdue)`);

  // --- training logs ---------------------------------------------------------
  // Skipped silently until migration 0020 is applied — the demo seed should not
  // fail on a table that is deliberately still awaiting audit.
  const TRAINING = [
    { discipline: "flatwork", focus: "Shoulder-in both reins", minutes: 45, ago: 1, notes: "Softer left than last week." },
    { discipline: "jumping", focus: "Grid work, 2'6\"", minutes: 50, ago: 3, notes: "" },
    { discipline: "hacking", focus: "Hill work out back", minutes: 60, ago: 5, notes: "Good forward walk." },
    { discipline: "groundwork", focus: "Long-lining", minutes: 30, ago: 8, notes: "" },
    { discipline: "dressage", focus: "Training level test 3", minutes: 40, ago: 11, notes: "Trot lengthenings coming." },
    { discipline: "lunging", focus: "Side reins, 20m", minutes: 25, ago: 14, notes: "" },
    { discipline: "conditioning", focus: "Trot sets", minutes: 35, ago: 18, notes: "" },
  ];

  let trainingCount = 0;
  let trainingSkipped = false;
  for (const [index, horse] of horseIds.entries()) {
    // Two sessions per horse, offset so the timelines are not identical.
    for (const offset of [0, 1]) {
      const t = TRAINING[(index * 2 + offset) % TRAINING.length];
      const performed = isoDate(-t.ago - index);

      const { data: already, error: readError } = await supabase
        .from("training_logs")
        .select("id")
        .eq("horse_id", horse.id)
        .eq("performed_at", performed)
        .maybeSingle();

      if (readError && /schema cache|does not exist/i.test(readError.message)) {
        trainingSkipped = true;
        break;
      }
      if (already) continue;

      const { error } = await supabase.from("training_logs").insert({
        horse_id: horse.id,
        performed_at: performed,
        discipline: t.discipline,
        focus: t.focus,
        notes: t.notes,
        duration_min: t.minutes,
      });
      if (!error) trainingCount++;
    }
    if (trainingSkipped) break;
  }
  console.log(
    trainingSkipped
      ? `  training_logs skipped — migration 0020 not applied yet`
      : `  training_logs ${trainingCount}`,
  );

  // --- onboarding forms ------------------------------------------------------
  const FORM_TEMPLATES = [
    {
      name: `${DEMO_TAG} Liability waiver`,
      description: "Required before a rider's first lesson.",
      applies_to: "rider",
      required: true,
      schema: [
        { key: "guardian", label: "Parent or guardian name", type: "text", required: true },
        { key: "understood", label: "I have read and accept the risks", type: "checkbox", required: true },
      ],
    },
    {
      name: `${DEMO_TAG} Emergency contact`,
      description: "Who we call, and who can make decisions.",
      applies_to: "family",
      required: true,
      schema: [
        { key: "contact", label: "Emergency contact name", type: "text", required: true },
        { key: "phone", label: "Phone", type: "text", required: true },
        { key: "vet", label: "Preferred vet", type: "text" },
      ],
    },
    {
      name: `${DEMO_TAG} Photo permission`,
      description: "Whether we can post your rider's photo.",
      applies_to: "family",
      required: false,
      schema: [{ key: "allow", label: "Photos may be shared", type: "checkbox" }],
    },
  ];

  const templateIds = [];
  for (const template of FORM_TEMPLATES) {
    let { data: existing } = await supabase
      .from("form_templates")
      .select("id")
      .eq("name", template.name)
      .maybeSingle();
    if (!existing) {
      const { data, error } = await supabase
        .from("form_templates")
        .insert({ ...template, active: true })
        .select()
        .single();
      if (error) fail(`Could not create form template ${template.name}`, error);
      existing = data;
    }
    templateIds.push({ id: existing.id, appliesTo: template.applies_to });
  }

  // A realistic mix: some signed, some still owed, so both sides of the
  // dashboard have something in them.
  let submissions = 0;
  const demoFamilyIds = [...familyIdByName.values()];
  for (const [index, familyId] of demoFamilyIds.entries()) {
    for (const template of templateIds) {
      const { data: already } = await supabase
        .from("form_submissions")
        .select("id")
        .eq("template_id", template.id)
        .eq("family_id", familyId)
        .is("rider_id", null)
        .maybeSingle();
      if (already) continue;

      // Roughly two thirds signed.
      const signed = (index + template.id.charCodeAt(0)) % 3 !== 0;
      const { error } = await supabase.from("form_submissions").insert({
        template_id: template.id,
        family_id: familyId,
        rider_id: null,
        data: signed ? { guardian: "Demo Parent", contact: "Demo Parent", phone: "555-0142" } : {},
        signed_name: signed ? "Demo Parent" : null,
        signed_at: signed ? new Date().toISOString() : null,
        status: signed ? "complete" : "pending",
      });
      if (!error) submissions++;
    }
  }
  console.log(`  forms         ${templateIds.length} templates, ${submissions} submissions`);

  // --- demo staff -------------------------------------------------------------
  // Real auth users, because a profile cannot exist without one. Removed on
  // --clean from both sides.
  const STAFF = [
    { name: "Nora Whitlock", email: "demo.nora@example.com", flags: { manage_horses: true } },
    { name: "Cal Rivers", email: "demo.cal@example.com", flags: { manage_schedule: true } },
  ];

  let staffCreated = 0;
  for (const person of STAFF) {
    const tagged = `${DEMO_TAG} ${person.name}`;
    const { data: already } = await supabase
      .from("profiles")
      .select("id")
      .eq("full_name", tagged)
      .maybeSingle();
    if (already) continue;

    const { data: created, error: userError } = await supabase.auth.admin.createUser({
      email: person.email,
      password: `demo-${Math.random().toString(36).slice(2, 10)}`,
      email_confirm: true,
      user_metadata: { full_name: tagged },
    });
    if (userError) continue; // already exists from a previous run

    const { error } = await supabase.from("profiles").insert({
      user_id: created.user.id,
      role: "staff",
      full_name: tagged,
      phone: "555-0175",
      ...person.flags,
    });
    if (!error) staffCreated++;
  }
  console.log(`  staff         ${staffCreated} created`);

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
