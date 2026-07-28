import Link from "next/link";
import { TabPage } from "@/components/TabPage";
import { TaskCard } from "@/components/TaskCard";
import { AdHocTaskForm, GenerateTasksButton, TaskTemplateForm } from "@/components/TaskAdmin";
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
    <TabPage title="Tasks">
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{formatBarnDayLabel(today)}</h2>
        <GenerateTasksButton />

        {tasks.length === 0 ? (
          <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
            Nothing scheduled today. Generate from templates, or add a one-off below.
          </p>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="flex flex-col gap-2">
              <TaskCard
                task={task}
                showAssignee
                assigneeName={task.assignee ? names.get(task.assignee) : undefined}
              />
              <div className="flex flex-wrap items-center gap-2">
                <form action={assignTask} className="flex flex-1 items-center gap-2">
                  <input type="hidden" name="id" value={task.id} />
                  <label htmlFor={`assign-${task.id}`} className="sr-only">
                    Assign {task.title}
                  </label>
                  <select
                    id={`assign-${task.id}`}
                    name="assignee"
                    defaultValue={task.assignee ?? ""}
                    className="min-h-11 flex-1 rounded-xl border border-brand-ink/20 bg-white px-3 text-sm"
                  >
                    <option value="">Unassigned</option>
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="min-h-11 rounded-xl border border-brand-ink/20 bg-white px-3 text-sm font-semibold"
                  >
                    Assign
                  </button>
                </form>
                <form action={deleteTask}>
                  <input type="hidden" name="id" value={task.id} />
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

      <section className="flex flex-col gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4">
        <h2 className="text-base font-semibold">Add a one-off task</h2>
        <AdHocTaskForm assignable={people} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Recurring templates</h2>

        {templates.length === 0 ? (
          <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
            No templates yet.
          </p>
        ) : (
          templates.map((template) => (
            <div
              key={template.id}
              className={`rounded-2xl border p-4 ${
                template.active ? "border-brand-ink/15 bg-white" : "border-brand-ink/10 bg-brand-ink/5"
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold leading-snug">{template.title}</h3>
                  <p className="mt-0.5 text-sm text-brand-ink/70">
                    {recurrenceLabel(template.recurrence, template.weekday)}
                    {template.default_assignee
                      ? ` · ${names.get(template.default_assignee) ?? "Unknown"}`
                      : " · Unassigned"}
                  </p>
                </div>
                {!template.active && (
                  <span className="rounded-full bg-brand-ink/10 px-2 py-0.5 text-[11px] font-semibold text-brand-ink/70">
                    Paused
                  </span>
                )}
              </div>

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
                <form action={deleteTaskTemplate}>
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

      <section className="flex flex-col gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4">
        <h2 className="text-base font-semibold">New recurring template</h2>
        <TaskTemplateForm assignable={people} />
      </section>

      <Link href="/manage" className="py-2 text-center text-sm font-medium underline">
        Back to Manage
      </Link>
    </TabPage>
  );
}
