import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { TaskCard } from "@/components/TaskCard";
import { requireTab } from "@/lib/guard";
import { listTasksForDate } from "@/lib/tasks";
import { barnToday, formatBarnDayLabel } from "@/lib/dates";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Tasks" };

export default async function TasksPage() {
  await requireTab("/tasks");

  if (!featureEnabled("tasks")) {
    return (
      <TabPage title="Tasks">
        <StubScreen heading="Today's tasks" phase="Phase 1">
          <p className="text-sm text-brand-ink/70">
            Task cards, the daily feed list, and quick care logging land here.
          </p>
        </StubScreen>
      </TabPage>
    );
  }

  const today = barnToday();
  // RLS scopes this to the signed-in staff member's own assignments.
  const tasks = await listTasksForDate(today);

  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <TabPage title="Tasks">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold">{formatBarnDayLabel(today)}</h2>
        <p className="text-sm text-brand-ink/60">
          {open.length === 0
            ? tasks.length === 0
              ? "Nothing assigned"
              : "All done"
            : `${open.length} to do`}
        </p>
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
          No tasks assigned to you today.
        </p>
      ) : (
        <>
          {open.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}

          {done.length > 0 && (
            <>
              <h3 className="mt-2 text-sm font-semibold text-brand-ink/60">
                Done ({done.length})
              </h3>
              {done.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </>
          )}
        </>
      )}
    </TabPage>
  );
}
