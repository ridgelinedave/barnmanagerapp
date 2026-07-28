import type { Announcement } from "@/lib/types";
import { barn } from "@/config/barn";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: barn.timezone,
});

/** Cards, not tables (SPEC §3.4). Body renders as plain text with line breaks. */
export function AnnouncementCard({
  announcement,
  showAudience = false,
}: {
  announcement: Announcement;
  /** Admin and staff can see both audiences, so they need to know which is which. */
  showAudience?: boolean;
}) {
  const { title, body_md, pinned, audience, posted_at } = announcement;

  return (
    <article
      className={`rounded-2xl border bg-white p-4 ${
        pinned ? "border-brand-gold" : "border-brand-ink/10"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {pinned && (
          <span className="rounded-full bg-brand-gold px-2 py-0.5 text-[11px] font-semibold text-white">
            Pinned
          </span>
        )}
        {showAudience && audience === "staff" && (
          <span className="rounded-full bg-brand-ink/10 px-2 py-0.5 text-[11px] font-semibold text-brand-ink/70">
            Staff only
          </span>
        )}
        <time
          dateTime={posted_at}
          className="ml-auto text-xs tabular-nums text-brand-ink/50"
        >
          {dateFormatter.format(new Date(posted_at))}
        </time>
      </div>

      <h3 className="mt-2 text-base font-semibold leading-snug">{title}</h3>

      {body_md.trim() && (
        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-brand-ink/75">
          {body_md}
        </p>
      )}
    </article>
  );
}
