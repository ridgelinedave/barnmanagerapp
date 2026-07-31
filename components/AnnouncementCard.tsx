import { Card, Chip, ChipRow } from "@/components/ui/primitives";
import type { Announcement } from "@/lib/types";
import { barn } from "@/config/barn";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: barn.timezone,
});

/**
 * One notice from the barn.
 *
 * A pinned announcement gets a gold border AND a chip — the border alone is a
 * colour-only signal, which is exactly what the system forbids.
 */
export function AnnouncementCard({
  announcement,
  showAudience = false,
}: {
  announcement: Announcement;
  /** Admin and staff see both audiences, so they need to know which is which. */
  showAudience?: boolean;
}) {
  const { title, body_md, pinned, audience, posted_at } = announcement;
  const staffOnly = showAudience && audience === "staff";

  return (
    <Card as="article" className={`p-4 ${pinned ? "border-gold" : ""}`}>
      <div className="flex items-start gap-3">
        <h3 className="min-w-0 flex-1 font-display text-heading leading-snug text-ink">{title}</h3>
        <time dateTime={posted_at} className="shrink-0 pt-0.5 text-caption text-muted">
          {dateFormatter.format(new Date(posted_at))}
        </time>
      </div>

      {(pinned || staffOnly) && (
        <div className="mt-2">
          <ChipRow>
            {pinned && <Chip value="Pinned" icon="pin" tone="gold" />}
            {staffOnly && <Chip value="Staff only" icon="alert" tone="neutral" />}
          </ChipRow>
        </div>
      )}

      {body_md.trim() && (
        <p className="mt-2 whitespace-pre-line text-caption leading-relaxed text-ink">{body_md}</p>
      )}
    </Card>
  );
}
