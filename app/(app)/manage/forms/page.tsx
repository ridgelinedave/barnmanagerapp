import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { EnsureOnboardingButton } from "@/components/FormsAdmin";
import { Card, Chip, ChipRow, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { ListRow } from "@/components/ui/ListRow";
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
    <TabPage title="Forms" back="/manage">
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Still to sign"
          count={
            incomplete.length === 0
              ? "Nobody"
              : `${incomplete.length} famil${incomplete.length === 1 ? "y" : "ies"}`
          }
        />

        {incomplete.length === 0 ? (
          <EmptyState
            title="Everyone is up to date"
            body="Every family with paperwork on their checklist has signed it. Nothing to chase."
          />
        ) : (
          incomplete.map((family) => (
            <ListRow
              key={family.familyId}
              title={family.familyName}
              meta={`${family.pending} outstanding${family.complete > 0 ? ` · ${family.complete} signed` : ""}`}
              trailing={<Chip value={`${family.pending}`} icon="alert" tone="gold" />}
            />
          ))
        )}
      </section>

      {done.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Fully signed" count={`${done.length}`} />
          {done.map((family) => (
            <ListRow
              key={family.familyId}
              title={family.familyName}
              muted
              trailing={<Chip value={`${family.complete} signed`} icon="check" tone="forest" />}
            />
          ))}
        </section>
      )}

      {untouched.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="No paperwork yet" count={`${untouched.length}`} />
          <p className="text-caption text-muted">
            These families have no submissions at all. Set their checklist up below.
          </p>
          {untouched.map((family) => (
            <Card key={family.familyId} className="flex flex-col gap-3 p-4">
              <span className="font-display text-heading text-ink">{family.familyName}</span>
              <EnsureOnboardingButton familyId={family.familyId} />
            </Card>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionHeader title="Templates" count={`${templates.length}`} />
        {templates.length === 0 ? (
          <EmptyState
            title="No templates yet"
            body="No authoring screen yet — templates are seeded directly."
          />
        ) : (
          templates.map((template) => (
            <Card key={template.id} className={`p-4 ${template.active ? "" : "bg-sunk"}`}>
              <h3 className="font-display text-heading leading-snug text-ink">{template.name}</h3>
              <div className="mt-1.5">
                <ChipRow>
                  <Chip
                    value={template.applies_to === "rider" ? "One per rider" : "One per family"}
                  />
                  <Chip
                    value={template.required ? "Required" : "Optional"}
                    icon={template.required ? "alert" : "check"}
                    tone={template.required ? "gold" : "neutral"}
                  />
                  {!template.active && <Chip value="Inactive" icon="clock" tone="neutral" />}
                </ChipRow>
              </div>
            </Card>
          ))
        )}
      </section>
    </TabPage>
  );
}
