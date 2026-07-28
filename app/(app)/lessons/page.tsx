import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { requireTab } from "@/lib/guard";

export const metadata = { title: "Lessons" };

export default async function LessonsPage() {
  await requireTab("/lessons");

  return (
    <TabPage title="Lessons">
      <StubScreen heading="Upcoming lessons" phase="Phase 1">
        <p className="text-sm text-brand-ink/70">
          Your riders&apos; lessons, cancellation, the barn calendar, and the iCal subscribe
          button land here.
        </p>
      </StubScreen>
    </TabPage>
  );
}
