import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { LessonsSegments } from "@/components/LessonsSegments";
import { ParentLessonCard } from "@/components/ParentLessonCard";
import { BackfillOfferCard } from "@/components/BackfillOfferCard";
import { EmptyState, SectionHeader } from "@/components/ui/primitives";
import { requireTab } from "@/lib/guard";
import {
  listUpcomingInstances,
  listLessonRidersForInstances,
  listOffers,
  listVisibleRiders,
} from "@/lib/lessons";
import { listAssignableProfiles, nameMap } from "@/lib/tasks";
import { addBarnDays, barnToday, isInsideBackfillCutoff } from "@/lib/dates";
import { barn, featureEnabled } from "@/config/barn";

/**
 * A family's lessons — the first Lessons segment for a parent, at /lessons.
 *
 * Makeup offers lead it when there are any. They used to have a screen of
 * their own, which made a family's Lessons tab a four-item menu; an offer is
 * about a lesson, so it sits above the lessons. It is still pushed to Home,
 * which is what makes the time-sensitive part safe.
 */
export async function MyLessonsView() {
  const role = await requireTab("/lessons");
  const tabs = <LessonsSegments role={role} current="/lessons" />;

  if (!featureEnabled("lessons")) {
    return (
      <TabPage title="Lessons" tabs={tabs}>
        <StubScreen heading="Upcoming lessons" phase="Phase 1" />
      </TabPage>
    );
  }

  const from = barnToday();
  const through = addBarnDays(from, 28);

  // RLS returns only instances one of this family's riders is in.
  const instances = await listUpcomingInstances(from, through);
  const [bookings, riders, people, offers] = await Promise.all([
    listLessonRidersForInstances(instances.map((i) => i.id)),
    listVisibleRiders(),
    listAssignableProfiles(),
    // Outstanding offers, plus recently answered ones so the outcome stays on
    // screen instead of the card vanishing; see listOffers().
    listOffers({ outstandingOnly: true, recentlyAnsweredMinutes: 10 }),
  ]);

  const riderNames = new Map(riders.map((r) => [r.id, r.name]));
  const instructorNames = nameMap(people);
  const instanceById = new Map(instances.map((i) => [i.id, i]));

  const offerCards = offers.map((offer) => {
    const instance = instanceById.get(offer.instance_id) ?? null;
    // A cancelled lesson is not worth offering; a resolved offer keeps its
    // card even when the lesson is no longer readable.
    return { offer, instance: instance && instance.status === "scheduled" ? instance : null };
  });

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
    <TabPage title="Lessons" tabs={tabs}>
      {offerCards.length > 0 && (
        <>
          <SectionHeader title="Makeups" count={`${offerCards.length}`} />
          {offerCards.map(({ offer, instance }) => (
            <BackfillOfferCard
              key={offer.id}
              offerId={offer.id}
              status={offer.status}
              instance={instance}
              riderName={riderNames.get(offer.rider_id) ?? "Your rider"}
              instructorName={
                instance?.instructor_id ? instructorNames.get(instance.instructor_id) : undefined
              }
            />
          ))}
        </>
      )}

      <SectionHeader
        title="Next 4 weeks"
        count={upcoming.length > 0 ? `${upcoming.length} booked` : undefined}
      />

      {upcoming.length === 0 ? (
        <EmptyState title="No lessons booked" />
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
