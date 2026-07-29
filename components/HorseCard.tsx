import Link from "next/link";
import type { Horse, HorseBasics } from "@/lib/types";

/**
 * A horse, as a card (SPEC §3.4 — never a table on mobile).
 *
 * Two shapes on purpose, because the app has two kinds of horse row and they
 * are NOT the same object with different fields filled in:
 *
 *   <HorseCard>       a full horse row, from the horses table
 *   <HorseBasicsCard> the basics projection, which cannot carry breed or notes
 *
 * Keeping them apart means no template can accidentally reach for `notes` on a
 * row that will never have one, and reviewing "does this screen leak?" is a
 * matter of reading which component it renders.
 */
function Frame({
  href,
  children,
}: {
  href?: string;
  children: React.ReactNode;
}) {
  const className =
    "flex min-h-16 w-full items-center gap-3 rounded-2xl border border-brand-ink/15 bg-white p-4 text-left";

  if (!href) return <div className={className}>{children}</div>;
  return (
    <Link href={href} className={className}>
      {children}
      <span aria-hidden="true" className="shrink-0 text-brand-ink/40">
        ›
      </span>
    </Link>
  );
}

/** The horse's initial in a gold disc. Stands in for a photo we may not have. */
function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-gold text-lg font-semibold text-brand-ink"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function HorseCard({
  horse,
  href,
  ownerLabel,
  riderCount,
}: {
  horse: Horse;
  href?: string;
  /** "Barn horse" or the owning family's name. Admin and staff surfaces only. */
  ownerLabel?: string;
  riderCount?: number;
}) {
  const detail = [
    horse.barn_name && horse.barn_name !== horse.name ? `"${horse.barn_name}"` : null,
    horse.breed,
    ownerLabel,
    typeof riderCount === "number"
      ? `${riderCount} rider${riderCount === 1 ? "" : "s"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Frame href={href}>
      <Avatar name={horse.name} />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold leading-snug">{horse.name}</span>
        {detail && <span className="mt-0.5 block text-sm text-brand-ink/70">{detail}</span>}
        {!horse.active && (
          <span className="mt-1 inline-block rounded-full bg-brand-ink/10 px-2 py-0.5 text-[11px] font-semibold text-brand-ink/70">
            Retired
          </span>
        )}
      </span>
    </Frame>
  );
}

/**
 * The basics tier. Never links anywhere: there is no detail page to show,
 * because there are no further details this family is entitled to.
 */
export function HorseBasicsCard({ horse }: { horse: HorseBasics }) {
  return (
    <Frame>
      <Avatar name={horse.name} />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold leading-snug">{horse.name}</span>
        {horse.barn_name && horse.barn_name !== horse.name && (
          <span className="mt-0.5 block text-sm text-brand-ink/70">&ldquo;{horse.barn_name}&rdquo;</span>
        )}
      </span>
    </Frame>
  );
}
