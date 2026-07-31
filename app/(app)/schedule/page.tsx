import Link from "next/link";
import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { LessonCard } from "@/components/LessonCard";
import { BookRiderForm, GenerateInstancesButton, OneOffLessonForm } from "@/components/ScheduleAdmin";
import { FillSlotForm, SendRemindersButton } from "@/components/FillSlotForm";
import { Card, Chip, ChipRow, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { Button, ButtonLink } from "@/components/ui/Button";
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
import { addBarnDays, barnToday, formatBarnDayLabel } from "@/lib/dates";
import { featureEnabled } from "@/config/barn";
import { cancelInstance, restoreInstance } from "./actions";

export const metadata = { title: "Schedule" };

/** Day-column view. Admin can act on each lesson; staff read only. */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
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

  const instances = await listInstancesForDate(date);
  const bookings = await listLessonRidersForInstances(instances.map((i) => i.id));

  const [people, riders, levels] = await Promise.all([
    listAssignableProfiles(),
    listVisibleRiders(),
    listLevels(),
  ]);
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

  const isAdmin = role === "admin";

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
    <TabPage title="Schedule">
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
            <span className="font-display text-eyebrow uppercase text-gold-deep">Today</span>
          ) : (
            <Link href="/schedule" className="text-caption text-gold-deep underline underline-offset-2">
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
              ? "Generate the day from the weekly schedule below, or add a one-off if something has come up."
              : "No lessons are scheduled. Check another day with the arrows above."
          }
          emoji="🌾"
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

      {isAdmin && (
        <>
          <section className="flex flex-col gap-3">
            <SectionHeader title="Run the day" />
            <Card className="flex flex-col gap-2.5 p-4">
              <GenerateInstancesButton />
              <SendRemindersButton date={date} />
              <ButtonLink href="/manage/lesson-templates" block icon="calendar">
                Edit the weekly schedule
              </ButtonLink>
            </Card>
          </section>

          {/*
           * A one-off is an exception, not part of the day's rhythm — so it is
           * a sheet you pull up when you need it rather than a permanent form
           * parked at the bottom of every schedule screen.
           */}
          <SheetTrigger
            label={`Add a one-off on ${formatBarnDayLabel(date)}`}
            title={`One-off on ${formatBarnDayLabel(date)}`}
          >
            <OneOffLessonForm date={date} instructors={instructorOptions} levels={levelOptions} />
          </SheetTrigger>
        </>
      )}
    </TabPage>
  );
}
