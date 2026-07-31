import Link from "next/link";
import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { currentRole } from "@/lib/guard";
import { listActiveTemplates, listSubmissions, onboardingOutstanding } from "@/lib/forms";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Forms" };

export default async function FormsPage() {
  const role = await currentRole();

  if (!featureEnabled("forms")) {
    return (
      <TabPage title="Forms">
        <StubScreen
          heading="Forms"
          phase="Phase 2"
          detail="Waivers and barn paperwork, filled in and signed on your phone."
        />
      </TabPage>
    );
  }

  // Staff have no policy on either table, so this screen is not for them.
  if (role === "staff") {
    return (
      <TabPage title="Forms">
        <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
          Family paperwork is between the family and the barn owner.
        </p>
      </TabPage>
    );
  }

  const [submissions, templates] = await Promise.all([listSubmissions(), listActiveTemplates()]);
  const templateName = new Map(templates.map((t) => [t.id, t.name]));
  const outstanding = onboardingOutstanding(submissions);

  return (
    <TabPage title="Forms">
      {submissions.length === 0 ? (
        <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
          Nothing to fill in right now. The barn will let you know if that changes.
        </p>
      ) : (
        <>
          <p className="text-sm text-brand-ink/70">
            {outstanding.length === 0
              ? "Everything is signed and on file. Thank you."
              : `${outstanding.length} still to complete.`}
          </p>

          {submissions.map((submission) => {
            const done = submission.status === "complete";
            return (
              <Link
                key={submission.id}
                href={`/more/forms/${submission.id}`}
                className={`flex min-h-16 items-center gap-3 rounded-2xl border p-4 ${
                  done ? "border-brand-ink/10 bg-brand-ink/5" : "border-brand-ink/15 bg-white"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold leading-snug">
                    {templateName.get(submission.template_id) ?? "Form"}
                  </span>
                  <span className="mt-0.5 block text-sm text-brand-ink/60">
                    {done ? `Signed by ${submission.signed_name}` : "Not started"}
                  </span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-brand-ink/40">
                  ›
                </span>
              </Link>
            );
          })}
        </>
      )}

      <Link href="/more" className="py-2 text-center text-sm font-medium underline">
        Back to More
      </Link>
    </TabPage>
  );
}
