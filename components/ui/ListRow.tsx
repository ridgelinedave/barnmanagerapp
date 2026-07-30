import type { ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * The workhorse row: something to identify, something to know about it, and a
 * way in.
 *
 * The WHOLE row is the target, not the chevron — a 56px-tall row you can hit
 * anywhere beats a 24px arrow you have to aim at, which is most of what makes
 * a list feel native rather than web.
 *
 * `Avatar` takes the horse's photo where there is one and falls back to its
 * initial on gold. A real photo is worth more than any icon on a screen full
 * of animals people know by sight.
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
  const text = { sm: "text-caption", md: "text-heading", lg: "text-title" } as const;

  if (src) {
    /* Storage URLs are signed per request and differ per viewer, so next/image
       cannot cache or optimise them — it would proxy a one-time URL. */
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={src}
        alt=""
        className={`${sizes[size]} shrink-0 rounded-full border border-line object-cover`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${sizes[size]} ${text[size]} flex shrink-0 items-center justify-center rounded-full bg-gold font-display font-bold text-ink`}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
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
        <span
          className={`block font-display text-heading leading-snug ${muted ? "text-muted" : "text-ink"}`}
        >
          {title}
        </span>
        {meta && <span className="mt-0.5 block text-caption text-muted">{meta}</span>}
        {chips && <span className="mt-1.5 block">{chips}</span>}
      </span>
      {trailing ?? (href && <Icon name="chevron" className="size-5 shrink-0 text-muted" />)}
    </>
  );

  const shell =
    "flex min-h-14 w-full items-center gap-3 rounded-card border border-line bg-surface p-3.5 text-left";

  if (!href) return <div className={shell}>{body}</div>;

  return (
    <Link
      href={href}
      className={`${shell} transition-transform duration-150 ease-out active:scale-[0.99]`}
    >
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
