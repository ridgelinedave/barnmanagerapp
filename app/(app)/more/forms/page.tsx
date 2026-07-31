import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { Chip, ChipRow, EmptyState } from "@/components/ui/primitives";
import { ListRow } from "@/components/ui/ListRow";
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
      <TabPage title="Forms" back="/more">
        <EmptyState
          title="Not your paperwork"
          body="Family forms are between the family and the barn owner, so there is nothing here for staff."
          emoji="📄"
        />
      </TabPage>
    );
  }

  const [submissions, templates] = await Promise.all([listSubmissions(), listActiveTemplates()]);
  const templateName = new Map(templates.map((t) => [t.id, t.name]));
  const outstanding = onboardingOutstanding(submissions);

  return (
    <TabPage title="Forms" back="/more">
      {submissions.length === 0 ? (
        <EmptyState
          title="Nothing to fill in"
          body="When the barn needs a waiver or a form from you it appears here, and you can sign it on your phone."
          emoji="📄"
        />
      ) : (
        <>
          <p className="text-caption text-muted">
            {outstanding.length === 0
              ? "Everything is signed and on file. Thank you."
              : `${outstanding.length} still to complete.`}
          </p>

          {submissions.map((submission) => {
            const done = submission.status === "complete";
            return (
              <ListRow
                key={submission.id}
                href={`/more/forms/${submission.id}`}
                title={templateName.get(submission.template_id) ?? "Form"}
                muted={done}
                chips={
                  <ChipRow>
                    {done ? (
                      <Chip value={`Signed by ${submission.signed_name}`} icon="check" tone="forest" />
                    ) : (
                      <Chip value="Not started" icon="alert" tone="gold" />
                    )}
                  </ChipRow>
                }
              />
            );
          })}
        </>
      )}
    </TabPage>
  );
}
