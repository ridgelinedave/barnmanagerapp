import type { IconName } from "@/components/ui/Icon";
import type { CalendarKind } from "@/lib/calendar";

/**
 * How each kind of calendar item is marked — shared by the month/agenda
 * calendar and the desk's week view so the two always agree.
 *
 * ONE ACCENT, AND IT MEANS ONE THING: oxblood marks today and the active view
 * ("where am I"), never a category. Kinds are told apart by a small outlined
 * label in a restrained tone; care due is the one that warns.
 */
export const KIND_ICON: Record<CalendarKind, IconName> = {
  lesson: "calendar",
  event: "pin",
  care: "alert",
};

export const KIND_TONE: Record<CalendarKind, string> = {
  lesson: "border-muted/60 text-muted",
  event: "border-ink/40 text-ink",
  care: "border-danger/70 text-danger",
};

/** The same tones as text only — the week view's small kind line. */
export const KIND_TEXT: Record<CalendarKind, string> = {
  lesson: "text-muted",
  event: "text-ink",
  care: "text-danger",
};
