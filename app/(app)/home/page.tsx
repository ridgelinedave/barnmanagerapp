import { TabPage } from "@/components/TabPage";
import { announcementImageUrls } from "@/lib/media";
import { InstallPrompt } from "@/components/InstallPrompt";
import { AnnouncementFeed } from "@/components/AnnouncementFeed";
import { BackfillOfferCard } from "@/components/BackfillOfferCard";
import { TimeClock } from "@/components/TimeClock";
import { CalendarItemRow } from "@/components/Calendar";
import { DueSoon, FeedNow, OpenMaintenance } from "@/components/barn/DaySummary";
import { roleCanAccess } from "@/lib/nav";
import { Board, Chip, ChipRow, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { currentRole } from "@/lib/guard";
import { listAnnouncements } from "@/lib/announcements";
import { listOffers, listUpcomingInstances, listVisibleRiders } from "@/lib/lessons";
import { loadCalendarForRange } from "@/lib/calendar";
import { addBarnDays, barnToday, formatBarnDayLabel, formatTime } from "@/lib/dates";
import { featureEnabled } from "@/config/barn";
import type { Role } from "@/lib/types";

export const metadata = { title: "Home" };

/**
 * Home.
 *
 * ADMIN AND STAFF: the day at a glance — Today (lessons, events and care due,
 * the same items Schedule shows), the feed board now, care due this week,
 * open maintenance, and the barn's announcements. On the desk it is a real
 * dashboard: the day's blocks in two columns, announcements down the right.
 * On a phone the same blocks stack, staff's time clock first.
 *
 * CLIENTS: an offered seat first (time-sensitive), their next lesson, then
 * barn news — side by side on the desk.
 *
 * The day blocks are the Barn landing's own (components/barn/DaySummary), so
 * Home and Barn never disagree; each shows only for a role whose gate admits
 * the screen it summarises.
 */
async function Today({ role }: { role: Role }) {
  const today = barnToday();
  const items = (await loadCalendarForRange(today, today)).filter((i) => i.date === today);
  return (
    <section className="flex flex-col gap-2 lg:col-span-2">
      <SectionHeader
        title="Today"
        count={items.length ? `${items.length}` : undefined}
        action={roleCanAccess(role, "/schedule") ? { href: "/schedule", label: "Schedule" } : undefined}
      />
      {items.length === 0 ? (
        <EmptyState title="Nothing on today." />
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <CalendarItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

async function Announcements({ role }: { role: Role }) {
  const announcements = await listAnnouncements(10);
  const images = await announcementImageUrls(announcements);
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title="Announcements"
        action={role === "admin" ? { href: "/manage/announcements", label: "Manage" } : undefined}
      />
      {announcements.length === 0 ? (
        <EmptyState title={role === "parent" ? "No barn news" : "No announcements yet"} />
      ) : (
        <AnnouncementFeed announcements={announcements} showAudience={role !== "parent"} images={images} />
      )}
    </section>
  );
}

export default async function HomePage() {
  const role = await currentRole();
  const news = featureEnabled("announcements");

  if (role !== "parent") {
    const showToday = featureEnabled("lessons") && roleCanAccess(role, "/schedule");
    const showFeed = featureEnabled("tasks") && featureEnabled("horses") && roleCanAccess(role, "/tasks/feed");
    const showCare = featureEnabled("care");
    const showMaintenance = roleCanAccess(role, "/barn/maintenance");

    return (
      <TabPage title="Home" layout="wide" density="normal">
        {/* Staff: the time clock is the top card — one tap from launch. The
            same TimeClock as My timesheet and /clock. */}
        {featureEnabled("clockIn") && roleCanAccess(role, "/clock") && (
          <div className="lg:max-w-xl">
            <TimeClock />
          </div>
        )}

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
            {showToday && <Today role={role} />}
            {showFeed && <FeedNow />}
            {showCare && <DueSoon role={role} />}
            {showMaintenance && <OpenMaintenance />}
          </div>
          {news && <Announcements role={role} />}
        </div>

        <InstallPrompt />
      </TabPage>
    );
  }

  // --- a client -----------------------------------------------------------------
  // An offered seat is time-sensitive and someone else may be about to take it,
  // so it sits above everything else. RLS scopes offers to this family's riders.
  const lessonsOn = featureEnabled("lessons");
  const [offers, instances, riders] = await Promise.all([
    lessonsOn ? listOffers({ outstandingOnly: true, recentlyAnsweredMinutes: 10 }) : Promise.resolve([]),
    lessonsOn ? listUpcomingInstances(barnToday(), addBarnDays(barnToday(), 28)) : Promise.resolve([]),
    lessonsOn ? listVisibleRiders() : Promise.resolve([]),
  ]);
  const riderNames = new Map(riders.map((r) => [r.id, r.name]));
  const instanceById = new Map(instances.map((i) => [i.id, i]));
  const offerCards = offers.map((offer) => {
    const instance = instanceById.get(offer.instance_id) ?? null;
    return { offer, instance: instance && instance.status === "scheduled" ? instance : null };
  });
  // The soonest scheduled lesson. RLS already limits these to this family's.
  const nextLesson = instances.filter((i) => i.status === "scheduled")[0] ?? null;

  return (
    <TabPage title="Home" layout="wide" density="normal">
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <div className="flex flex-col gap-6">
          {offerCards.map(({ offer, instance }) => (
            <BackfillOfferCard
              key={offer.id}
              offerId={offer.id}
              status={offer.status}
              instance={instance}
              riderName={riderNames.get(offer.rider_id) ?? "Your rider"}
            />
          ))}

          {lessonsOn && (
            <Board label="Next lesson" action={{ href: "/lessons", label: "All lessons" }}>
              {nextLesson ? (
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-control border border-line bg-sunk leading-none"
                  >
                    <span className="font-condensed text-micro uppercase text-muted">
                      {formatBarnDayLabel(nextLesson.date).split(",")[0]}
                    </span>
                    <span className="font-condensed text-heading font-bold text-ink">{nextLesson.date.slice(-2)}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-condensed text-title font-semibold text-ink">{formatTime(nextLesson.start_time)}</p>
                    <p className="mt-0.5 text-caption text-muted">{formatBarnDayLabel(nextLesson.date)}</p>
                    <ChipRow>
                      <Chip value={nextLesson.type === "group" ? "Group" : "Private"} tone="neutral" />
                      <Chip value={`${nextLesson.duration_min} min`} icon="clock" tone="neutral" />
                    </ChipRow>
                  </div>
                </div>
              ) : (
                <EmptyState title="No lessons booked" />
              )}
            </Board>
          )}
        </div>

        {news && <Announcements role={role} />}
      </div>

      <InstallPrompt />
    </TabPage>
  );
}
