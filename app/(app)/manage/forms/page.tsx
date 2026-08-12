import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { FormTemplateEditor } from "@/components/FormTemplateEditor";
import { FormIssuer } from "@/components/FormIssuer";
import { OnboardingPicker } from "@/components/FormsAdmin";
import { Card, Chip, ChipRow, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { SheetTrigger } from "@/components/ui/Sheet";
import { requireTab } from "@/lib/guard";
import { submissionRows, templateProgress } from "@/lib/forms";
import { listFamilies } from "@/lib/team";
import { fieldsOf } from "@/lib/types";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Forms" };

/**
 * The barn's paperwork — a checklist of cards, not a table.
 *
 * Two questions, in the order Belle actually asks them: WHO STILL OWES ME
 * SOMETHING, and WHAT FORMS DO I HAVE. Outstanding leads, because a list of
 * templates does not tell anyone what to do next.
 *
 * One action per card throughout. No SQL was needed for any of this — it is UI
 * over `form_templates` and `form_submissions`, both admin-policed since
 * migration 0013.
 */
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

  const [progress, rows, families] = await Promise.all([
    templateProgress(),
    submissionRows(),
    listFamilies(),
  ]);

  const outstanding = rows.filter((row) => row.submission.status !== "complete");
  const complete = rows.filter((row) => row.submission.status === "complete");
  const templates = progress.map((entry) => entry.template);

  return (
    <TabPage title="Forms" back="/manage">
      {/* ------------------------------------------------------------------ */}
      {/* Needs signature — the reason anyone opens this screen               */}
      {/* ------------------------------------------------------------------ */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Needs signature"
          count={outstanding.length === 0 ? "Nobody" : `${outstanding.length}`}
        />

        {outstanding.length === 0 ? (
          <EmptyState
            title="Everyone is up to date"
            body="Every form the barn has issued has been signed."
          />
        ) : (
          outstanding.map((row) => (
            <Card key={row.submission.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-baseline gap-3">
                <h3 className="min-w-0 flex-1 font-display text-heading leading-snug text-ink">
                  {row.riderName ?? row.familyName}
                </h3>
                <Chip value="Awaiting" icon="clock" tone="gold" />
              </div>
              <p className="text-caption text-muted">
                {row.templateName}
                {row.riderName ? ` · ${row.familyName}` : ""}
              </p>
            </Card>
          ))
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Complete                                                            */}
      {/* ------------------------------------------------------------------ */}
      {complete.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Complete" count={`${complete.length}`} />
          {complete.slice(0, 12).map((row) => (
            <Card key={row.submission.id} className="flex items-baseline gap-3 p-4">
              <span className="min-w-0 flex-1">
                <span className="block font-display text-heading leading-snug text-muted">
                  {row.riderName ?? row.familyName}
                </span>
                <span className="mt-0.5 block text-caption text-muted">{row.templateName}</span>
              </span>
              <Chip value="Signed" icon="check" tone="forest" />
            </Card>
          ))}
          {complete.length > 12 && (
            <p className="text-caption text-muted">
              And {complete.length - 12} more already signed.
            </p>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* The forms themselves                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="flex flex-col gap-3">
        <SectionHeader title="Forms" count={`${templates.length}`} />

        {templates.length === 0 ? (
          <EmptyState
            title="No forms yet"
            body="Build a waiver or a contact sheet, then issue it to your families."
          />
        ) : (
          progress.map(({ template, issued, complete: signed }) => {
            const fieldCount = fieldsOf(template.schema).length;

            return (
              <Card key={template.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-baseline gap-3">
                  <h3 className="min-w-0 flex-1 font-display text-heading leading-snug text-ink">
                    {template.name}
                  </h3>
                  {!template.active && <Chip value="Off" icon="clock" />}
                </div>

                {template.description && (
                  <p className="text-caption text-muted">{template.description}</p>
                )}

                <ChipRow>
                  <Chip value={template.applies_to === "rider" ? "Per rider" : "Per family"} />
                  <Chip
                    value={template.required ? "Required" : "Optional"}
                    icon={template.required ? "alert" : "check"}
                    tone={template.required ? "gold" : "neutral"}
                  />
                  <Chip value={`${fieldCount} question${fieldCount === 1 ? "" : "s"}`} />
                </ChipRow>

                {/* The completion line. Counts SUBMISSIONS, and says so — a
                    per-rider form has several per family, and "6 of 9 families"
                    would read as more done than it is. */}
                <p className="text-caption text-ink">
                  {issued === 0
                    ? "Not issued to anyone yet."
                    : `${signed} of ${issued} signed.`}
                </p>

                <div className="flex flex-col gap-2">
                  <SheetTrigger label="Edit" title={template.name}>
                    <FormTemplateEditor template={template} />
                  </SheetTrigger>
                  <SheetTrigger
                    label="Issue to…"
                    title={`Issue ${template.name}`}
                    variant="primary"
                  >
                    <FormIssuer
                      templates={templates}
                      families={families}
                      defaultTemplateId={template.id}
                    />
                  </SheetTrigger>
                </div>
              </Card>
            );
          })
        )}

        <SheetTrigger label="Build a form" title="New form" variant="primary">
          <FormTemplateEditor />
        </SheetTrigger>

        {/* The BULK path, kept distinct from "Issue to…" on purpose. This one
            hands a family everything marked required in one go, via
            ensure_family_onboarding(); the per-card action issues one chosen
            form to chosen families. Two different jobs, two different buttons. */}
        <SheetTrigger label="Set up a family's paperwork" title="Required forms">
          <OnboardingPicker families={families} />
        </SheetTrigger>
      </section>
    </TabPage>
  );
}
