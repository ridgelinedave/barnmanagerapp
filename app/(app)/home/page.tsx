import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { InstallPrompt } from "@/components/InstallPrompt";
import { AnnouncementCard } from "@/components/AnnouncementCard";
import { BackfillOfferCard } from "@/components/BackfillOfferCard";
import { Board, Chip, ChipRow, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { currentRole } from "@/lib/guard";
import { getViewer } from "@/lib/session";
import { listAnnouncements } from "@/lib/announcements";
import { listOffers, listUpcomingInstances, listVisibleRiders } from "@/lib/lessons";
import { addBarnDays, barnToday, formatBarnDayLabel, formatTime } from "@/lib/dates";
import { barn, featureEnabled } from "@/config/barn";

export const metadata = { title: "Home" };

/** Still stubbed for staff and admin — those dashboards are their own pass. */
const HOME_BY_ROLE = {
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

/**
 * Barn-time greeting. Small thing; it is also the first line anyone reads.
 *
 * The barn's clock, not the phone's — a parent checking in from a show three
 * states away should still be greeted by the morning the barn is having.
 */
function greeting(): { text: string; emoji: string } {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: barn.timezone,
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 12) return { text: "Good morning", emoji: "🌅" };
  if (hour < 17) return { text: "Good afternoon", emoji: "☀️" };
  return { text: "Good evening", emoji: "🌙" };
}

export default async function HomePage() {
  const role = await currentRole();
  const viewer = await getViewer();
  const firstName =
    viewer.status === "viewer" ? (viewer.viewer.profile?.full_name ?? "").split(" ")[0] : "";

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
  const { text: hello, emoji } = greeting();

  return (
    <TabPage title="Home">
      {role === "parent" ? (
        <>
          <h2 className="font-display text-title text-ink">
            <span aria-hidden="true" className="mr-1.5">
              {emoji}
            </span>
            {firstName ? `${hello}, ${firstName}` : hello}
          </h2>

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
            <Board label="Next in the diary" emoji="🐴" action={{ href: "/lessons", label: "All lessons" }}>
              {nextLesson ? (
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-12 shrink-0 flex-col items-center justify-center rounded-control bg-gold-soft leading-none"
                  >
                    <span className="font-display text-eyebrow uppercase text-gold-deep">
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
                <EmptyState
                  title="Nothing booked just yet"
                  body="When Belle puts your rider in a lesson it will show up here, and you can cancel from the Lessons tab if plans change."
                />
              )}
            </Board>
          )}

          {featureEnabled("announcements") && (
            <section className="flex flex-col gap-3">
              <SectionHeader title="From the barn" />
              {announcements.length === 0 ? (
                <EmptyState
                  title="All quiet"
                  body="Belle posts news here — schedule changes, weather calls, show reminders. Nothing at the moment."
                  emoji="📋"
                />
              ) : (
                announcements.map((announcement) => (
                  <AnnouncementCard key={announcement.id} announcement={announcement} />
                ))
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
                title="From the barn"
                action={role === "admin" ? { href: "/manage/announcements", label: "Manage" } : undefined}
              />
              {announcements.length === 0 ? (
                <EmptyState
                  title="Nothing posted yet"
                  body={
                    role === "admin"
                      ? "Post the first one from Manage — families see it the moment you do."
                      : "Nothing from the barn right now."
                  }
                />
              ) : (
                announcements.map((announcement) => (
                  <AnnouncementCard
                    key={announcement.id}
                    announcement={announcement}
                    showAudience
                  />
                ))
              )}
            </section>
          )}

          <InstallPrompt />

          <StubScreen
            heading={HOME_BY_ROLE[role].heading}
            phase={HOME_BY_ROLE[role].phase}
            detail={HOME_BY_ROLE[role].detail}
          />
        </>
      )}
    </TabPage>
  );
}
