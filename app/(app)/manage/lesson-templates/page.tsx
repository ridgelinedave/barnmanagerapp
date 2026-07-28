import Link from "next/link";
import { TabPage } from "@/components/TabPage";
import { LessonTemplateForm } from "@/components/LessonTemplateForm";
import { requireTab } from "@/lib/guard";
import { listLessonTemplates } from "@/lib/lessons";
import { listAssignableProfiles, nameMap } from "@/lib/tasks";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import { formatTime, WEEKDAY_NAMES } from "@/lib/dates";
import type { Level } from "@/lib/types";
import { deleteLessonTemplate, setTemplateActive } from "./actions";

export const metadata = { title: "Weekly schedule" };

async function listLevels(): Promise<Level[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("levels").select("*").order("sort");
  return (data ?? []) as Level[];
}

export default async function LessonTemplatesPage() {
  await requireTab("/manage");

  const [templates, people, levels] = await Promise.all([
    listLessonTemplates(),
    listAssignableProfiles(),
    listLevels(),
  ]);

  const instructorNames = nameMap(people);
  const levelNames = new Map(levels.map((l) => [l.id, l.name]));

  // Grouped by day so the week reads like a week, not a flat list.
  const byDay = WEEKDAY_NAMES.map((name, index) => ({
    name,
    weekday: index + 1,
    slots: templates.filter((t) => t.weekday === index + 1),
  }));

  return (
    <TabPage title="Weekly schedule">
      <p className="text-sm text-brand-ink/70">
        Build the repeating week once. Generate the calendar from the Schedule tab, then edit
        only the days that differ.
      </p>

      {byDay.map((day) => (
        <section key={day.name} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-ink/55">
            {day.name}
          </h2>

          {day.slots.length === 0 ? (
            <p className="rounded-xl border border-dashed border-brand-ink/20 p-3 text-sm text-brand-ink/55">
              Nothing scheduled
            </p>
          ) : (
            day.slots.map((template) => (
              <div
                key={template.id}
                className={`rounded-2xl border p-4 ${
                  template.active
                    ? "border-brand-ink/15 bg-white"
                    : "border-brand-ink/10 bg-brand-ink/5"
                }`}
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-base font-semibold tabular-nums">
                    {formatTime(template.start_time)}
                  </span>
                  <span className="text-sm text-brand-ink/60">
                    {template.duration_min} min ·{" "}
                    {template.type === "private"
                      ? "Private"
                      : `Group of ${template.max_riders}`}
                  </span>
                  {!template.active && (
                    <span className="ml-auto rounded-full bg-brand-ink/10 px-2 py-0.5 text-[11px] font-semibold text-brand-ink/70">
                      Paused
                    </span>
                  )}
                </div>

                <p className="mt-1 text-sm text-brand-ink/70">
                  {template.instructor_id
                    ? instructorNames.get(template.instructor_id) ?? "Unknown instructor"
                    : "No instructor set"}
                  {template.level_id ? ` · ${levelNames.get(template.level_id) ?? "Level"}` : ""}
                </p>

                <div className="mt-3 flex gap-2">
                  <form action={setTemplateActive} className="flex-1">
                    <input type="hidden" name="id" value={template.id} />
                    <input type="hidden" name="active" value={template.active ? "false" : "true"} />
                    <button
                      type="submit"
                      className="min-h-11 w-full rounded-xl border border-brand-ink/20 bg-white text-sm font-semibold"
                    >
                      {template.active ? "Pause" : "Resume"}
                    </button>
                  </form>
                  <form action={deleteLessonTemplate}>
                    <input type="hidden" name="id" value={template.id} />
                    <button
                      type="submit"
                      className="min-h-11 rounded-xl border border-red-300 bg-white px-3 text-sm font-semibold text-red-700"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            ))
          )}
        </section>
      ))}

      <section className="flex flex-col gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4">
        <h2 className="text-base font-semibold">Add a weekly slot</h2>
        <LessonTemplateForm
          instructors={people.map((p) => ({ id: p.id, name: p.full_name ?? "Unnamed" }))}
          levels={levels.map((l) => ({ id: l.id, name: l.name }))}
        />
      </section>

      <Link href="/schedule" className="py-2 text-center text-sm font-medium underline">
        Back to Schedule
      </Link>
    </TabPage>
  );
}
