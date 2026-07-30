import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { barn } from "@/config/barn";
import { NotificationBell } from "@/components/NotificationBell";
import { Icon } from "@/components/ui/Icon";

/**
 * The app header: a charcoal plane the content scrolls under.
 *
 * The charcoal is the barn's own — it is the field the gold crest sits on, on
 * the sign and on the launch screen — so opening the app lands you somewhere
 * recognisable rather than on another white page with a grey title.
 *
 * Three shapes, one component:
 *   root      the crest, the barn name, the screen title, the bell
 *   back      a back arrow and a title, for a screen you drilled into
 *   subject   back arrow, a photo, a name and two lines of fact — the horse
 *             profile, where the animal deserves to be the header
 */
export function AppHeader({
  title,
  back,
  action,
  subject,
  bell = true,
}: {
  title: string;
  /** href to return to. Present = drilled-in screen. */
  back?: string;
  /** One contextual control on the right. */
  action?: ReactNode;
  subject?: { name: string; meta?: string; photoUrl?: string | null };
  bell?: boolean;
}) {
  return (
    <header className="safe-top sticky top-0 z-30 bg-chrome shadow-chrome">
      <div className="mx-auto flex max-w-screen-sm items-center gap-3 px-4 py-3">
        {back ? (
          <Link
            href={back}
            aria-label="Back"
            className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-chip text-white/85"
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
            className="size-9 shrink-0"
          />
        )}

        {subject ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {subject.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed
              // storage URL, per-request; not a static asset the loader can cache.
              <img
                src={subject.photoUrl}
                alt=""
                className="size-12 shrink-0 rounded-full border border-white/20 object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gold font-display text-title font-bold text-ink"
              >
                {subject.name.trim().charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-display text-white">{subject.name}</h1>
              {subject.meta && (
                <p className="truncate text-caption text-white/70">{subject.meta}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            {!back && (
              <p className="truncate font-display text-eyebrow uppercase text-gold">
                {barn.shortName}
              </p>
            )}
            <h1 className="truncate font-display text-display leading-none text-white">{title}</h1>
          </div>
        )}

        {action}
        {bell && <NotificationBell />}
      </div>
    </header>
  );
}
