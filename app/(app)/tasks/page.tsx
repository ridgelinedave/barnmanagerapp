import Link from "next/link";
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
        <StubScreen
          heading="Today's tasks"
          phase="Phase 1"
          detail="Your job list, the daily feed board and quick care logging."
        />
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
      {featureEnabled("horses") && (
        <Link
          href="/tasks/feed"
          className="flex min-h-16 items-center gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4"
        >
          <span className="flex-1">
            <span className="block text-base font-semibold">Feed board</span>
            <span className="block text-sm text-brand-ink/60">
              Who eats what, morning, lunch and evening.
            </span>
          </span>
          <span aria-hidden="true" className="text-brand-ink/40">
            ›
          </span>
        </Link>
      )}

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
