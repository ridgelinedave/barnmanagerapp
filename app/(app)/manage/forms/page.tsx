import Link from "next/link";
import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { EnsureOnboardingButton } from "@/components/FormsAdmin";
import { requireTab } from "@/lib/guard";
import { familyProgress, listAllTemplates } from "@/lib/forms";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Forms" };

export default async function ManageFormsPage() {
  await requireTab("/manage");

  if (!featureEnabled("forms")) {
    return (
      <TabPage title="Forms">
        <StubScreen
          heading="Forms"
          phase="Phase 2"
          detail="Waiver templates, who has signed, and the signed-copy vault."
        />
      </TabPage>
    );
  }

  const [progress, templates] = await Promise.all([familyProgress(), listAllTemplates()]);

  const incomplete = progress.filter((f) => f.pending > 0);
  const done = progress.filter((f) => f.pending === 0 && f.complete > 0);
  const untouched = progress.filter((f) => f.pending === 0 && f.complete === 0);

  return (
    <TabPage title="Forms">
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold">Still to sign</h2>
          <p className="text-sm text-brand-ink/60">
            {incomplete.length === 0 ? "Nobody" : `${incomplete.length} famil${incomplete.length === 1 ? "y" : "ies"}`}
          </p>
        </div>

        {incomplete.length === 0 ? (
          <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
            Every family with paperwork has signed it.
          </p>
        ) : (
          incomplete.map((family) => (
            <div
              key={family.familyId}
              className="flex min-h-16 items-center gap-3 rounded-2xl border border-brand-ink/15 bg-white p-4"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold leading-snug">
                  {family.familyName}
                </span>
                <span className="mt-0.5 block text-sm text-brand-ink/60">
                  {family.pending} outstanding
                  {family.complete > 0 ? ` · ${family.complete} signed` : ""}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-brand-gold/30 px-2 py-0.5 text-[11px] font-semibold text-brand-ink">
                {family.pending}
              </span>
            </div>
          ))
        )}
      </section>

      {done.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-brand-ink/60">
            Fully signed ({done.length})
          </h2>
          {done.map((family) => (
            <div
              key={family.familyId}
              className="flex min-h-14 items-center gap-3 rounded-2xl border border-brand-ink/10 bg-brand-ink/5 p-4"
            >
              <span className="min-w-0 flex-1 text-base font-medium">{family.familyName}</span>
              <span className="shrink-0 text-sm text-brand-ink/60">{family.complete} signed</span>
            </div>
          ))}
        </section>
      )}

      {untouched.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-brand-ink/60">
            No paperwork yet ({untouched.length})
          </h2>
          <p className="text-sm text-brand-ink/70">
            These families have no submissions at all. Set their checklist up below.
          </p>
          {untouched.map((family) => (
            <div
              key={family.familyId}
              className="flex flex-col gap-3 rounded-2xl border border-brand-ink/15 bg-white p-4"
            >
              <span className="text-base font-medium">{family.familyName}</span>
              <EnsureOnboardingButton familyId={family.familyId} />
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Templates</h2>
        {templates.length === 0 ? (
          <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
            No templates yet. They are created directly in the database for now.
          </p>
        ) : (
          templates.map((template) => (
            <div
              key={template.id}
              className={`rounded-2xl border p-4 ${
                template.active ? "border-brand-ink/15 bg-white" : "border-brand-ink/10 bg-brand-ink/5"
              }`}
            >
              <h3 className="text-base font-semibold leading-snug">{template.name}</h3>
              <p className="mt-0.5 text-sm text-brand-ink/70">
                {template.applies_to === "rider" ? "One per rider" : "One per family"}
                {template.required ? " · Required" : " · Optional"}
                {template.active ? "" : " · Inactive"}
              </p>
            </div>
          ))
        )}
      </section>

      <Link href="/manage" className="py-2 text-center text-sm font-medium underline">
        Back to Manage
      </Link>
    </TabPage>
  );
}
