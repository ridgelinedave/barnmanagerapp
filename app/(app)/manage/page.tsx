import Link from "next/link";
import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { requireTab } from "@/lib/guard";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Manage" };

export default async function ManagePage() {
  await requireTab("/manage");

  return (
    <TabPage title="Manage">
      {featureEnabled("announcements") && (
        <Link
          href="/manage/announcements"
          className="flex min-h-16 items-center gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4"
        >
          <span className="flex-1">
            <span className="block text-base font-semibold">Announcements</span>
            <span className="block text-sm text-brand-ink/60">
              Post barn news to families and staff.
            </span>
          </span>
          <span aria-hidden="true" className="text-brand-ink/40">
            ›
          </span>
        </Link>
      )}

      {featureEnabled("tasks") && (
        <Link
          href="/manage/tasks"
          className="flex min-h-16 items-center gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4"
        >
          <span className="flex-1">
            <span className="block text-base font-semibold">Tasks</span>
            <span className="block text-sm text-brand-ink/60">
              Templates, today&apos;s jobs, and who&apos;s doing what.
            </span>
          </span>
          <span aria-hidden="true" className="text-brand-ink/40">
            ›
          </span>
        </Link>
      )}

      <StubScreen heading="Barn management" phase="Phases 1–3">
        <p className="text-sm text-brand-ink/70">
          Timesheet review and QuickBooks sync, tasks, horses, families and riders, forms admin,
          and the rest of the content tools land here.
        </p>
      </StubScreen>
    </TabPage>
  );
}
