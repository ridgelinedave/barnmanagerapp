import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { TaskCard } from "@/components/TaskCard";
import { EmptyState, SectionHeader } from "@/components/ui/primitives";
import { ListRow } from "@/components/ui/ListRow";
import { Icon } from "@/components/ui/Icon";
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
        <ListRow
          href="/tasks/feed"
          title="Feed board"
          meta="Who eats what, morning, lunch and evening"
          leading={
            <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-sunk text-accent-text">
              <Icon name="bucket" className="size-5" />
            </span>
          }
        />
      )}

      <SectionHeader
        title={formatBarnDayLabel(today)}
        count={
          open.length === 0
            ? tasks.length === 0
              ? "Nothing assigned"
              : "All done"
            : `${open.length} to do`
        }
      />

      {tasks.length === 0 ? (
        <EmptyState
          title="Nothing on your list"
          body="Jobs with your name on them show up here."
        />
      ) : (
        <>
          {open.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}

          {open.length === 0 && (
            <EmptyState
              title="That's the lot"
              body="Everything assigned to you today is ticked off. Nice work."
            />
          )}

          {done.length > 0 && (
            <>
              <SectionHeader title="Done" count={`${done.length}`} />
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
