import Link from "next/link";
import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { LessonCard } from "@/components/LessonCard";
import { BookRiderForm, GenerateInstancesButton, OneOffLessonForm } from "@/components/ScheduleAdmin";
import { FillSlotForm, SendRemindersButton } from "@/components/FillSlotForm";
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
        <StubScreen heading="Day view" phase="Phase 1">
          <p className="text-sm text-brand-ink/70">
            {role === "admin"
              ? "The day-column calendar, slot editing, the weekly template wizard, and the cancellation-to-backfill flow land here."
              : "The day-column view of lessons and barn events lands here."}
          </p>
        </StubScreen>
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

  return (
    <TabPage title="Schedule">
      <nav className="flex items-center gap-2" aria-label="Change day">
        <Link
          href={`/schedule?date=${addBarnDays(date, -1)}`}
          className="flex min-h-11 items-center rounded-xl border border-brand-ink/20 bg-white px-3 text-sm font-semibold"
        >
          ‹ Prev
        </Link>
        <span className="flex-1 text-center text-base font-semibold">
          {formatBarnDayLabel(date)}
        </span>
        <Link
          href={`/schedule?date=${addBarnDays(date, 1)}`}
          className="flex min-h-11 items-center rounded-xl border border-brand-ink/20 bg-white px-3 text-sm font-semibold"
        >
          Next ›
        </Link>
      </nav>

      {date !== barnToday() && (
        <Link href="/schedule" className="text-center text-sm font-semibold text-brand-gold-deep underline">
          Back to today
        </Link>
      )}

      {instances.length === 0 ? (
        <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
          {isAdmin
            ? "No lessons on this day. Generate from the weekly schedule, or add a one-off below."
            : "No lessons scheduled."}
        </p>
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
                  <button
                    type="submit"
                    className="min-h-11 w-full rounded-xl border border-brand-ink/20 bg-white text-sm font-semibold"
                  >
                    {instance.status === "cancelled" ? "Restore this lesson" : "Cancel this lesson"}
                  </button>
                </form>
              </div>
            )}
          </LessonCard>
        ))
      )}

      {isAdmin && (
        <>
          <section className="flex flex-col gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4">
            <h2 className="text-base font-semibold">Build the schedule</h2>
            <GenerateInstancesButton />
            <SendRemindersButton date={date} />
            <Link
              href="/manage/lesson-templates"
              className="flex min-h-11 items-center justify-center rounded-xl border border-brand-ink/20 px-4 text-sm font-semibold"
            >
              Edit the weekly schedule
            </Link>
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4">
            <h2 className="text-base font-semibold">One-off on {formatBarnDayLabel(date)}</h2>
            <OneOffLessonForm date={date} instructors={instructorOptions} levels={levelOptions} />
          </section>
        </>
      )}
    </TabPage>
  );
}
