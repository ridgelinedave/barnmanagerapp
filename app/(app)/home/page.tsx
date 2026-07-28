import Link from "next/link";
import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { InstallPrompt } from "@/components/InstallPrompt";
import { AnnouncementCard } from "@/components/AnnouncementCard";
import { BackfillOfferCard } from "@/components/BackfillOfferCard";
import { currentRole } from "@/lib/guard";
import { listAnnouncements } from "@/lib/announcements";
import { listOffers, listUpcomingInstances, listVisibleRiders } from "@/lib/lessons";
import { addBarnDays, barnToday } from "@/lib/dates";
import { barn, featureEnabled } from "@/config/barn";

export const metadata = { title: "Home" };

/** Home is the one tab all three roles share, with different content per role. */
const HOME_BY_ROLE = {
  parent: {
    heading: "Your barn at a glance",
    phase: "Phase 1",
    detail:
      "Your onboarding checklist, balance due, your next lesson, and open show polls land here.",
  },
  staff: {
    heading: "Today at the barn",
    phase: "Phase 1",
    detail: "Your shift, open task count, and your clock status land here.",
  },
  admin: {
    heading: "Barn dashboard",
    phase: "Phase 1",
    detail:
      "Who's clocked in, today's lessons, unassigned tasks, cancellations needing backfill, due-soon care, and onboarding stragglers land here.",
  },
} as const;

export default async function HomePage() {
  const role = await currentRole();
  const content = HOME_BY_ROLE[role];

  // The query is unfiltered on audience by design — RLS scopes it. See
  // lib/announcements.ts.
  const announcements = featureEnabled("announcements") ? await listAnnouncements(10) : [];

  // An offered seat is time-sensitive and someone else may be about to take it,
  // so it sits above everything else on Home. RLS scopes offers to this
  // family's riders, so this is empty for staff and admin.
  const offers =
    featureEnabled("lessons") && role === "parent"
      ? await listOffers({ outstandingOnly: true, recentlyAnsweredMinutes: 10 })
      : [];
  const offerInstances = offers.length
    ? await listUpcomingInstances(barnToday(), addBarnDays(barnToday(), 28))
    : [];
  const offerRiders = offers.length ? await listVisibleRiders() : [];
  const offerRiderNames = new Map(offerRiders.map((r) => [r.id, r.name]));
  const offerInstanceById = new Map(offerInstances.map((i) => [i.id, i]));

  const offerCards = offers.map((offer) => {
    const instance = offerInstanceById.get(offer.instance_id) ?? null;
    return {
      offer,
      instance: instance && instance.status === "scheduled" ? instance : null,
    };
  });

  return (
    <TabPage title="Home">
      <p className="text-sm text-brand-ink/70">
        Signed in to {barn.name} as <span className="font-semibold capitalize">{role}</span>.
      </p>

      {offerCards.map(({ offer, instance }) => (
        <BackfillOfferCard
          key={offer.id}
          offerId={offer.id}
          status={offer.status}
          instance={instance}
          riderName={offerRiderNames.get(offer.rider_id) ?? "Your rider"}
        />
      ))}

      <InstallPrompt />

      {featureEnabled("announcements") && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold">Announcements</h2>
            {role === "admin" && (
              <Link
                href="/manage/announcements"
                className="ml-auto text-sm font-semibold text-brand-gold-deep underline"
              >
                Manage
              </Link>
            )}
          </div>

          {announcements.length === 0 ? (
            <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
              {role === "admin"
                ? "No announcements yet. Post the first one from Manage."
                : "Nothing from the barn right now."}
            </p>
          ) : (
            announcements.map((announcement) => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                showAudience={role !== "parent"}
              />
            ))
          )}
        </section>
      )}

      <StubScreen heading={content.heading} phase={content.phase}>
        <p className="text-sm text-brand-ink/70">{content.detail}</p>
      </StubScreen>
    </TabPage>
  );
}
