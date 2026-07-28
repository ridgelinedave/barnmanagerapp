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
    <article
      className={`rounded-2xl border p-4 ${
        cancelled ? "border-brand-ink/10 bg-brand-ink/5" : "border-brand-ink/15 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={`text-base font-semibold tabular-nums ${cancelled ? "line-through text-brand-ink/50" : ""}`}
        >
          {formatTime(instance.start_time)}
        </span>
        <span className="text-sm text-brand-ink/60">
          {instance.duration_min} min · {instance.type === "private" ? "Private" : "Group"}
        </span>
        {cancelled && (
          <span className="ml-auto rounded-full bg-brand-ink/10 px-2 py-0.5 text-[11px] font-semibold text-brand-ink/70">
            Cancelled
          </span>
        )}
      </div>

      {instructorName && (
        <p className="mt-1 text-sm text-brand-ink/70">with {instructorName}</p>
      )}

      {riders && (
        <p className="mt-1 text-sm text-brand-ink/70">
          {booked.length === 0
            ? "No riders booked"
            : booked
                .map((r) => riderNames?.get(r.rider_id) ?? "Rider")
                .join(", ")}
          {released.length > 0 && (
            <span className="text-brand-ink/45">
              {" "}
              · {released.length} cancelled
            </span>
          )}
        </p>
      )}

      {instance.notes && (
        <p className="mt-1 whitespace-pre-line text-sm text-brand-ink/70">{instance.notes}</p>
      )}

      {children ? <div className="mt-3">{children}</div> : null}
    </article>
  );
}
