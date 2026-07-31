import { TabPage } from "@/components/TabPage";
import { LessonTemplateForm } from "@/components/LessonTemplateForm";
import { Card, Chip, ChipRow, SectionHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { SheetTrigger } from "@/components/ui/Sheet";
import { requireTab } from "@/lib/guard";
import { listLessonTemplates, listLevels } from "@/lib/lessons";
import { listAssignableProfiles, nameMap } from "@/lib/tasks";
import { formatTime, WEEKDAY_NAMES } from "@/lib/dates";
import { deleteLessonTemplate, setTemplateActive } from "./actions";

export const metadata = { title: "Weekly schedule" };

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
    <TabPage title="Weekly schedule" back="/manage">
      <p className="text-caption text-muted">
        Build the repeating week once. Generate the calendar from the Schedule tab, then edit
        only the days that differ.
      </p>

      {byDay.map((day) => (
        <section key={day.name} className="flex flex-col gap-2">
          <SectionHeader
            title={day.name}
            count={day.slots.length > 0 ? `${day.slots.length}` : undefined}
          />

          {day.slots.length === 0 ? (
            <p className="rounded-control border border-dashed border-line p-3 text-caption text-muted">
              Nothing scheduled
            </p>
          ) : (
            day.slots.map((template) => (
              <Card key={template.id} className={`p-4 ${template.active ? "" : "bg-sunk"}`}>
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-title leading-none text-ink">
                    {formatTime(template.start_time)}
                  </span>
                  <span className="text-caption text-muted">
                    {template.duration_min} min ·{" "}
                    {template.type === "private"
                      ? "Private"
                      : `Group of ${template.max_riders}`}
                  </span>
                </div>

                <div className="mt-1.5">
                  <ChipRow>
                    {!template.active && <Chip value="Paused" icon="clock" tone="neutral" />}
                    <Chip
                      label="With"
                      value={
                        template.instructor_id
                          ? (instructorNames.get(template.instructor_id) ?? "Unknown")
                          : "Nobody set"
                      }
                    />
                    {template.level_id && (
                      <Chip label="Level" value={levelNames.get(template.level_id) ?? "Level"} />
                    )}
                  </ChipRow>
                </div>

                <div className="mt-3 flex gap-2">
                  <form action={setTemplateActive} className="flex-1">
                    <input type="hidden" name="id" value={template.id} />
                    <input type="hidden" name="active" value={template.active ? "false" : "true"} />
                    <Button type="submit" variant="secondary" block>
                      {template.active ? "Pause" : "Resume"}
                    </Button>
                  </form>
                  <form action={deleteLessonTemplate}>
                    <input type="hidden" name="id" value={template.id} />
                    <Button type="submit" variant="danger">
                      Delete
                    </Button>
                  </form>
                </div>
              </Card>
            ))
          )}
        </section>
      ))}

      <SheetTrigger label="Add a weekly slot" title="Weekly slot" variant="primary">
        <LessonTemplateForm
          instructors={people.map((p) => ({ id: p.id, name: p.full_name ?? "Unnamed" }))}
          levels={levels.map((l) => ({ id: l.id, name: l.name }))}
        />
      </SheetTrigger>
    </TabPage>
  );
}
