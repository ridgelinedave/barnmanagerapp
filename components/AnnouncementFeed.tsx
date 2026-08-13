import Link from "next/link";
import type { Announcement } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";
import { barn } from "@/config/barn";

/**
 * THE ANNOUNCEMENTS FEED — editorial, not a stack of boxes.
 *
 * It was one card per notice: title, date, chips, full body, hairline, repeat.
 * Every item claimed the same weight and roughly half a screen, so four notices
 * were four scrolls and nothing said which one mattered. A barn's notices are
 * not equal — one is pinned because Belle needs it read.
 *
 * So: the lead item is a FEATURED card with an oxblood header block carrying
 * the headline, and everything under it is a COMPACT ROW — timestamp, headline,
 * one line of the body, a category tag. Five at a glance instead of one per
 * screen (design/mockups/monarch-feeds.html).
 *
 * TEXT ONLY THIS PASS. The mockup puts a photo on the featured card and
 * thumbnails on the rows; announcements have no image column, and inventing a
 * grey gradient where a photo should be is decoration pretending to be content.
 * The oxblood block does the same job — it makes the lead item unmistakable —
 * and the layout takes an image later without moving.
 *
 * A ROW YOU CANNOT READ IS NOT A FEATURE. The snippet is one line, so where
 * there is no detail screen to open (a family's Home feed) the row is a
 * disclosure: tapping it expands the full notice in place. No new route, no
 * client JavaScript, and the keyboard and screen reader behaviour comes from
 * <details> rather than being reimplemented.
 */

const stampFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: barn.timezone,
});

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: barn.timezone,
});

/** Whole barn-local days between two instants. Calendar days, not 24h blocks. */
function daysAgo(posted: string, now: Date): number {
  const then = Date.parse(`${dayKeyFormatter.format(new Date(posted))}T00:00:00Z`);
  const today = Date.parse(`${dayKeyFormatter.format(now)}T00:00:00Z`);
  return Math.round((today - then) / 86_400_000);
}

/**
 * "Aug 11 · 2 days ago" for the lead item, "Aug 11" for a row.
 *
 * The relative half is only useful while it is small — "412 days ago" is worse
 * than the date it replaced — so it drops off after a fortnight.
 */
function stamp(posted: string, now: Date, relative: boolean): string {
  const date = stampFormatter.format(new Date(posted));
  if (!relative) return date;

  const days = daysAgo(posted, now);
  if (days <= 0) return `${date} · Today`;
  if (days === 1) return `${date} · Yesterday`;
  if (days <= 14) return `${date} · ${days} days ago`;
  return date;
}

/** The first line of the body, for a row that has not been opened. */
function snippet(body: string): string {
  return body.trim().split(/\n+/, 1)[0] ?? "";
}

/* -------------------------------------------------------------------------- */
/* Tags                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The small category pill.
 *
 * Both pairings are measured on the ground they actually sit on: oxblood on
 * blush is 13.27:1, gold-deep on the gold tint is 5.45:1. Neither is the light
 * grey the mockup uses, which fails AA at any size.
 */
function Tag({ tone, children }: { tone: "pinned" | "staff"; children: string }) {
  const tones = {
    pinned: "bg-accent-tint text-accent-text",
    staff: "bg-gold-tint text-gold-deep",
  } as const;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-[0.06em] ${tones[tone]}`}
    >
      {tone === "pinned" && <Icon name="pin" className="size-3 shrink-0" strokeWidth={2.5} />}
      {children}
    </span>
  );
}

function Tags({ announcement, showAudience }: { announcement: Announcement; showAudience: boolean }) {
  const staffOnly = showAudience && announcement.audience === "staff";
  if (!announcement.pinned && !staffOnly) return null;

  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {announcement.pinned && <Tag tone="pinned">Pinned</Tag>}
      {staffOnly && <Tag tone="staff">Staff only</Tag>}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* The lead item                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The featured card: an oxblood block carrying the headline, the notice under.
 *
 * The block is `deep` (#4A002A, Belle's hero oxblood) rather than the lifted
 * interactive fill — this is a field of brand colour, not a button, and it is
 * the same plane as the masthead so the two read as one system. White on it is
 * 15.85:1 and the blush pin tag is 13.27:1.
 *
 * The body is shown IN FULL here. It is the one notice the barn chose to lead
 * with; truncating it would make the feature card a headline with no story.
 */
function FeaturedAnnouncement({
  announcement,
  showAudience,
  href,
  now,
}: {
  announcement: Announcement;
  showAudience: boolean;
  href?: string;
  now: Date;
}) {
  const staffOnly = showAudience && announcement.audience === "staff";

  const inner = (
    <>
      <div className="bg-deep px-4 pb-4 pt-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {announcement.pinned && (
            <span className="inline-flex items-center gap-1 rounded-chip bg-accent-tint px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-accent-text">
              <Icon name="pin" className="size-3 shrink-0" strokeWidth={2.5} />
              Pinned
            </span>
          )}
          {staffOnly && (
            <span className="inline-flex items-center gap-1 rounded-chip bg-gold-tint px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-gold-deep">
              Staff only
            </span>
          )}
        </div>

        <h3 className="mt-2 font-display text-title leading-tight text-white">
          {announcement.title}
        </h3>
      </div>

      <div className="px-4 pb-4 pt-3">
        <time
          dateTime={announcement.posted_at}
          className="block text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted"
        >
          {stamp(announcement.posted_at, now, true)}
        </time>
        {announcement.body_md.trim() && (
          <p className="mt-1.5 whitespace-pre-line text-body leading-relaxed text-ink">
            {announcement.body_md}
          </p>
        )}
      </div>
    </>
  );

  const shell =
    "block overflow-hidden rounded-card border border-line bg-surface shadow-card";

  if (!href) return <article className={shell}>{inner}</article>;

  return (
    <article className={shell}>
      <Link href={href} className="block active:opacity-90">
        {inner}
      </Link>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* The rows                                                                    */
/* -------------------------------------------------------------------------- */

function RowBody({
  announcement,
  showAudience,
  now,
  clamp,
}: {
  announcement: Announcement;
  showAudience: boolean;
  now: Date;
  /** One line, for a closed row. The open state shows the whole notice. */
  clamp: boolean;
}) {
  const line = snippet(announcement.body_md);

  return (
    <span className="min-w-0 flex-1">
      <time
        dateTime={announcement.posted_at}
        className="block text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted"
      >
        {stamp(announcement.posted_at, now, false)}
      </time>
      <span className="mt-1 block font-display text-heading leading-snug text-ink">
        {announcement.title}
      </span>
      {line && (
        <span className={`mt-0.5 block text-caption text-muted ${clamp ? "truncate" : ""}`}>
          {line}
        </span>
      )}
      <Tags announcement={announcement} showAudience={showAudience} />
    </span>
  );
}

function AnnouncementRow({
  announcement,
  showAudience,
  href,
  now,
}: {
  announcement: Announcement;
  showAudience: boolean;
  href?: string;
  now: Date;
}) {
  const shell = "flex w-full items-start gap-3 border-b border-line py-3.5 text-left last:border-b-0";
  const body = <RowBody announcement={announcement} showAudience={showAudience} now={now} clamp />;
  const chevron = <Icon name="chevron" className="mt-1 size-4 shrink-0 text-muted" />;

  // Somewhere to go (the admin list, where a row opens its editor).
  if (href) {
    return (
      <li>
        <Link href={href} className={`${shell} active:bg-sunk`}>
          {body}
          {chevron}
        </Link>
      </li>
    );
  }

  /*
   * Is anything actually hidden behind the one-line snippet?
   *
   * More than one line, or a first line longer than fits on a phone — roughly
   * 56 characters at 13px in the 390px column, and erring low costs nothing
   * (a disclosure that opens onto the same sentence) where erring high costs a
   * notice nobody can finish reading.
   */
  const rest = announcement.body_md.trim();
  const first = snippet(rest);
  const hasMore = rest !== first || first.length > 56;

  // Nowhere to go, and nothing hidden — a plain row.
  if (!rest || !hasMore) {
    return <li className={shell}>{body}</li>;
  }

  // Nowhere to go, but there is more to read — expand in place.
  return (
    <li className="border-b border-line last:border-b-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 py-3.5 [&::-webkit-details-marker]:hidden">
          <RowBody announcement={announcement} showAudience={showAudience} now={now} clamp />
          <Icon
            name="chevron"
            className="mt-1 size-4 shrink-0 rotate-90 text-muted transition-transform duration-150 group-open:-rotate-90"
            strokeWidth={2}
          />
        </summary>
        <p className="whitespace-pre-line pb-3.5 text-caption leading-relaxed text-ink">{rest}</p>
      </details>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* The feed                                                                    */
/* -------------------------------------------------------------------------- */

export function AnnouncementFeed({
  announcements,
  /** Admin and staff see both audiences, so they need to know which is which. */
  showAudience = false,
  /** Given an announcement id, where its row goes. Omit for a read-only feed. */
  hrefFor,
}: {
  announcements: Announcement[];
  showAudience?: boolean;
  hrefFor?: (id: string) => string;
}) {
  if (announcements.length === 0) return null;

  // The list already arrives pinned-first then newest-first (lib/announcements
  // orders it that way for everyone), so the lead item is the top pinned notice
  // where one exists and the newest where none does. Deciding it here would put
  // that ordering in a second place.
  const [featured, ...rest] = announcements;
  const now = new Date();

  return (
    <div className="flex flex-col">
      <FeaturedAnnouncement
        announcement={featured}
        showAudience={showAudience}
        href={hrefFor?.(featured.id)}
        now={now}
      />

      {rest.length > 0 && (
        <ul className="mt-1">
          {rest.map((announcement) => (
            <AnnouncementRow
              key={announcement.id}
              announcement={announcement}
              showAudience={showAudience}
              href={hrefFor?.(announcement.id)}
              now={now}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Filters                                                                     */
/* -------------------------------------------------------------------------- */

export const ANNOUNCEMENT_FILTERS = ["all", "pinned", "families", "staff"] as const;
export type AnnouncementFilter = (typeof ANNOUNCEMENT_FILTERS)[number];

const FILTER_LABELS: Record<AnnouncementFilter, string> = {
  all: "All",
  pinned: "Pinned",
  families: "Families",
  staff: "Staff",
};

export function isAnnouncementFilter(value: unknown): value is AnnouncementFilter {
  return (
    typeof value === "string" && (ANNOUNCEMENT_FILTERS as readonly string[]).includes(value)
  );
}

export function filterAnnouncements(
  announcements: Announcement[],
  filter: AnnouncementFilter,
): Announcement[] {
  switch (filter) {
    case "pinned":
      return announcements.filter((a) => a.pinned);
    // "Families" is the everyone audience seen from the barn's side: what a
    // parent will read. The audience value is `all`; the chip says who it
    // reaches, because that is the question being asked of it.
    case "families":
      return announcements.filter((a) => a.audience === "all");
    case "staff":
      return announcements.filter((a) => a.audience === "staff");
    default:
      return announcements;
  }
}

/**
 * The filter row: chips that scroll sideways inside their own strip.
 *
 * Links, not buttons — the list is server-rendered, so a filter is a URL. That
 * also makes "the pinned ones" something Belle can bookmark.
 *
 * The negative margin lets the strip run to the screen edge (so a scrolled chip
 * is visibly cut off rather than stopping short, which is what tells you it
 * scrolls) while the padding keeps the first and last chips off the edge. It
 * scrolls INSIDE itself; the page never does.
 */
export function AnnouncementFilterChips({
  active,
  hrefFor,
}: {
  active: AnnouncementFilter;
  hrefFor: (filter: AnnouncementFilter) => string;
}) {
  return (
    <nav
      aria-label="Filter announcements"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5"
    >
      {ANNOUNCEMENT_FILTERS.map((filter) => {
        const on = filter === active;
        return (
          <Link
            key={filter}
            href={hrefFor(filter)}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-chip border px-4 text-label font-semibold ${
              on
                ? "border-accent bg-accent text-accent-on"
                : "border-line bg-surface text-muted"
            }`}
          >
            {FILTER_LABELS[filter]}
          </Link>
        );
      })}
    </nav>
  );
}
