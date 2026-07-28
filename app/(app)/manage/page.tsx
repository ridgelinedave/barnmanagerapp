import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { requireTab } from "@/lib/guard";

export const metadata = { title: "Manage" };

export default async function ManagePage() {
  await requireTab("/manage");

  return (
    <TabPage title="Manage">
      <StubScreen heading="Barn management" phase="Phases 1–3">
        <p className="text-sm text-brand-ink/70">
          Timesheet review and QuickBooks sync, tasks, horses, families and riders, forms admin,
          and content editing land here.
        </p>
      </StubScreen>
    </TabPage>
  );
}
