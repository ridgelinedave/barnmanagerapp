import type { CareEvent, FeedPlan, Horse, Meal } from "@/lib/types";
import { CARE_TYPE_LABELS } from "@/lib/types";

/**
 * The feed board as a whiteboard — the pure part (no I/O, no React).
 *
 * Built to design/FEED-BOARD-WHITEBOARD-PROPOSAL.md and the 2026-10-20
 * addendum: rows are horses, columns are meals, the meal happening now is
 * loud. Everything here is a plain function of the data the page already
 * loads (feedBoardByHorse + careRecentByHorse + care due today) — no new SQL.
 */
export const BOARD_MEALS: Meal[] = ["am", "lunch", "pm"];

/** Column and segment labels. Short, because they are read at arm's length. */
export const BOARD_MEAL_LABELS: Record<Meal, string> = { am: "AM", lunch: "Midday", pm: "PM" };

/**
 * Which meal is "now", by the barn's clock and the cut-offs in config/barn.ts
 * (`feedMealCutoffs`, PLACEHOLDER pending the barn owner). `hhmm` is barn-local
 * "HH:MM"; string comparison is safe because both sides are zero-padded 24h.
 */
export function currentMeal(hhmm: string, cutoffs: { amUntil: string; middayUntil: string }): Meal {
  if (hhmm < cutoffs.amUntil) return "am";
  if (hhmm < cutoffs.middayUntil) return "lunch";
  return "pm";
}

/**
 * One feed item per line. The chart stores a meal as free text ("2 scoops
 * senior, 1 flake alfalfa"), so it is split on commas, semicolons and line
 * breaks. QUANTITY FIRST is how it is entered (the form's placeholder leads
 * with the quantity); the board shows the item as written rather than
 * guessing at a reorder.
 */
export function feedItems(plan: Pick<FeedPlan, "description" | "supplements">): string[] {
  return [plan.description, plan.supplements]
    .flatMap((text) => (text ?? "").split(/[\n,;]+/))
    .map((item) => item.trim())
    .filter(Boolean);
}

export type BoardNote = {
  /** The small-caps label: "DUE TODAY", "RECENT", or a meal's instructions. */
  label: string;
  detail: string;
  /** Due today — the band the eye must not miss. */
  dueToday: boolean;
  /** Set for a meal's special instructions; care notes belong to every meal. */
  meal?: Meal;
};

export type BoardRow = {
  horseId: string;
  name: string;
  /** Shown beneath the name when the horse has a different barn name. */
  barnName: string | null;
  meals: Record<Meal, string[]>;
  notes: BoardNote[];
};

export type RecentCareEntry = { event: CareEvent; daysAgo: number };

function whenLabel(daysAgo: number): string {
  if (daysAgo <= 0) return "today";
  if (daysAgo === 1) return "yesterday";
  return `${daysAgo} days ago`;
}

/** "Thu 22 Oct" — the barn's day, weekday first, no year. */
export function boardDate(isoDate: string, timezone: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: timezone, ...o }).format(date);
  return `${part({ weekday: "short" })} ${part({ day: "numeric" })} ${part({ month: "short" })}`;
}

export function buildBoard({
  board,
  recent,
  dueToday,
  today,
  timezone,
}: {
  board: { horse: Horse; plans: FeedPlan[] }[];
  recent: Map<string, RecentCareEntry[]>;
  /** Care whose due_next is today, by horse id. */
  dueToday: Map<string, CareEvent[]>;
  today: string;
  timezone: string;
}): BoardRow[] {
  return board.map(({ horse, plans }) => {
    const meals: Record<Meal, string[]> = { am: [], lunch: [], pm: [] };
    const notes: BoardNote[] = [];

    for (const plan of plans) {
      meals[plan.meal].push(...feedItems(plan));
      if (plan.special_instructions?.trim()) {
        notes.push({
          label: `${BOARD_MEAL_LABELS[plan.meal]} note`,
          detail: plan.special_instructions.trim(),
          dueToday: false,
          meal: plan.meal,
        });
      }
    }

    const dueIds = new Set<string>();
    for (const event of dueToday.get(horse.id) ?? []) {
      dueIds.add(event.id);
      notes.unshift({
        label: "Due today",
        detail: [CARE_TYPE_LABELS[event.type], event.description].filter(Boolean).join(" · "),
        dueToday: true,
      });
    }
    for (const { event, daysAgo } of recent.get(horse.id) ?? []) {
      if (dueIds.has(event.id)) continue;
      const due = event.due_next === today;
      notes.push({
        label: due ? "Due today" : "Recent",
        detail: [
          CARE_TYPE_LABELS[event.type],
          event.description,
          whenLabel(daysAgo),
          event.due_next ? `next due ${boardDate(event.due_next, timezone)}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        dueToday: due,
      });
    }

    return {
      horseId: horse.id,
      name: horse.name,
      barnName: horse.barn_name && horse.barn_name !== horse.name ? horse.barn_name : null,
      meals,
      notes,
    };
  });
}

/** "TUE 20 OCT · 4:12 PM" on the barn's clock (config/barn.ts timezone). */
export function formatBoardClock(now: Date, timezone: string): string {
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: timezone, ...o }).format(now);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(now);
  return `${part({ weekday: "short" })} ${part({ day: "numeric" })} ${part({ month: "short" })} · ${time}`;
}


/** The barn's "HH:MM" (24h) right now — for picking the current meal. */
export function barnClockHHMM(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
}
