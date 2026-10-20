import { TabPage } from "@/components/TabPage";
import { Card, Chip, ChipRow, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { SheetTrigger } from "@/components/ui/Sheet";
import { BlanketPlanForm } from "@/components/BarnOpsForms";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { currentRole } from "@/lib/guard";
import { blanketSummary, canManageBarnOps, flySummary, listBlanketBoard } from "@/lib/barn-ops";

export const metadata = { title: "Blanketing" };

/**
 * What goes on tonight, one row per horse.
 *
 * A HORSE WITH NO PLAN STILL APPEARS. That is the point of a board: the gap is
 * the information, and a list of only the horses somebody already wrote a plan
 * for cannot tell you which horse was forgotten.
 *
 * A family sees only their own horse here — migration 0022's policy via
 * family_owns_horse — so for them this is a one-horse reference, not a board.
 *
 * WEATHER IS NOT WIRED. The rules say what to do at a temperature; nothing
 * reads a forecast. That is the documented future hook on blanket_plans, and
 * the copy says so rather than implying an automation that does not exist.
 */
export default async function BlanketingPage() {
  const role = await currentRole();
  const isBarn = role === "admin" || role === "staff";
  const [board, canDelete] = await Promise.all([
    listBlanketBoard(),
    isBarn ? canManageBarnOps() : Promise.resolve(false),
  ]);

  if (board.length === 0) {
    return (
      <TabPage density="tight" title="Blanketing" back="/barn">
        <EmptyState title="No horses yet" />
      </TabPage>
    );
  }

  const planned = board.filter((row) => row.plan);
  const missing = board.filter((row) => !row.plan);

  return (
    <TabPage density="tight" title="Blanketing" back="/barn">
      <section className="flex flex-col gap-3">
        <SectionHeader title="Blanket plans" count={`${planned.length} of ${board.length}`} />

        {planned.length === 0 ? (
          <EmptyState title="No blanket plans yet" />
        ) : (
          planned.map(({ horse, plan }) => {
            const fly = plan ? flySummary(plan) : "";
            const rules = plan ? blanketSummary(plan.blanket_rules) : "";
            return (
              <Card key={horse.id} className="flex flex-col gap-2 p-4">
                <h3 className="font-display text-heading leading-snug text-ink">{horse.name}</h3>
                {rules ? (
                  <p className="text-body text-ink">{rules}</p>
                ) : (
                  <p className="text-caption text-muted">No temperature rules set.</p>
                )}
                {fly && (
                  <ChipRow>
                    <Chip value={fly} />
                  </ChipRow>
                )}
                {plan?.notes && <p className="text-caption text-muted">{plan.notes}</p>}
                {isBarn && (
                  <SheetTrigger label="Edit" title={`${horse.name} — blanket and fly`}>
                    <BlanketPlanForm horseId={horse.id} plan={plan} />
                  </SheetTrigger>
                )}
                {canDelete && plan && (
                  <ConfirmDelete table="blanket_plans" id={plan.id} name={`${horse.name}'s blanket plan`} />
                )}
              </Card>
            );
          })
        )}
      </section>

      {isBarn && missing.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="No plan yet" count={`${missing.length}`} />
          {missing.map(({ horse }) => (
            <Card key={horse.id} className="flex flex-col gap-2 p-4">
              <h3 className="font-display text-heading leading-snug text-ink">{horse.name}</h3>
              <p className="text-caption text-muted">No plan yet.</p>
              <SheetTrigger
                label="Add plan"
                title={`${horse.name} — blanket and fly`}
                variant="primary"
              >
                <BlanketPlanForm horseId={horse.id} plan={null} />
              </SheetTrigger>
            </Card>
          ))}
        </section>
      )}
    </TabPage>
  );
}
