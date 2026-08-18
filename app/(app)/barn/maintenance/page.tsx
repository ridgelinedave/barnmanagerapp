import { notFound } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { Card, Chip, ChipRow, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { SheetTrigger } from "@/components/ui/Sheet";
import { MaintenanceAddForm, MaintenanceStatusButton } from "@/components/BarnOpsForms";
import { canResolveMaintenance, isBarnSide, listMaintenance } from "@/lib/barn-ops";
import { MAINTENANCE_STATUS_LABELS, type MaintenanceStatus } from "@/lib/types";

export const metadata = { title: "Maintenance" };

/**
 * Broken things, grouped by status.
 *
 * Barn-only — the policy has no parent branch, so this 404s for a family
 * rather than showing them an empty board that reads as "nothing to do".
 *
 * ANYONE ON THE BARN SIDE CAN RAISE ONE; only someone with the manage
 * permission can move it along. Raising is an observation, resolving is a
 * decision. Staff without the flag see no status buttons rather than buttons
 * that fail — and the action still refuses server-side if one is forged,
 * because a hidden control is not a permission.
 */
const GROUPS: { status: MaintenanceStatus; title: string }[] = [
  { status: "open", title: "Open" },
  { status: "in_progress", title: "In progress" },
  { status: "done", title: "Done" },
];

export default async function MaintenancePage() {
  if (!(await isBarnSide())) notFound();

  const [rows, canResolve] = await Promise.all([listMaintenance(), canResolveMaintenance()]);

  return (
    <TabPage
      title="Maintenance"
      back="/barn"
      action={
        <SheetTrigger label="Log" title="Log a maintenance request" variant="primary">
          <MaintenanceAddForm />
        </SheetTrigger>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          title="Nothing broken"
          body="Log a broken gate, a dead light or a dripping tap and it lands on this board."
        />
      ) : (
        GROUPS.map(({ status, title }) => {
          const inGroup = rows.filter((r) => r.status === status);
          if (inGroup.length === 0) return null;

          return (
            <section key={status} className="flex flex-col gap-3">
              <SectionHeader title={title} count={`${inGroup.length}`} />
              {inGroup.map((row) => (
                <Card key={row.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-baseline gap-3">
                    <h3 className="min-w-0 flex-1 font-display text-heading leading-snug text-ink">
                      {row.title}
                    </h3>
                    {row.priority === "high" && <Chip value="Urgent" icon="alert" tone="danger" />}
                  </div>

                  {row.description && <p className="text-body text-ink">{row.description}</p>}

                  <ChipRow>
                    <Chip value={MAINTENANCE_STATUS_LABELS[row.status]} />
                    {row.assigneeName && <Chip value={row.assigneeName} icon="people" />}
                  </ChipRow>

                  {canResolve && row.status !== "done" && (
                    <div className="flex flex-wrap gap-2">
                      {row.status === "open" && (
                        <MaintenanceStatusButton id={row.id} next="in_progress" label="Start it" />
                      )}
                      <MaintenanceStatusButton id={row.id} next="done" label="Mark done" />
                    </div>
                  )}
                </Card>
              ))}
            </section>
          );
        })
      )}
    </TabPage>
  );
}
