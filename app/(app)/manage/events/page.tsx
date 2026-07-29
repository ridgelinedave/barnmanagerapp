import Link from "next/link";
import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { EventForm } from "@/components/EventAdmin";
import { requireTab } from "@/lib/guard";
import { listAllEvents, partitionEvents } from "@/lib/events";
import { barnToday } from "@/lib/dates";
import { barn, featureEnabled } from "@/config/barn";
import { EVENT_TYPE_LABELS } from "@/lib/types";
import { deleteEvent } from "./actions";

export const metadata = { title: "Calendar" };

function when(startAt: string, endAt: string | null): string {
  const format = (iso: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: barn.timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));

  return endAt ? `${format(startAt)} – ${format(endAt)}` : format(startAt);
}

export default async function ManageEventsPage() {
  await requireTab("/manage");

  if (!featureEnabled("events")) {
    return (
      <TabPage title="Calendar">
        <StubScreen heading="Calendar" phase="Phase 2">
          <p className="text-sm text-brand-ink/70">
            Shows, clinics, farrier and vet days, closures — and calendar subscriptions — land
            here.
          </p>
        </StubScreen>
      </TabPage>
    );
  }

  const { upcoming, past } = partitionEvents(await listAllEvents());

  return (
    <TabPage title="Calendar">
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold">Coming up</h2>
          <p className="text-sm text-brand-ink/60">{upcoming.length}</p>
        </div>

        {upcoming.length === 0 ? (
          <p className="rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
            Nothing on the calendar yet.
          </p>
        ) : (
          upcoming.map((event) => (
            <div key={event.id} className="rounded-2xl border border-brand-ink/15 bg-white p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold leading-snug">{event.title}</h3>
                  <p className="mt-0.5 text-sm text-brand-ink/70">
                    {EVENT_TYPE_LABELS[event.type]} · {when(event.start_at, event.end_at)}
                  </p>
                  {event.location && (
                    <p className="mt-0.5 text-sm text-brand-ink/60">{event.location}</p>
                  )}
                </div>
                {event.visibility === "staff" && (
                  <span className="shrink-0 rounded-full bg-brand-ink/10 px-2 py-0.5 text-[11px] font-semibold text-brand-ink/70">
                    Staff only
                  </span>
                )}
              </div>

              {event.description && (
                <p className="mt-2 text-sm text-brand-ink/85">{event.description}</p>
              )}

              <form action={deleteEvent} className="mt-3">
                <input type="hidden" name="id" value={event.id} />
                <button
                  type="submit"
                  className="min-h-11 w-full rounded-xl border border-red-300 bg-white text-sm font-semibold text-red-700"
                >
                  Remove
                </button>
              </form>
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4">
        <h2 className="text-base font-semibold">Add to the calendar</h2>
        <EventForm today={barnToday()} />
      </section>

      {past.length > 0 && (
        <details className="rounded-2xl border border-brand-ink/10 bg-white p-4">
          <summary className="min-h-11 cursor-pointer text-sm font-semibold">
            Past ({past.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {past.map((event) => (
              <li key={event.id} className="text-sm text-brand-ink/70">
                <span className="font-medium">{event.title}</span> — {when(event.start_at, null)}
              </li>
            ))}
          </ul>
        </details>
      )}

      <Link href="/manage" className="py-2 text-center text-sm font-medium underline">
        Back to Manage
      </Link>
    </TabPage>
  );
}
