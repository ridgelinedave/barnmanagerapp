import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { BackfillOfferCard } from "@/components/BackfillOfferCard";
import { EmptyState } from "@/components/ui/primitives";
import { requireTab } from "@/lib/guard";
import {
  listUpcomingInstances,
  listVisibleRiders,
  listOffers,
} from "@/lib/lessons";
import { listAssignableProfiles, nameMap } from "@/lib/tasks";
import { addBarnDays, barnToday } from "@/lib/dates";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Makeups" };

/**
 * Makeups — the backfill offers, on a screen of their own.
 *
 * These used to sit above the lesson list on the Lessons tab, which was right
 * when Lessons was one screen: an offer expires, so it belonged in front of
 * whatever you opened. Lessons is a section now, so they get a named home
 * rather than being stacked on top of an unrelated list.
 *
 * They are still surfaced on Home, which is what makes this safe — nobody has
 * to remember to come here for a time-sensitive thing.
 */
export default async function MakeupsPage() {
  await requireTab("/lessons");

  if (!featureEnabled("lessons")) {
    return (
      <TabPage title="Makeups" back="/lessons">
        <StubScreen
          heading="Makeups"
          phase="Phase 1"
          detail="When a spot opens up in a lesson, the offer appears here."
        />
      </TabPage>
    );
  }

  const from = barnToday();
  const through = addBarnDays(from, 28);

  // Outstanding offers first — they are time-sensitive and someone else may be
  // about to take the seat. Recently-answered ones ride along so the outcome
  // stays on screen instead of the card vanishing; see listOffers().
  const [instances, riders, people, offers] = await Promise.all([
    listUpcomingInstances(from, through),
    listVisibleRiders(),
    listAssignableProfiles(),
    listOffers({ outstandingOnly: true, recentlyAnsweredMinutes: 10 }),
  ]);

  const instanceById = new Map(instances.map((i) => [i.id, i]));
  const riderNames = new Map(riders.map((r) => [r.id, r.name]));
  const instructorNames = nameMap(people);

  const offerCards = offers.map((offer) => {
    const instance = instanceById.get(offer.instance_id) ?? null;
    return {
      offer,
      // A cancelled lesson is not worth offering; a resolved offer keeps its
      // card even when the lesson is no longer readable.
      instance: instance && instance.status === "scheduled" ? instance : null,
    };
  });

  if (offerCards.length === 0) {
    return (
      <TabPage title="Makeups" back="/lessons">
        <EmptyState
          title="No makeups open"
          body="When someone cancels and a spot opens up, the offer appears here and on your home screen."
        />
      </TabPage>
    );
  }

  return (
    <TabPage title="Makeups" back="/lessons">
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
    </TabPage>
  );
}
