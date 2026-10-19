import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { InstallPrompt } from "@/components/InstallPrompt";
import { AnnouncementFeed } from "@/components/AnnouncementFeed";
import { BackfillOfferCard } from "@/components/BackfillOfferCard";
import { Board, Chip, ChipRow, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { currentRole } from "@/lib/guard";
import { listAnnouncements } from "@/lib/announcements";
import { listOffers, listUpcomingInstances, listVisibleRiders } from "@/lib/lessons";
import { addBarnDays, barnToday, formatBarnDayLabel, formatTime } from "@/lib/dates";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Home" };

/** Still stubbed for staff and admin — those dashboards are their own pass. */
const HOME_BY_ROLE = {
  staff: {
    heading: "Today",
    phase: "Phase 1",
  },
  admin: {
    heading: "Dashboard",
    phase: "Phase 1",
  },
} as const;

export default async function HomePage() {
  const role = await currentRole();

  // Unfiltered on audience by design — RLS scopes it. See lib/announcements.ts.
  const announcements = featureEnabled("announcements") ? await listAnnouncements(10) : [];

  // An offered seat is time-sensitive and someone else may be about to take it,
  // so it sits above everything else. RLS scopes offers to this family's riders.
  const offers =
    featureEnabled("lessons") && role === "parent"
      ? await listOffers({ outstandingOnly: true, recentlyAnsweredMinutes: 10 })
      : [];

  const lessonsOn = featureEnabled("lessons") && role === "parent";
  const instances = lessonsOn
    ? await listUpcomingInstances(barnToday(), addBarnDays(barnToday(), 28))
    : [];
  const riders = lessonsOn ? await listVisibleRiders() : [];
  const riderNames = new Map(riders.map((r) => [r.id, r.name]));
  const instanceById = new Map(instances.map((i) => [i.id, i]));

  const offerCards = offers.map((offer) => {
    const instance = instanceById.get(offer.instance_id) ?? null;
    return { offer, instance: instance && instance.status === "scheduled" ? instance : null };
  });

  // The soonest scheduled lesson. RLS already limits these to this family's.
  const nextLesson = instances.filter((i) => i.status === "scheduled")[0] ?? null;

  return (
    <TabPage title="Home">
      {role === "parent" ? (
        <>
          {offerCards.map(({ offer, instance }) => (
            <BackfillOfferCard
              key={offer.id}
              offerId={offer.id}
              status={offer.status}
              instance={instance}
              riderName={riderNames.get(offer.rider_id) ?? "Your rider"}
            />
          ))}

          {featureEnabled("lessons") && (
            <Board label="Next lesson" action={{ href: "/lessons", label: "All lessons" }}>
              {nextLesson ? (
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-control border border-line bg-sunk leading-none"
                  >
                    <span className="font-sans text-micro uppercase text-muted">
                      {formatBarnDayLabel(nextLesson.date).split(",")[0]}
                    </span>
                    <span className="font-display text-heading font-bold text-ink">
                      {nextLesson.date.slice(-2)}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-heading text-ink">
                      {formatTime(nextLesson.start_time)}
                    </p>
                    <p className="mt-0.5 text-caption text-muted">
                      {formatBarnDayLabel(nextLesson.date)}
                    </p>
                    <ChipRow>
                      <Chip
                        value={nextLesson.type === "group" ? "Group" : "Private"}
                        tone="neutral"
                      />
                      <Chip value={`${nextLesson.duration_min} min`} icon="clock" tone="neutral" />
                    </ChipRow>
                  </div>
                </div>
              ) : (
                <EmptyState title="No lessons booked" />
              )}
            </Board>
          )}

          {featureEnabled("announcements") && (
            <section className="flex flex-col gap-3">
              <SectionHeader title="Announcements" />
              {announcements.length === 0 ? (
                <EmptyState title="No barn news" />
              ) : (
                <AnnouncementFeed announcements={announcements} />
              )}
            </section>
          )}

          <InstallPrompt />
        </>
      ) : (
        <>
          {featureEnabled("announcements") && (
            <section className="flex flex-col gap-3">
              <SectionHeader
                title="Announcements"
                action={role === "admin" ? { href: "/manage/announcements", label: "Manage" } : undefined}
              />
              {announcements.length === 0 ? (
                <EmptyState title="No announcements yet" />
              ) : (
                <AnnouncementFeed announcements={announcements} showAudience />
              )}
            </section>
          )}

          <InstallPrompt />

          <StubScreen heading={HOME_BY_ROLE[role].heading} phase={HOME_BY_ROLE[role].phase} />
        </>
      )}
    </TabPage>
  );
}
