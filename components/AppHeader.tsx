import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { barn } from "@/config/barn";
import { NotificationBell } from "@/components/NotificationBell";
import { Icon } from "@/components/ui/Icon";
import { FaceImage } from "@/components/ui/FaceImage";
import { initialOf } from "@/components/ui/ListRow";
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
 * Contrast: white title on #4A002A is 15.85:1; the badge is gold carrying ink
 * at 7.92:1. Gold is the HAIRLINE under the bar and never text — the barn-name
 * kicker that used to sit over the title in gold is gone (2026-10-19).
 *
 * 56px ON A PHONE (2026-10-19). It was crest + kicker + a 31px title, about a
 * sixth of the screen for two words, and a long title wrapped to two lines.
 * Now one row: a 28px crest or the 44px back target, the title in Marcellus
 * at 19px on ONE line (truncated, never wrapped), the bell.
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
  variant = "default",
  meta,
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
  /**
   * `board`: the feed board's header — oxblood at EVERY width (the desktop
   * shell's white header would make a wall board read as a web page), 56px,
   * a 1px gold hairline, the title at 20px from md up with 0.04em tracking.
   */
  variant?: "default" | "board";
  /** A quiet right-hand fact in the header: the board's clock. */
  meta?: ReactNode;
}) {
  const board = variant === "board";
  const headerClass = board
    ? "safe-top sticky top-0 z-30 border-b border-gold bg-deep"
    : "safe-top sticky top-0 z-30 border-b-2 border-gold bg-deep lg:border-b lg:border-line lg:bg-surface";
  const rowHeight = board ? "min-h-14 py-1.5" : "min-h-14 py-1.5 lg:min-h-18 lg:py-3";
  const backTone = board ? "text-white lg:hover:bg-white/10" : "text-white lg:text-muted lg:hover:bg-sunk lg:hover:text-ink";
  const titleClass = board
    ? "truncate font-display text-[1.1875rem] leading-tight tracking-[0.04em] text-white md:text-[1.25rem]"
    : "truncate font-display text-[1.1875rem] leading-tight text-white lg:text-[1.375rem] lg:text-ink";
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
      className={headerClass}
    >
      {/* lg:min-h-18 pins the row to one height on the desktop shell (72px +
          the 1px border = the sidebar masthead), so the two line up whichever
          header shape a screen uses. */}
      <div className={`mx-auto flex ${rowHeight} ${BUCKET_FRAME[layout]} items-center gap-2.5 lg:gap-3`}>
        {back ? (
          <Link
            href={back}
            aria-label="Back"
            className={`-ml-2 flex size-11 shrink-0 items-center justify-center rounded-control lg:size-9 ${backTone}`}
          >
            <Icon name="back" className="size-5.5" strokeWidth={2} />
          </Link>
        ) : (
          <Image
            src={barn.brand.logoSrc}
            alt=""
            width={28}
            height={28}
            priority
            className="size-7 shrink-0 lg:hidden"
          />
        )}

        {subject ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {(() => {
              const initials = (
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15 font-display text-heading text-white lg:bg-accent-tint lg:text-accent-text"
                >
                  {initialOf(subject.name)}
                </span>
              );
              // A signed, per-request URL; a dead one falls back to the initial.
              return subject.photoUrl ? (
                <FaceImage
                  src={subject.photoUrl}
                  className="size-10 shrink-0 rounded-full border border-white/30 object-cover lg:border-rule"
                  fallback={initials}
                />
              ) : (
                initials
              );
            })()}
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-[1.1875rem] leading-tight text-white lg:text-[1.375rem] lg:text-ink">
                {subject.name}
              </h1>
              {subject.meta && (
                /* white/75 on oxblood is 9.4:1; muted on white is 6.34:1. */
                <p className="truncate font-condensed text-label font-medium text-white/75 lg:text-muted">{subject.meta}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <h1 className={titleClass}>{title}</h1>
          </div>
        )}

        {meta}

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
