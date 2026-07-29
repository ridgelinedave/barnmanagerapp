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
    <li className="rounded-2xl border border-brand-ink/15 bg-white p-4">
      <div className="flex items-baseline gap-2">
        <h3 className="min-w-0 flex-1 text-base font-semibold leading-snug">{horse.name}</h3>
        {horse.barn_name && horse.barn_name !== horse.name && (
          <span className="shrink-0 text-sm text-brand-ink/60">&ldquo;{horse.barn_name}&rdquo;</span>
        )}
      </div>

      <p className="mt-1 text-sm text-brand-ink/85">{plan.description}</p>

      {plan.supplements && (
        <p className="mt-1 text-sm text-brand-ink/70">
          <span className="font-medium">Supplements:</span> {plan.supplements}
        </p>
      )}

      {plan.special_instructions && (
        <p className="mt-2 rounded-xl bg-brand-gold/25 p-3 text-sm font-medium text-brand-ink">
          {plan.special_instructions}
        </p>
      )}
    </li>
  );
}

export function FeedBoard({ board }: { board: Record<Meal, FeedBoardEntry[]> }) {
  const total = MEALS.reduce((sum, meal) => sum + board[meal].length, 0);

  if (total === 0) {
    return (
      <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
        No feed plans yet. The barn sets these up on each horse.
      </p>
    );
  }

  return (
    <>
      {MEALS.map((meal) => (
        <section key={meal} className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-semibold">{MEAL_LABELS[meal]}</h2>
            <p className="text-sm text-brand-ink/60">
              {board[meal].length === 0
                ? "Nothing scheduled"
                : `${board[meal].length} horse${board[meal].length === 1 ? "" : "s"}`}
            </p>
          </div>

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
