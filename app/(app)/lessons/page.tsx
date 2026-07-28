import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { ParentLessonCard } from "@/components/ParentLessonCard";
import { BackfillOfferCard } from "@/components/BackfillOfferCard";
import { requireTab } from "@/lib/guard";
import {
  listUpcomingInstances,
  listLessonRidersForInstances,
  listVisibleRiders,
  listOffers,
} from "@/lib/lessons";
import { listAssignableProfiles, nameMap } from "@/lib/tasks";
import { addBarnDays, barnToday, isInsideBackfillCutoff } from "@/lib/dates";
import { barn, featureEnabled } from "@/config/barn";

export const metadata = { title: "Lessons" };

export default async function LessonsPage() {
  await requireTab("/lessons");

  if (!featureEnabled("lessons")) {
    return (
      <TabPage title="Lessons">
        <StubScreen heading="Upcoming lessons" phase="Phase 1">
          <p className="text-sm text-brand-ink/70">
            Your riders&apos; lessons, cancellation, the barn calendar, and the iCal subscribe
            button land here.
          </p>
        </StubScreen>
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

  // Outstanding offers first — they are time-sensitive and someone else may be
  // about to take the seat. Recently-answered ones ride along so the outcome
  // stays on screen instead of the card vanishing; see listOffers().
  const offers = await listOffers({ outstandingOnly: true, recentlyAnsweredMinutes: 10 });
  const offerCards = offers.map((offer) => {
    const instance = instanceById.get(offer.instance_id) ?? null;
    return {
      offer,
      // A cancelled lesson is not worth offering; a resolved offer keeps its
      // card even when the lesson is no longer readable.
      instance: instance && instance.status === "scheduled" ? instance : null,
    };
  });

  return (
    <TabPage title="Lessons">
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

      <h2 className="text-base font-semibold">Next 4 weeks</h2>

      {upcoming.length === 0 ? (
        <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
          No lessons booked right now.
        </p>
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
          <h2 className="mt-2 text-sm font-semibold text-brand-ink/60">Cancelled</h2>
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
