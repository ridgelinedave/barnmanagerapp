import { horseInitials, horseSubtitle } from "@/lib/horse-display";
import { MEAL_LABELS, type FeedPlan, type Horse, type Meal } from "@/lib/types";

/**
 * One horse's feed chart — the screen someone actually reads while feeding.
 *
 * Built to design/mockups/feedboard.html (detail). Three decisions worth
 * keeping:
 *
 *   A DARK BANNER carrying the photo, so the horse you are about to feed is
 *     unmistakable before you read a word. The photo slot is the banner itself.
 *   LABELLED ROWS, not prose. Hay / Grain / Supplements is the order a scoop
 *     gets filled in, and a right-aligned value column means you can scan the
 *     amounts without reading the labels twice.
 *   THE NOTE LAST AND ITALIC. "Soak grain 10 min" is the line that causes harm
 *     when it is missed, so it sits under the meal it belongs to rather than
 *     being hoisted into a coloured box at the top where it detaches from
 *     which feed it applies to.
 */
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
      <span className="shrink-0 text-caption text-muted">{k}</span>
      <span className="min-w-0 break-words text-right text-caption font-medium text-ink">{v}</span>
    </div>
  );
}

function Meal({ plan }: { plan: FeedPlan }) {
  return (
    <section className="pt-4">
      <div className="mb-2 flex items-center gap-2.5">
        <h2 className="font-display text-[0.9375rem] font-semibold uppercase tracking-[0.14em] text-ink">
          {MEAL_LABELS[plan.meal]}
        </h2>
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
      </div>

      {/* `description` is the hay-and-grain line as it is stored today; the
          chart splits out what it can and shows the rest as given. */}
      <Row k="Feed" v={plan.description} />
      {plan.supplements && <Row k="Supplements" v={plan.supplements} />}

      {plan.special_instructions && (
        <p className="mt-3 text-caption italic leading-relaxed text-muted">
          {plan.special_instructions}
        </p>
      )}
    </section>
  );
}

export function FeedChart({
  horse,
  plans,
  ownerName,
}: {
  horse: Horse;
  plans: FeedPlan[];
  ownerName: string | null;
}) {
  const subtitle = [horseSubtitle(horse), ownerName ? `Owner: ${ownerName}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {/* --- banner: the horse, unmistakably ----------------------------- */}
      <div className="-mx-4 -mt-5 bg-chrome px-5 pb-5 text-white">
        <div className="-mx-5 mb-4 h-32 overflow-hidden bg-black">
          {horse.photo_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={horse.photo_url} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-end p-4">
              <span
                aria-hidden="true"
                className="font-display text-[2.5rem] font-bold leading-none tracking-[0.04em] text-white/15"
              >
                {horseInitials(horse)}
              </span>
            </div>
          )}
        </div>

        <h1 className="font-display text-[1.875rem] font-bold uppercase leading-none tracking-[0.03em]">
          {horse.barn_name || horse.name}
        </h1>
        {subtitle && <p className="mt-1.5 text-caption text-white/70">{subtitle}</p>}
      </div>

      {plans.length === 0 ? (
        <p className="pt-6 text-caption text-muted">
          No feed chart set for {horse.barn_name || horse.name} yet.
        </p>
      ) : (
        plans.map((plan) => <Meal key={plan.id} plan={plan} />)
      )}
    </>
  );
}
