import { Card, EmptyState, SectionHeader, Sunk } from "@/components/ui/primitives";
import type { FeedBoardEntry } from "@/lib/horses";
import { MEALS, MEAL_LABELS, type Meal } from "@/lib/types";

/**
 * The daily feed board — every active plan, grouped by meal.
 *
 * This is the screen someone reads at 6am with a phone in one hand and a feed
 * scoop in the other, so it is deliberately dumb: no filters, no tabs, no
 * expanding. Everything needed to feed the horse is on the card, and the
 * special instruction is the loudest thing on it, because that is the line that
 * causes harm when it is missed.
 */
function Entry({ entry }: { entry: FeedBoardEntry }) {
  const { plan, horse } = entry;

  return (
    <Card as="li" className="p-4">
      <div className="flex items-baseline gap-2">
        <h3 className="min-w-0 flex-1 font-display text-heading leading-snug text-ink">
          {horse.name}
        </h3>
        {horse.barn_name && horse.barn_name !== horse.name && (
          <span className="shrink-0 text-caption text-muted">&ldquo;{horse.barn_name}&rdquo;</span>
        )}
      </div>

      <p className="mt-1 text-caption text-ink">{plan.description}</p>

      {plan.supplements && (
        <p className="mt-1 text-caption text-muted">
          <span className="font-medium text-ink">Supplements:</span> {plan.supplements}
        </p>
      )}

      {/* The instruction that causes harm when it is missed is the loudest
          thing on the card. */}
      {plan.special_instructions && (
        <Sunk tone="gold" className="mt-2">
          <p className="text-caption font-medium">{plan.special_instructions}</p>
        </Sunk>
      )}
    </Card>
  );
}

export function FeedBoard({ board }: { board: Record<Meal, FeedBoardEntry[]> }) {
  const total = MEALS.reduce((sum, meal) => sum + board[meal].length, 0);

  if (total === 0) {
    return (
      <EmptyState
        title="No feed charts yet"
        body="Set a morning and evening feed on each horse and this board builds itself — who eats what, in the order you walk the aisle."
        emoji="🪣"
      />
    );
  }

  return (
    <>
      {MEALS.map((meal) => (
        <section key={meal} className="flex flex-col gap-3">
          <SectionHeader
            title={MEAL_LABELS[meal]}
            count={
              board[meal].length === 0
                ? "Nothing scheduled"
                : `${board[meal].length} horse${board[meal].length === 1 ? "" : "s"}`
            }
          />

          {board[meal].length > 0 && (
            <ul className="flex flex-col gap-3">
              {board[meal].map((entry) => (
                <Entry key={entry.plan.id} entry={entry} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
