import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { requireTab, currentRole } from "@/lib/guard";

export const metadata = { title: "Schedule" };

export default async function SchedulePage() {
  await requireTab("/schedule");
  const role = await currentRole();

  return (
    <TabPage title="Schedule">
      <StubScreen heading="Day view" phase="Phase 1">
        <p className="text-sm text-brand-ink/70">
          {role === "admin"
            ? "The day-column calendar, slot editing, the weekly template wizard, and the cancellation-to-backfill flow land here."
            : "The day-column view of lessons and barn events lands here."}
        </p>
      </StubScreen>
    </TabPage>
  );
}
