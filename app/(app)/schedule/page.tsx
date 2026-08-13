import Link from "next/link";
import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { LessonCard } from "@/components/LessonCard";
import { Calendar, type CalendarView } from "@/components/Calendar";
import { ScheduleAdminMenu } from "@/components/ScheduleAdminMenu";
import { BookRiderForm, OneOffLessonForm } from "@/components/ScheduleAdmin";
import { FillSlotForm } from "@/components/FillSlotForm";
import { Chip, ChipRow, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SheetTrigger } from "@/components/ui/Sheet";
import { requireTab, currentRole } from "@/lib/guard";
import {
  listInstancesForDate,
  listLessonRidersForInstances,
  listVisibleRiders,
  listOffers,
  listEligibleRiders,
  listLevels,
} from "@/lib/lessons";
import { listAssignableProfiles, nameMap } from "@/lib/tasks";
import { calendarWindow, loadCalendar } from "@/lib/calendar";
import { addBarnDays, barnToday, formatBarnDayLabel } from "@/lib/dates";
import { featureEnabled } from "@/config/barn";
import type { Role } from "@/lib/types";
import { cancelInstance, restoreInstance } from "./actions";

export const metadata = { title: "Schedule" };

/**
 * THE ONE TIME SURFACE.
 *
 * Schedule and Calendar used to be two screens over the same hours: a day
 * column here and a month grid at /calendar, reachable from Manage and from
 * More. Two answers to "what is on" is one too many — whichever you opened,
 * you wondered whether the other one knew something. They are now three views
 * of this screen, and /calendar redirects here.
 *
 * DAY IS THE DEFAULT, because the commonest question at a barn is what is
 * happening now, not what the month looks like. Month and Agenda are a tap
 * away, and only the day view carries the lesson controls.
 *
 * The view lives in the URL rather than in client state: the day view is
 * server-rendered (it needs bookings, offers and eligibility), so a client
 * toggle would have to refetch anyway, and a link is shareable and survives a
 * back button.
 */
type View = "day" | CalendarView;

const VIEWS: readonly (readonly [View, string])[] = [
  ["day", "Day"],
  ["month", "Month"],
  ["list", "Agenda"],
] as const;

function viewHref(view: View, date: string): string {
  // The day view is the default, so it needs no `view` param — and it keeps
  // whichever day you were on. Month and Agenda span the window, so a date on
  // them would be noise.
  return view === "day" ? `/schedule?date=${date}` : `/schedule?view=${view}`;
}

/** Day / Month / Agenda. Links, not buttons — the server renders each view. */
function ViewSwitch({ view, date }: { view: View; date: string }) {
  return (
    <nav aria-label="Schedule view" className="flex gap-1 rounded-control bg-sunk p-1">
      {VIEWS.map(([value, label]) => {
        const active = view === value;
        return (
          <Link
            key={value}
            href={viewHref(value, date)}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 flex-1 items-center justify-center rounded-[0.25rem] font-display text-label font-bold uppercase tracking-[0.08em] transition-colors duration-150 ${
              active ? "bg-accent text-accent-on" : "text-muted"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The month grid and the agenda, over one window of items. */
async function CalendarBody({ view }: { view: CalendarView }) {
  const today = barnToday();
  const { from, through } = calendarWindow(today);
  const items = await loadCalendar(today);

  return (
    <Calendar
      items={items}
      today={today}
      view={view}
      windowFrom={from}
      windowThrough={through}
    />
  );
}

/** The day column. Admin can act on each lesson; staff and families read it. */
async function DayBody({ date, role }: { date: string; role: Role }) {
  const isAdmin = role === "admin";

  const instances = await listInstancesForDate(date);
  const bookings = await listLessonRidersForInstances(instances.map((i) => i.id));

  // Instructor names are worth a round trip for the barn's own people; a
  // family sees their rider's lesson and has no use for the staff directory.
  const people = role === "parent" ? [] : await listAssignableProfiles();
  const [riders, levels] = await Promise.all([listVisibleRiders(), listLevels()]);

  const levelOptions = levels.map((l) => ({ id: l.id, name: l.name }));
  const instructorNames = nameMap(people);
  const riderNames = new Map(riders.map((r) => [r.id, r.name]));
  const riderOptions = riders.map((r) => ({ id: r.id, name: r.name }));
  const instructorOptions = people.map((p) => ({ id: p.id, name: p.full_name ?? "Unnamed" }));

  const bookingsByInstance = new Map<string, typeof bookings>();
  for (const booking of bookings) {
    const list = bookingsByInstance.get(booking.instance_id) ?? [];
    list.push(booking);
    bookingsByInstance.set(booking.instance_id, list);
  }

  // Offers and eligibility are admin-only surfaces, and eligibility costs one
  // round trip per lesson, so only fetch them for lessons that actually have a
  // free seat.
  const offers = isAdmin ? await listOffers({ instanceIds: instances.map((i) => i.id) }) : [];
  const offersByInstance = new Map<string, typeof offers>();
  for (const offer of offers) {
    const list = offersByInstance.get(offer.instance_id) ?? [];
    list.push(offer);
    offersByInstance.set(offer.instance_id, list);
  }

  const takenSeats = (instanceId: string) =>
    (bookingsByInstance.get(instanceId) ?? []).filter(
      (b) => b.status === "booked" || b.status === "backfilled",
    ).length;

  const fillable = isAdmin
    ? instances.filter((i) => i.status === "scheduled" && takenSeats(i.id) < i.max_riders)
    : [];

  const eligibleByInstance = new Map(
    await Promise.all(
      fillable.map(async (instance) => [instance.id, await listEligibleRiders(instance.id)] as const),
    ),
  );

  const isToday = date === barnToday();

  return (
    <>
      {/*
       * The day stepper. A whole-width bar rather than two small arrows: this is
       * the control that gets used most on this screen, often one-handed while
       * holding a lead rope, so both targets are 48px and the day itself is the
       * loudest thing on the row.
       */}
      <nav aria-label="Change day" className="flex items-stretch gap-2">
        <Link
          href={`/schedule?date=${addBarnDays(date, -1)}`}
          aria-label="Previous day"
          className="flex min-h-12 w-12 shrink-0 items-center justify-center rounded-control border border-line bg-surface text-ink"
        >
          <Icon name="chevron" className="size-5 rotate-180" strokeWidth={2} />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-control border border-line bg-surface px-2 py-1.5">
          <span className="truncate font-display text-heading leading-tight text-ink">
            {formatBarnDayLabel(date)}
          </span>
          {isToday ? (
            <span className="font-display text-eyebrow uppercase text-accent-text">Today</span>
          ) : (
            <Link href="/schedule" className="text-caption text-accent-text underline underline-offset-2">
              Back to today
            </Link>
          )}
        </div>

        <Link
          href={`/schedule?date=${addBarnDays(date, 1)}`}
          aria-label="Next day"
          className="flex min-h-12 w-12 shrink-0 items-center justify-center rounded-control border border-line bg-surface text-ink"
        >
          <Icon name="chevron" className="size-5" strokeWidth={2} />
        </Link>
      </nav>

      <ChipRow>
        <Chip
          value={`${instances.length} ${instances.length === 1 ? "lesson" : "lessons"}`}
          icon="calendar"
          tone={instances.length === 0 ? "neutral" : "forest"}
        />
        {isAdmin && fillable.length > 0 && (
          <Chip value={`${fillable.length} with a free seat`} icon="alert" tone="gold" />
        )}
      </ChipRow>

      {instances.length === 0 ? (
        <EmptyState
          title={isToday ? "Nothing on today" : "Nothing on this day"}
          body={
            isAdmin
              ? "Add a one-off below if something has come up, or fill the week from the weekly schedule in the admin menu."
              : "No lessons are scheduled. Check another day with the arrows above."
          }
        />
      ) : (
        instances.map((instance) => (
          <LessonCard
            key={instance.id}
            instance={instance}
            instructorName={
              instance.instructor_id ? instructorNames.get(instance.instructor_id) : undefined
            }
            riders={bookingsByInstance.get(instance.id) ?? []}
            riderNames={riderNames}
          >
            {isAdmin && (
              <div className="flex flex-col gap-2">
                {eligibleByInstance.has(instance.id) && (
                  <FillSlotForm
                    instanceId={instance.id}
                    openSeats={instance.max_riders - takenSeats(instance.id)}
                    eligible={eligibleByInstance.get(instance.id) ?? []}
                    offers={offersByInstance.get(instance.id) ?? []}
                    riderNames={riderNames}
                  />
                )}
                <BookRiderForm instanceId={instance.id} riders={riderOptions} />
                <form action={instance.status === "cancelled" ? restoreInstance : cancelInstance}>
                  <input type="hidden" name="id" value={instance.id} />
                  {/* Cancelling is destructive and reads as such; restoring is
                      an ordinary action and should not. */}
                  <Button
                    type="submit"
                    block
                    variant={instance.status === "cancelled" ? "secondary" : "danger"}
                  >
                    {instance.status === "cancelled" ? "Restore this lesson" : "Cancel this lesson"}
                  </Button>
                </form>
              </div>
            )}
          </LessonCard>
        ))
      )}

      {/*
       * A one-off is an exception, not part of the day's rhythm — so it is a
       * sheet you pull up when you need it rather than a permanent form parked
       * at the bottom of every schedule screen. It stays on the page rather
       * than going into the overflow because its label already says plainly
       * what it does, which is the whole test.
       */}
      {isAdmin && (
        <SheetTrigger
          label={`Add a one-off on ${formatBarnDayLabel(date)}`}
          title={`One-off on ${formatBarnDayLabel(date)}`}
        >
          <OneOffLessonForm date={date} instructors={instructorOptions} levels={levelOptions} />
        </SheetTrigger>
      )}
    </>
  );
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  await requireTab("/schedule");
  const role = await currentRole();

  if (!featureEnabled("lessons")) {
    return (
      <TabPage title="Schedule">
        <StubScreen
          heading="Day view"
          phase="Phase 1"
          detail={
            role === "admin"
              ? "The day calendar, slot editing, the weekly template wizard and the backfill flow."
              : "The day view of lessons and barn events."
          }
        />
      </TabPage>
    );
  }

  const params = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : barnToday();
  const view: View =
    params.view === "month" || params.view === "list" ? params.view : "day";

  return (
    <TabPage
      title="Schedule"
      action={
        role === "admin" ? (
          <ScheduleAdminMenu date={date} dayLabel={formatBarnDayLabel(date)} />
        ) : undefined
      }
    >
      <ViewSwitch view={view} date={date} />

      {/*
       * No Suspense boundary around the body. There used to be one on the old
       * /calendar screen, back when the segment's only loading state was the
       * black launch screen and a page-level fallback would have blacked the
       * app out. That fallback is skeletons now (app/(app)/loading.tsx), which
       * already keeps the masthead and the page's shape while a view loads — so
       * a second boundary here would only add a skeleton inside a skeleton for
       * the same wait.
       */}
      {view === "day" ? <DayBody date={date} role={role} /> : <CalendarBody view={view} />}
    </TabPage>
  );
}
