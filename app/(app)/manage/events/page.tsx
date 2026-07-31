import { TabPage } from "@/components/TabPage";
import { StubScreen } from "@/components/StubScreen";
import { EventForm } from "@/components/EventAdmin";
import { Card, Chip, ChipRow, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { SheetTrigger } from "@/components/ui/Sheet";
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
        <StubScreen
          heading="Calendar"
          phase="Phase 2"
          detail="Shows, clinics, farrier and vet days, closures and calendar subscriptions."
        />
      </TabPage>
    );
  }

  const { upcoming, past } = partitionEvents(await listAllEvents());

  return (
    <TabPage title="Calendar" back="/manage">
      <section className="flex flex-col gap-3">
        <SectionHeader title="Coming up" count={`${upcoming.length}`} />

        {upcoming.length === 0 ? (
          <EmptyState
            title="Nothing on the calendar"
            body="Shows, clinics, farrier and vet days, closures. Anything marked visible to everyone lands on subscribed family calendars too."
            emoji="📅"
          />
        ) : (
          upcoming.map((event) => (
            <Card key={event.id} className="p-4">
              <h3 className="font-display text-heading leading-snug text-ink">{event.title}</h3>
              <p className="mt-0.5 text-caption text-muted">{when(event.start_at, event.end_at)}</p>

              <div className="mt-1.5">
                <ChipRow>
                  <Chip value={EVENT_TYPE_LABELS[event.type]} icon="calendar" />
                  {event.location && <Chip value={event.location} icon="pin" />}
                  {/* Staff-only is the chip that matters most on this screen —
                      it is the difference between internal and forty phones. */}
                  {event.visibility === "staff" && (
                    <Chip value="Staff only" icon="alert" tone="gold" />
                  )}
                </ChipRow>
              </div>

              {event.description && (
                <p className="mt-2 text-caption text-ink">{event.description}</p>
              )}

              <form action={deleteEvent} className="mt-3">
                <input type="hidden" name="id" value={event.id} />
                <Button type="submit" variant="danger" block>
                  Remove
                </Button>
              </form>
            </Card>
          ))
        )}
      </section>

      <SheetTrigger label="Add to the calendar" title="New calendar entry" variant="primary">
        <EventForm today={barnToday()} />
      </SheetTrigger>

      {past.length > 0 && (
        <details className="rounded-card border border-line bg-surface p-4">
          <summary className="flex min-h-11 cursor-pointer items-center font-display text-heading text-ink">
            Past ({past.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {past.map((event) => (
              <li key={event.id} className="text-caption text-muted">
                <span className="font-medium text-ink">{event.title}</span> —{" "}
                {when(event.start_at, null)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </TabPage>
  );
}
