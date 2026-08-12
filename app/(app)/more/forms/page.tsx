import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { Card, Chip, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/Button";
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
        />
      </TabPage>
    );
  }

  const [submissions, templates] = await Promise.all([listSubmissions(), listActiveTemplates()]);
  const byId = new Map(templates.map((t) => [t.id, t]));
  const outstanding = onboardingOutstanding(submissions);
  const done = submissions.filter((s) => s.status === "complete");

  if (submissions.length === 0) {
    return (
      <TabPage title="Forms" back="/more">
        <EmptyState
          title="Nothing to fill in"
          body="Anything the barn needs signed appears here."
        />
      </TabPage>
    );
  }

  return (
    <TabPage title="Forms" back="/more">
      {/* To sign leads, and each is a card with ONE action. A family opening
          this screen wants to know what is left, not to read a list of
          everything they have ever signed. */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="To sign"
          count={outstanding.length === 0 ? "All done" : `${outstanding.length}`}
        />

        {outstanding.length === 0 ? (
          <EmptyState
            title="Everything is signed"
            body="Your paperwork is on file with the barn."
          />
        ) : (
          outstanding.map((submission) => {
            const template = byId.get(submission.template_id);
            return (
              <Card key={submission.id} className="flex flex-col gap-3 p-4">
                <div>
                  <h3 className="font-display text-heading leading-snug text-ink">
                    {template?.name ?? "Form"}
                  </h3>
                  {template?.description && (
                    <p className="mt-1 text-caption text-muted">{template.description}</p>
                  )}
                </div>
                <ButtonLink href={`/more/forms/${submission.id}`} variant="primary" block>
                  Open
                </ButtonLink>
              </Card>
            );
          })
        )}
      </section>

      {done.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Signed" count={`${done.length}`} />
          {done.map((submission) => (
            <Card key={submission.id} className="flex items-baseline gap-3 p-4">
              <span className="min-w-0 flex-1">
                <span className="block font-display text-heading leading-snug text-muted">
                  {byId.get(submission.template_id)?.name ?? "Form"}
                </span>
                <span className="mt-0.5 block text-caption text-muted">
                  Signed by {submission.signed_name}
                </span>
              </span>
              <Chip value="On file" icon="check" tone="forest" />
            </Card>
          ))}
        </section>
      )}
    </TabPage>
  );
}
