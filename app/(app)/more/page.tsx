import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { InstallPrompt } from "@/components/InstallPrompt";
import { currentRole } from "@/lib/guard";
import { barn } from "@/config/barn";

export const metadata = { title: "More" };

const MORE_BY_ROLE = {
  parent: "Family profile and riders, forms and documents, FAQ, resources, shop, and notification preferences land here.",
  staff: "Your timesheet history, the horse directory, and FAQ land here.",
  admin:
    "Barn settings, QuickBooks connection status, notification preferences, and CSV utilities land here.",
} as const;

export default async function MorePage() {
  const role = await currentRole();

  return (
    <TabPage title="More">
      <StubScreen heading="More" phase="Phases 1–3">
        <p className="text-sm text-brand-ink/70">{MORE_BY_ROLE[role]}</p>
      </StubScreen>

      <InstallPrompt />

      <section className="rounded-2xl border border-brand-ink/10 bg-white p-4">
        <h2 className="text-base font-semibold">Barn</h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-brand-ink/60">Name</dt>
          <dd>{barn.name}</dd>
          <dt className="text-brand-ink/60">Owner</dt>
          <dd>{barn.owner}</dd>
          <dt className="text-brand-ink/60">Area</dt>
          <dd>{barn.area}</dd>
          <dt className="text-brand-ink/60">Timezone</dt>
          <dd>{barn.timezone}</dd>
        </dl>
      </section>

      <form action="/auth/sign-out" method="post">
        <button
          type="submit"
          className="min-h-12 w-full rounded-xl border border-brand-ink/20 bg-white px-4 text-sm font-semibold"
        >
          Sign out
        </button>
      </form>
    </TabPage>
  );
}
