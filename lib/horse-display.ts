import type { FeedPlan, Horse, Meal } from "@/lib/types";

/**
 * How a horse is described on a list row: "Bay gelding · 16.2h".
 *
 * ⚠ THIS IS A STOPGAP AND IT SHOWS. `horses` has no colour, sex or height
 * column, so the descriptive half is whatever is in `breed` and the height is
 * parsed out of the FRONT of `notes`. Parsing a free-text field for a
 * structured value is exactly the kind of thing that works until someone
 * writes a note that starts with a number.
 *
 * Migration 0019 is written and PRINTED FOR AUDIT, NOT APPLIED — it adds
 * `colour`, `sex` and `height_hands` as real columns. When it lands, this
 * function reads them and the parsing goes away. Until then the feed board
 * renders the mockup's sub-line without the schema pretending it is structured.
 */
const HEIGHT_AT_START = /^(\d{1,2}(?:\.\d)?)\s*h\b/i;

export function horseSubtitle(horse: Horse): string | null {
  const parts: string[] = [];

  if (horse.breed) parts.push(horse.breed);

  const height = HEIGHT_AT_START.exec((horse.notes ?? "").trim());
  if (height) parts.push(`${height[1]}h`);

  return parts.length > 0 ? parts.join(" · ") : null;
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
