import { HORSE_SEX_LABELS, type FeedPlan, type Horse, type Meal } from "@/lib/types";

/**
 * How a horse is described on a list row: "Bay gelding · 16.2h".
 *
 * Reads the real columns from migration 0019. This used to compose the same
 * string from `breed` plus a regex that mined the height out of the FRONT of
 * `notes` — which worked, and would have broken the first time someone wrote a
 * note starting with a number. Those columns exist now, so the parsing is gone.
 *
 * `breed` is still shown, but LAST and only when there is room in the sentence:
 * colour and sex identify the animal in front of you, breed is provenance.
 */
export function horseSubtitle(horse: Horse): string | null {
  // "Bay gelding" reads as one phrase, so colour and sex join without a dot.
  const build = [horse.colour, horse.sex ? HORSE_SEX_LABELS[horse.sex].toLowerCase() : null]
    .filter(Boolean)
    .join(" ");

  const parts = [
    build || null,
    horse.height_hands === null ? null : `${formatHands(horse.height_hands)}h`,
    horse.breed,
  ].filter(Boolean) as string[];

  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * 16.2 → "16.2", 16 → "16".
 *
 * The decimal is INCHES, not a fraction, so it is never rounded or padded:
 * "16.0h" is a horse that is exactly sixteen hands, and writing it as "16h" is
 * how a person would say it. Number formatting would happily render 16.2 as
 * 16.20, which is not a height anyone recognises.
 */
export function formatHands(hands: number): string {
  return Number.isInteger(hands) ? String(hands) : hands.toFixed(1);
}

/**
 * The cadence chip: "AM · PM", "AM only", "3× daily".
 *
 * A preview of the shape of the horse's day, so the list answers "who eats
 * twice?" without opening anything.
 */
const MEAL_SHORT: Record<Meal, string> = { am: "AM", lunch: "Midday", pm: "PM" };

export function feedCadence(plans: Pick<FeedPlan, "meal">[]): string | null {
  const meals = [...new Set(plans.map((p) => p.meal))];
  if (meals.length === 0) return null;
  if (meals.length >= 3) return `${meals.length}× daily`;

  const ordered = (["am", "lunch", "pm"] as Meal[]).filter((m) => meals.includes(m));
  if (ordered.length === 1) return `${MEAL_SHORT[ordered[0]]} only`;
  return ordered.map((m) => MEAL_SHORT[m]).join(" · ");
}

/**
 * The two-letter monogram on the avatar when there is no photo.
 *
 * From the barn name where there is one — a horse people call "Winnie" should
 * not show "TH" because its papers say "Thunderstruck".
 */
export function horseInitials(horse: Pick<Horse, "name" | "barn_name">): string {
  const source = (horse.barn_name || horse.name || "").trim();
  return source.slice(0, 2).toUpperCase();
}
