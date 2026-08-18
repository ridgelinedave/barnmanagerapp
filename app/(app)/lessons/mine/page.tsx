import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { ParentLessonCard } from "@/components/ParentLessonCard";
import { EmptyState, SectionHeader } from "@/components/ui/primitives";
import { requireTab } from "@/lib/guard";
import {
  listUpcomingInstances,
  listLessonRidersForInstances,
  listVisibleRiders,
} from "@/lib/lessons";
import { listAssignableProfiles, nameMap } from "@/lib/tasks";
import { addBarnDays, barnToday, isInsideBackfillCutoff } from "@/lib/dates";
import { barn, featureEnabled } from "@/config/barn";

export const metadata = { title: "My lessons" };

export default async function MyLessonsPage() {
  await requireTab("/lessons");

  if (!featureEnabled("lessons")) {
    return (
      <TabPage title="My lessons" back="/lessons">
        <StubScreen
          heading="Upcoming lessons"
          phase="Phase 1"
          detail="Your riders' lessons, cancelling a spot, and the barn calendar."
        />
      </TabPage>
    );
  }

  const from = barnToday();
  const through = addBarnDays(from, 28);

  // RLS returns only instances one of this family's riders is in.
  const instances = await listUpcomingInstances(from, through);
  const bookings = await listLessonRidersForInstances(instances.map((i) => i.id));
  const [riders, people] = await Promise.all([listVisibleRiders(), listAssignableProfiles()]);

  const riderNames = new Map(riders.map((r) => [r.id, r.name]));
  const instructorNames = nameMap(people);
  const instanceById = new Map(instances.map((i) => [i.id, i]));

  // One card per booking, ordered by when the lesson actually happens.
  const cards = bookings
    .map((booking) => ({ booking, instance: instanceById.get(booking.instance_id) }))
    .filter((entry): entry is { booking: (typeof bookings)[number]; instance: NonNullable<typeof entry.instance> } =>
      Boolean(entry.instance),
    )
    .sort((a, b) =>
      a.instance.date === b.instance.date
        ? a.instance.start_time.localeCompare(b.instance.start_time)
        : a.instance.date.localeCompare(b.instance.date),
    );

  const upcoming = cards.filter(({ booking }) => booking.status !== "cancelled");
  const cancelled = cards.filter(({ booking }) => booking.status === "cancelled");


  return (
    <TabPage title="My lessons" back="/lessons">
      <SectionHeader
        title="Next 4 weeks"
        count={upcoming.length > 0 ? `${upcoming.length} booked` : undefined}
      />

      {upcoming.length === 0 ? (
        <EmptyState
          title="Nothing booked right now"
          body="Booked lessons appear here."
        />
      ) : (
        upcoming.map(({ booking, instance }) => (
          <ParentLessonCard
            key={booking.id}
            instance={instance}
            booking={booking}
            riderName={riderNames.get(booking.rider_id) ?? "Your rider"}
            instructorName={
              instance.instructor_id ? instructorNames.get(instance.instructor_id) : undefined
            }
            insideCutoff={isInsideBackfillCutoff(instance.date, instance.start_time)}
            cutoffHours={barn.backfillCutoffMinutes / 60}
          />
        ))
      )}

      {cancelled.length > 0 && (
        <>
          <SectionHeader title="Cancelled" count={`${cancelled.length}`} />
          {cancelled.map(({ booking, instance }) => (
            <ParentLessonCard
              key={booking.id}
              instance={instance}
              booking={booking}
              riderName={riderNames.get(booking.rider_id) ?? "Your rider"}
              insideCutoff={false}
              cutoffHours={barn.backfillCutoffMinutes / 60}
            />
          ))}
        </>
      )}
    </TabPage>
  );
}
