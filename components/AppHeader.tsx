import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { barn } from "@/config/barn";
import { NotificationBell } from "@/components/NotificationBell";
import { Icon } from "@/components/ui/Icon";
import { BUCKET_FRAME, DEFAULT_LAYOUT, type LayoutBucket } from "@/components/layout-buckets";

/**
 * The app header: a deep oxblood bar under a gold hairline.
 *
 * It has been charcoal, then white. White made the app read as unbranded — a
 * generic light shell you could hand to any business — and it hid a real bug:
 * the bell was still styled `text-white/85` from the charcoal era, so it was
 * invisible on the white bar and its badge was dark-on-dark.
 *
 * Oxblood puts Belle's colour where the eye lands first and gives the gold
 * something to sit on. The bar is the ONE deep plane in the app: the body is
 * blush, the cards are white, and the bottom nav stays light, so this reads as
 * a masthead rather than the chrome closing in from both edges.
 *
 * Contrast on the new pairings: white title on #4A002A is 15.85:1, gold
 * kicker on the same is 7.22:1, and the badge is gold carrying ink at 7.92:1.
 *
 * Three shapes, one component:
 *   root      the crest, the barn name, the screen title, the bell
 *   back      a back arrow and a title, for a screen you drilled into
 *   subject   back arrow, a photo, a name and two lines of fact — the horse
 *             profile, where the animal deserves to be the header
 *
 * ON THE DESKTOP SHELL this is the top bar of the content area, right of the
 * sidebar. The crest moves to the sidebar's masthead, so it is not printed
 * twice side by side; the bell stays here, top right, where it is on a phone.
 * The row follows the screen's layout bucket so the title sits over the
 * column it titles.
 */
export function AppHeader({
  title,
  back,
  action,
  subject,
  bell = true,
  layout = DEFAULT_LAYOUT,
  tabs,
}: {
  title: string;
  /** href to return to. Present = drilled-in screen. */
  back?: string;
  /** One contextual control on the right. */
  action?: ReactNode;
  subject?: { name: string; meta?: string; photoUrl?: string | null };
  bell?: boolean;
  /** The screen's desktop bucket; the row is capped to match. */
  layout?: LayoutBucket;
  /** Sub-view tabs (Day / Month / Agenda…). Shown under the title on desktop. */
  tabs?: ReactNode;
}) {
  return (
    /*
     * TWO REGISTERS. On the phone this is the oxblood masthead under the gold
     * hairline — the barn's brand plane. From `lg` it is a LIGHT page header:
     * white, a 1px bottom border, the title left at 20px, the primary action
     * right, sub-view tabs beneath. On a desk the sidebar's brand block already
     * carries the barn; a second deep bar across the content was oxblood used
     * as chrome, and the accent is reserved for buttons and the active nav.
     */
    <header
      data-plane="deep"
      className="safe-top sticky top-0 z-30 border-b-2 border-gold bg-deep lg:border-b lg:border-line lg:bg-surface"
    >
      {/* lg:min-h-18 pins the row to one height on the desktop shell (72px +
          the 1px border = the sidebar masthead), so the two line up whichever
          header shape a screen uses. */}
      <div className={`mx-auto flex ${BUCKET_FRAME[layout]} items-center gap-3 py-3 lg:min-h-18`}>
        {back ? (
          <Link
            href={back}
            aria-label="Back"
            className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-control text-white lg:size-9 lg:text-muted lg:hover:bg-sunk lg:hover:text-ink"
          >
            <Icon name="back" className="size-5.5" strokeWidth={2} />
          </Link>
        ) : (
          <Image
            src={barn.brand.logoSrc}
            alt=""
            width={36}
            height={36}
            priority
            className="size-9 shrink-0 lg:hidden"
          />
        )}

        {subject ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {subject.photoUrl ? (
              /* Signed, per-request storage URL — next/image would proxy a
                 one-time link it cannot cache. */
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={subject.photoUrl}
                alt=""
                className="size-12 shrink-0 rounded-avatar border border-line object-cover lg:size-10"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-12 shrink-0 items-center justify-center rounded-avatar border border-white/30 bg-white/10 font-display text-title font-bold text-white lg:size-10 lg:border-line lg:bg-sunk lg:text-ink"
              >
                {subject.name.trim().charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-display text-white lg:text-[1.25rem] lg:leading-tight lg:text-ink">
                {subject.name}
              </h1>
              {subject.meta && (
                /* white/75 on oxblood is 9.4:1; muted on white is 6.34:1. */
                <p className="truncate text-caption text-white/75 lg:text-muted">{subject.meta}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            {!back && (
              /* Gold as text is only legible on the oxblood plane (7.22:1), so
                 the kicker exists only there. The desktop page header has the
                 sidebar's brand block beside it. */
              <p className="truncate font-display text-eyebrow uppercase text-gold lg:hidden">
                {barn.shortName}
              </p>
            )}
            <h1 className="truncate font-display text-display leading-none text-white lg:text-[1.25rem] lg:font-bold lg:text-ink">
              {title}
            </h1>
          </div>
        )}

        {/* shrink-0 so a full-width control handed in as the action (a
            SheetTrigger) sizes to its label instead of eating the row. */}
        {action && <div className="flex shrink-0 items-center">{action}</div>}
        {bell && <NotificationBell />}
      </div>
      {tabs && (
        <div className={`mx-auto hidden ${BUCKET_FRAME[layout]} lg:block`}>{tabs}</div>
      )}
    </header>
  );
}
