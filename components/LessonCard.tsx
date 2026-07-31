import { Card, Chip, ChipRow } from "@/components/ui/primitives";
import type { LessonInstance, LessonRider } from "@/lib/types";
import { formatTime } from "@/lib/dates";

/** Shared presentation for a lesson instance. Cards, never a table (SPEC §3.4). */
export function LessonCard({
  instance,
  instructorName,
  riders,
  riderNames,
  children,
}: {
  instance: LessonInstance;
  instructorName?: string;
  /** Bookings for this instance, when the viewer is allowed to see them. */
  riders?: LessonRider[];
  riderNames?: Map<string, string>;
  children?: React.ReactNode;
}) {
  const cancelled = instance.status === "cancelled";
  const booked = (riders ?? []).filter((r) => r.status !== "cancelled");
  const released = (riders ?? []).filter((r) => r.status === "cancelled");

  return (
    <Card as="article" className={`p-4 ${cancelled ? "bg-sunk" : ""}`}>
      {/*
       * The time is the loudest thing on the card — a day view is read by
       * scanning down the times, and everything else is qualifier.
       */}
      <div className="flex items-baseline gap-2">
        <span
          className={`font-display text-title leading-none ${
            cancelled ? "text-muted line-through" : "text-ink"
          }`}
        >
          {formatTime(instance.start_time)}
        </span>
        <span className="text-caption text-muted">
          {instance.duration_min} min · {instance.type === "private" ? "Private" : "Group"}
        </span>
      </div>

      {(instructorName || cancelled) && (
        <div className="mt-1.5">
          <ChipRow>
            {cancelled && <Chip value="Cancelled" icon="alert" tone="danger" />}
            {instructorName && <Chip label="With" value={instructorName} />}
          </ChipRow>
        </div>
      )}

      {riders && (
        <p className="mt-2 text-caption text-ink">
          {booked.length === 0 ? (
            <span className="text-muted">No riders booked</span>
          ) : (
            booked.map((r) => riderNames?.get(r.rider_id) ?? "Rider").join(", ")
          )}
          {released.length > 0 && (
            <span className="text-muted"> · {released.length} cancelled</span>
          )}
        </p>
      )}

      {instance.notes && (
        <p className="mt-1 whitespace-pre-line text-caption text-muted">{instance.notes}</p>
      )}

      {children ? <div className="mt-3">{children}</div> : null}
    </Card>
  );
}
