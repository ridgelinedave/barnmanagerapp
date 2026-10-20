import type { ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { FaceImage } from "@/components/ui/FaceImage";

/**
 * THE EDITORIAL ROW (2026-10-19) — the one list row in the app.
 *
 * It replaced the most generated-looking pattern the app had: a white card
 * holding a grey rounded square with an icon in it, a label and a chevron.
 * Now a row is type on the ground with a rule under it:
 *
 *   - no card, no fill, no icon chip;
 *   - a hairline (`border-rule`, 1.42:1 on the blush) between rows;
 *   - the name in MARCELLUS — the thing read first;
 *   - metadata in Barlow Condensed, muted;
 *   - the chevron small and muted.
 *
 * Where the row IS a horse or a person, the left element is their PHOTO in a
 * circle (`Avatar`), falling back to their initial — never an icon. Anything
 * else has no leading element at all; an icon beside "Supplies" told nobody
 * anything the word did not.
 *
 * The WHOLE row is the target, not the chevron: 56px tall on a phone, 44px on
 * a desk. Rows butt: put them in `RowList`, not a gapped flex column, or the
 * rules float.
 */
export const ROW =
  "flex min-h-14 w-full items-center gap-3 border-b border-rule py-2.5 text-left lg:min-h-11 lg:py-1.5";

/** The hover and press state for a row that is a link. Never moves the layout. */
export const ROW_LINK =
  "transition-colors duration-150 ease-out active:bg-surface/70 lg:hover:bg-surface/70";

/** The row's name: Marcellus, the thing read first. */
export const ROW_TITLE = "block font-display text-heading leading-snug";

/** The row's metadata line: Barlow Condensed, muted. */
export const ROW_META = "mt-0.5 block font-condensed text-label font-medium text-muted lg:mt-0";

/**
 * The initial for a face with no photo: the first LETTER OR DIGIT, so a name
 * like "[demo] Dakota" shows "D", not "[".
 */
export function initialOf(name: string): string {
  return (name.match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase();
}

/** A list of rows: no gap between them, so the rules run on. */
export function RowList({ children, as: Tag = "div" }: { children: ReactNode; as?: "div" | "ul" | "ol" }) {
  return <Tag className="flex flex-col">{children}</Tag>;
}

/**
 * A horse's or a person's face. Their photo in a CIRCLE where there is one —
 * people know these animals by sight — else their initial in Marcellus on a
 * TINTED ground (accent-tint carrying accent-text, 13.27:1). It replaced the
 * grey initial squares. The circle is the one exception to the 6px radius
 * cap, and only for a face.
 */
export function Avatar({
  name,
  src,
  size = "md",
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = { sm: "size-9", md: "size-11", lg: "size-14" } as const;
  const text = { sm: "text-label", md: "text-heading", lg: "text-title" } as const;

  const initials = (
    <span
      aria-hidden="true"
      className={`${sizes[size]} ${text[size]} flex shrink-0 items-center justify-center rounded-full bg-accent-tint font-display text-accent-text`}
    >
      {initialOf(name)}
    </span>
  );

  // A dead photo URL falls back to the initial instead of a broken-image glyph.
  if (src) {
    return (
      <FaceImage
        src={src}
        className={`${sizes[size]} shrink-0 rounded-full border border-rule object-cover`}
        fallback={initials}
      />
    );
  }

  return initials;
}

export function ListRow({
  title,
  meta,
  href,
  leading,
  chips,
  trailing,
  muted = false,
}: {
  title: string;
  /** One quiet line under the title. Keep it to facts. */
  meta?: string;
  href?: string;
  /** An `Avatar`, for a horse or a person. Nothing else goes here. */
  leading?: ReactNode;
  /** A <ChipRow> of status. Wraps under the title on a narrow screen. */
  chips?: ReactNode;
  /** Replaces the chevron — a count, a time, an action. */
  trailing?: ReactNode;
  muted?: boolean;
}) {
  const body = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className={`${ROW_TITLE} ${muted ? "text-muted" : "text-ink"}`}>{title}</span>
        {meta && <span className={ROW_META}>{meta}</span>}
        {chips && <span className="mt-1.5 block lg:mt-1">{chips}</span>}
      </span>
      {trailing ?? (href && <Icon name="chevron" className="size-4 shrink-0 text-muted" />)}
    </>
  );

  if (!href) return <div className={ROW}>{body}</div>;

  return (
    <Link href={href} className={`${ROW} ${ROW_LINK}`}>
      {body}
    </Link>
  );
}

/** A compact row for inside a card — no border, no card of its own. */
export function InlineRow({
  label,
  value,
  icon,
  tone = "ink",
}: {
  label: string;
  value?: string;
  icon?: IconName;
  tone?: "ink" | "muted" | "danger" | "forest";
}) {
  const tones = {
    ink: "text-ink",
    muted: "text-muted",
    danger: "text-danger",
    forest: "text-forest",
  } as const;

  return (
    <div className="flex items-center gap-2.5 text-caption">
      {icon && <Icon name={icon} className={`size-4 shrink-0 ${tones[tone]}`} />}
      <span className={`min-w-0 flex-1 break-words ${tones[tone]}`}>{label}</span>
      {value && <span className="shrink-0 font-semibold text-ink">{value}</span>}
    </div>
  );
}
