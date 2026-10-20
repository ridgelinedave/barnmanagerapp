import { TabPage } from "@/components/TabPage";
import { LessonsSegments } from "@/components/LessonsSegments";
import { LessonTemplateForm } from "@/components/LessonTemplateForm";
import { Card, Chip, ChipRow, SectionHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { ConfirmDeleteForm } from "@/components/ConfirmDelete";
import { EndEnrolmentForm, EnrolForm } from "@/components/LessonSeriesForms";
import { featureEnabled } from "@/config/barn";
import { listHorses } from "@/lib/horses";
import { barnToday } from "@/lib/dates";
import { SheetTrigger } from "@/components/ui/Sheet";
import { requireTab } from "@/lib/guard";
import { listLessonTemplates, listLevels, listOpenEnrolments, listVisibleRiders } from "@/lib/lessons";
import { listAssignableProfiles, nameMap } from "@/lib/tasks";
import { formatTime, WEEKDAY_NAMES } from "@/lib/dates";
import { deleteLessonTemplate, setTemplateActive } from "@/app/(app)/manage/lesson-templates/actions";

/**
 * Students — the weekly lesson pattern and who rides in it. The admin's first
 * Lessons segment, at /lessons (it used to be /manage/lesson-templates, which
 * now redirects here).
 */
export async function StudentsView() {
  const role = await requireTab("/manage");

  const series = featureEnabled("lessonSeries");
  const today = barnToday();
  const [templates, people, levels, enrolments, riders, horses] = await Promise.all([
    listLessonTemplates(),
    listAssignableProfiles(),
    listLevels(),
    listOpenEnrolments(today),
    series ? listVisibleRiders() : Promise.resolve([]),
    series ? listHorses() : Promise.resolve([]),
  ]);
  const riderName = new Map(riders.map((r) => [r.id, r.name]));
  const horseName = new Map(horses.map((h) => [h.id, h.barn_name || h.name]));
  const horseOptions = horses
    .filter((h) => h.active)
    .map((h) => ({ id: h.id, name: h.barn_name || h.name }));
  const CADENCE = (weeks: number) =>
    weeks === 1 ? "Weekly" : weeks === 2 ? "Every two weeks" : `Every ${weeks} weeks`;

  const instructorNames = nameMap(people);
  const levelNames = new Map(levels.map((l) => [l.id, l.name]));

  // Grouped by day so the week reads like a week, not a flat list.
  const byDay = WEEKDAY_NAMES.map((name, index) => ({
    name,
    weekday: index + 1,
    slots: templates.filter((t) => t.weekday === index + 1),
  }));

  return (
    <TabPage density="tight" title="Lessons" tabs={<LessonsSegments role={role} current="/lessons" />}>
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
                  <span className="font-condensed text-title font-semibold leading-none text-ink">
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
                  {/* One tap used to delete a weekly slot outright. */}
                  <ConfirmDeleteForm
                    action={deleteLessonTemplate}
                    fields={{ id: template.id }}
                    name={`the ${formatTime(template.start_time)} ${day.name} slot`}
                  />
                </div>

                {series && (
                  <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3">
                    {enrolments
                      .filter((e) => e.template_id === template.id)
                      .map((e) => (
                        <div key={e.id} className="flex items-center gap-3">
                          <span className="min-w-0 flex-1">
                            <span className="block font-display text-heading leading-snug text-ink">
                              {riderName.get(e.rider_id) ?? "Rider"}
                            </span>
                            <span className="block font-condensed text-label font-medium text-muted">
                              {CADENCE(e.interval_weeks)} from {e.anchor_date}
                              {e.horse_id && horseName.get(e.horse_id) ? ` · ${horseName.get(e.horse_id)}` : ""}
                              {e.ends_on ? ` · until ${e.ends_on}` : ""}
                            </span>
                          </span>
                          <SheetTrigger label="End" title={`End — ${riderName.get(e.rider_id) ?? "rider"}`}>
                            <EndEnrolmentForm enrolmentId={e.id} today={today} />
                          </SheetTrigger>
                        </div>
                      ))}
                    <SheetTrigger label="Enrol a rider" title={`Enrol — ${day.name} ${formatTime(template.start_time)}`}>
                      <EnrolForm
                        templateId={template.id}
                        today={today}
                        horses={horseOptions}
                        riders={riders
                          .filter((r) => !template.level_id || r.level_id === template.level_id)
                          .map((r) => ({ id: r.id, name: r.name }))}
                      />
                    </SheetTrigger>
                  </div>
                )}
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
