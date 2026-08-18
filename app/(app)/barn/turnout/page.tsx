import { TabPage } from "@/components/TabPage";
import { Card, Chip, ChipRow, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { SheetTrigger } from "@/components/ui/Sheet";
import { TurnoutPlanForm } from "@/components/BarnOpsForms";
import { currentRole } from "@/lib/guard";
import { listTurnoutBoard } from "@/lib/barn-ops";
import { TURNOUT_PATTERN_LABELS } from "@/lib/types";

export const metadata = { title: "Turnout" };

/**
 * Today's turnout board — who goes where, with whom, and when.
 *
 * Same board discipline as blanketing: a horse with no plan is still listed,
 * because the missing one is what you need to notice. A family sees only their
 * own horse, by policy rather than by a filter here.
 *
 * "Staying in" is a real plan, not an absent one, and is shown as such with a
 * gold chip. A horse on stall rest that reads as "no plan" is a horse someone
 * turns out.
 */
export default async function TurnoutPage() {
  const role = await currentRole();
  const isBarn = role === "admin" || role === "staff";
  const board = await listTurnoutBoard();

  if (board.length === 0) {
    return (
      <TabPage title="Turnout" back="/barn">
        <EmptyState
          title="No horses yet"
          body="Turnout plans appear here once there are horses on the yard."
        />
      </TabPage>
    );
  }

  const planned = board.filter((row) => row.plan);
  const missing = board.filter((row) => !row.plan);

  return (
    <TabPage title="Turnout" back="/barn">
      <section className="flex flex-col gap-3">
        <SectionHeader title="Today" count={`${planned.length} of ${board.length}`} />

        {planned.length === 0 ? (
          <EmptyState
            title="No turnout set"
            body="Set where a horse goes out and it appears on this board."
          />
        ) : (
          planned.map(({ horse, plan }) => (
            <Card key={horse.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-baseline gap-3">
                <h3 className="min-w-0 flex-1 font-display text-heading leading-snug text-ink">
                  {horse.name}
                </h3>
                {plan && (
                  <Chip
                    value={TURNOUT_PATTERN_LABELS[plan.pattern]}
                    tone={plan.pattern === "none" ? "gold" : "neutral"}
                  />
                )}
              </div>

              <ChipRow>
                {plan?.paddock && <Chip value={plan.paddock} icon="pin" />}
                {plan?.turnout_group && <Chip value={plan.turnout_group} icon="people" />}
              </ChipRow>

              {plan?.notes && <p className="text-caption text-muted">{plan.notes}</p>}

              {isBarn && (
                <SheetTrigger label="Edit" title={`${horse.name} — turnout`}>
                  <TurnoutPlanForm horseId={horse.id} plan={plan} />
                </SheetTrigger>
              )}
            </Card>
          ))
        )}
      </section>

      {isBarn && missing.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="No turnout set" count={`${missing.length}`} />
          {missing.map(({ horse }) => (
            <Card key={horse.id} className="flex flex-col gap-2 p-4">
              <h3 className="font-display text-heading leading-snug text-ink">{horse.name}</h3>
              <p className="text-caption text-muted">Nobody has said where this horse goes out.</p>
              <SheetTrigger label="Set turnout" title={`${horse.name} — turnout`} variant="primary">
                <TurnoutPlanForm horseId={horse.id} plan={null} />
              </SheetTrigger>
            </Card>
          ))}
        </section>
      )}
    </TabPage>
  );
}
