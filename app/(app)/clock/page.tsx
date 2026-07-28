import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { requireTab } from "@/lib/guard";

export const metadata = { title: "Clock" };

export default async function ClockPage() {
  await requireTab("/clock");

  return (
    <TabPage title="Clock">
      <StubScreen heading="Clock in and out" phase="Phase 1">
        <p className="text-sm text-brand-ink/70">
          The in/out button, GPS capture, today&apos;s punches, and your week total land here.
        </p>
      </StubScreen>
    </TabPage>
  );
}
