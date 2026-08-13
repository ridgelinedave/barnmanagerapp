import { redirect } from "next/navigation";

/**
 * /calendar is now /schedule.
 *
 * The barn calendar and the lesson schedule were two screens over the same
 * hours, reachable from two different places, and neither could tell you it
 * was the complete picture. The Schedule tab is the one time surface now, with
 * Day, Month and Agenda views (see app/(app)/schedule/page.tsx).
 *
 * This route stays as a redirect rather than being deleted: it has been in the
 * Manage index and the More list for months, so it is in browser histories, in
 * home-screen shortcuts, and quite possibly in a text message from Belle.
 * Landing on the month view is exactly what those links meant.
 *
 * No guard needed — the (app) layout has already established there is a signed
 * in viewer with a profile, and /schedule does its own role check.
 */
export default function CalendarPage() {
  redirect("/schedule?view=month");
}
