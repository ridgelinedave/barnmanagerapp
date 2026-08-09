import { TabPage } from "@/components/TabPage";
import { TaskCard } from "@/components/TaskCard";
import { AdHocTaskForm, GenerateTasksButton, TaskTemplateForm } from "@/components/TaskAdmin";
import { Card, Chip, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { SheetTrigger } from "@/components/ui/Sheet";
import { requireTab } from "@/lib/guard";
import { listTasksForDate, listTaskTemplates, listAssignableProfiles, nameMap } from "@/lib/tasks";
import { barnToday, formatBarnDayLabel, WEEKDAY_NAMES } from "@/lib/dates";
import { assignTask, deleteTask, deleteTaskTemplate, setTemplateActive } from "./actions";

export const metadata = { title: "Tasks" };

function recurrenceLabel(recurrence: string, weekday: number | null): string {
  if (recurrence === "daily") return "Every day";
  if (recurrence === "weekday") return "Weekdays";
  return weekday ? `Weekly on ${WEEKDAY_NAMES[weekday - 1]}` : "Weekly";
}

export default async function ManageTasksPage() {
  await requireTab("/manage");

  const today = barnToday();
  const [tasks, templates, assignable] = await Promise.all([
    listTasksForDate(today),
    listTaskTemplates(),
    listAssignableProfiles(),
  ]);

  const names = nameMap(assignable);
  const people = assignable.map((p) => ({ id: p.id, name: p.full_name ?? "Unnamed" }));

  return (
    <TabPage title="Tasks" back="/manage">
      <section className="flex flex-col gap-3">
        <SectionHeader title={formatBarnDayLabel(today)} count={`${tasks.length} on the list`} />
        <GenerateTasksButton />

        {tasks.length === 0 ? (
          <EmptyState
            title="Nothing scheduled today"
            body="Generate the day, or add a one-off."
          />
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="flex flex-col gap-2">
              <TaskCard
                task={task}
                showAssignee
                assigneeName={task.assignee ? names.get(task.assignee) : undefined}
              />
              <div className="flex flex-wrap items-center gap-2">
                <form action={assignTask} className="flex min-w-0 flex-1 items-center gap-2">
                  <input type="hidden" name="id" value={task.id} />
                  <label htmlFor={`assign-${task.id}`} className="sr-only">
                    Assign {task.title}
                  </label>
                  <Select
                    id={`assign-${task.id}`}
                    name="assignee"
                    defaultValue={task.assignee ?? ""}
                    className="min-w-0 flex-1"
                  >
                    <option value="">Unassigned</option>
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" variant="secondary">
                    Assign
                  </Button>
                </form>
                <form action={deleteTask}>
                  <input type="hidden" name="id" value={task.id} />
                  <Button type="submit" variant="danger">
                    Delete
                  </Button>
                </form>
              </div>
            </div>
          ))
        )}
      </section>

      {/* A one-off is an exception — pulled up when needed, not parked here. */}
      <SheetTrigger label="Add a one-off task" title="One-off task">
        <AdHocTaskForm assignable={people} />
      </SheetTrigger>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Recurring templates" count={`${templates.length}`} />

        {templates.length === 0 ? (
          <EmptyState
            title="No templates yet"
            body="Recurring jobs the day builds itself from."
          />
        ) : (
          templates.map((template) => (
            <Card
              key={template.id}
              className={`p-4 ${template.active ? "" : "bg-sunk"}`}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-heading leading-snug text-ink">
                    {template.title}
                  </h3>
                  <p className="mt-0.5 text-caption text-muted">
                    {recurrenceLabel(template.recurrence, template.weekday)}
                    {template.default_assignee
                      ? ` · ${names.get(template.default_assignee) ?? "Unknown"}`
                      : " · Unassigned"}
                  </p>
                </div>
                {!template.active && <Chip value="Paused" icon="clock" tone="neutral" />}
              </div>

              <div className="mt-3 flex gap-2">
                <form action={setTemplateActive} className="flex-1">
                  <input type="hidden" name="id" value={template.id} />
                  <input type="hidden" name="active" value={template.active ? "false" : "true"} />
                  <Button type="submit" variant="secondary" block>
                    {template.active ? "Pause" : "Resume"}
                  </Button>
                </form>
                <form action={deleteTaskTemplate}>
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

      <SheetTrigger label="New recurring template" title="Recurring template">
        <TaskTemplateForm assignable={people} />
      </SheetTrigger>
    </TabPage>
  );
}
