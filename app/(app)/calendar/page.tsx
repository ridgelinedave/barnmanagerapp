import { Suspense } from "react";
import { cookies } from "next/headers";
import { TabPage } from "@/components/TabPage";
import { Calendar } from "@/components/Calendar";
import { SkeletonSection } from "@/components/ui/Skeleton";
import { requireTab } from "@/lib/guard";
import { barnToday } from "@/lib/dates";
import { calendarWindow, loadCalendar } from "@/lib/calendar";

export const metadata = { title: "Calendar" };

/**
 * The barn calendar — lessons, events and care due, in one place.
 *
 * Reachable by every signed-in role (lib/nav.ts SHARED_PATHS) and scoped
 * entirely by RLS: a parent sees their family's lessons, the events marked
 * visible to everyone, and care due on horses they own; staff and admin see
 * the barn's whole month. Nothing on this screen filters by role, deliberately.
 *
 * No new SQL. Three existing reads and a group-by.
 */
async function CalendarBody({ initialView }: { initialView: "month" | "list" }) {
  const today = barnToday();
  const { from, through } = calendarWindow(today);
  const items = await loadCalendar(today);

  return (
    <Calendar
      items={items}
      today={today}
      initialView={initialView}
      windowFrom={from}
      windowThrough={through}
    />
  );
}

export default async function CalendarPage() {
  await requireTab("/calendar");

  // Read on the SERVER so the remembered view renders first time. Doing this
  // from localStorage in the client would paint the month grid and then swap
  // to the agenda — a flash on every open for anyone who prefers the list.
  const store = await cookies();
  const initialView = store.get("calendar_view")?.value === "list" ? "list" : "month";

  return (
    <TabPage title="Calendar">
      <Suspense fallback={<SkeletonSection rows={4} label="Loading the calendar" />}>
        <CalendarBody initialView={initialView} />
      </Suspense>
    </TabPage>
  );
}
