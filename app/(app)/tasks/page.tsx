import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { requireTab } from "@/lib/guard";

export const metadata = { title: "Tasks" };

export default async function TasksPage() {
  await requireTab("/tasks");

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
