import Link from "next/link";
import { Chip } from "@/components/ui/primitives";
import { Avatar, ROW, ROW_LINK, ROW_META, ROW_TITLE } from "@/components/ui/ListRow";
import { Icon } from "@/components/ui/Icon";
import type { Horse, HorseBasics } from "@/lib/types";

/**
 * A horse, as an editorial row (SPEC §3.4 — never a table on mobile): its
 * photo in a circle, its name in Marcellus, a rule under it. Not a card.
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
  if (!href) return <div className={ROW}>{children}</div>;
  return (
    <Link href={href} className={`${ROW} ${ROW_LINK}`}>
      {children}
      <Icon name="chevron" className="size-4 shrink-0 text-muted" />
    </Link>
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
      <Avatar name={horse.name} src={horse.photo_url} />
      <span className="min-w-0 flex-1">
        <span className={`${ROW_TITLE} text-ink`}>{horse.name}</span>
        {detail && <span className={ROW_META}>{detail}</span>}
        {!horse.active && (
          <span className="mt-1.5 block">
            <Chip value="Retired" icon="clock" tone="neutral" />
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
      <Avatar name={horse.name} src={horse.photo_url} />
      <span className="min-w-0 flex-1">
        <span className={`${ROW_TITLE} text-ink`}>{horse.name}</span>
        {horse.barn_name && horse.barn_name !== horse.name && (
          <span className={ROW_META}>
            &ldquo;{horse.barn_name}&rdquo;
          </span>
        )}
      </span>
    </Frame>
  );
}
