import type { ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * Surfaces, labels and chips — the vocabulary every screen is built from.
 *
 * TWO RULES THAT ARE EASY TO BREAK AND EXPENSIVE TO UNDO:
 *
 *  1. Cards never nest. A card inside a card gives you two competing borders
 *     and a radius that has to fight its parent. When something needs to sit
 *     visually *inside* a card, it is a <Sunk> tile, which is a tint with no
 *     border at all.
 *  2. Nothing here takes a raw colour. Components name tokens (`bg-surface`,
 *     `text-muted`) so a second barn re-skins from config/barn.ts alone.
 */

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A card on the cream ground: white, one hairline, generous radius, and NO
 * shadow. A drop shadow over a warm ground goes muddy; the hairline does the
 * separating and keeps the surface clean.
 */
export function Card({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "li";
}) {
  return (
    <Tag className={`rounded-card border border-line bg-surface ${className}`}>{children}</Tag>
  );
}

/**
 * A card with a charcoal cap — the barn-board look. Used for the one or two
 * groupings on a screen that are genuinely a *board* rather than a section, so
 * it stays a signal instead of decoration.
 */
export function Board({
  label,
  emoji,
  action,
  children,
}: {
  label: string;
  /** Decorative only — always paired with the text label, never replacing it. */
  emoji?: string;
  action?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex items-center gap-2 bg-chrome px-4 py-2.5">
        {emoji && (
          <span aria-hidden="true" className="text-[0.9rem] leading-none">
            {emoji}
          </span>
        )}
        <h2 className="font-display text-eyebrow uppercase text-white">{label}</h2>
        {action && (
          <Link
            href={action.href}
            className="ml-auto text-caption font-medium text-gold underline-offset-4 hover:underline"
          >
            {action.label}
          </Link>
        )}
      </div>
      <div className="flex flex-col gap-3 p-4">{children}</div>
    </section>
  );
}

/** A tile sunk into a card. The answer to "I want a card in my card". */
export function Sunk({
  children,
  className = "",
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: "neutral" | "gold" | "forest" | "danger";
}) {
  const tones = {
    neutral: "bg-sunk text-ink",
    gold: "bg-gold-soft text-ink",
    forest: "bg-forest-soft text-ink",
    danger: "bg-danger-soft text-ink",
  } as const;

  return <div className={`rounded-control p-3 ${tones[tone]} ${className}`}>{children}</div>;
}

/* -------------------------------------------------------------------------- */
/* Headings                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A section heading with an optional action on the right.
 *
 * Note this is a real heading in the condensed face at readable size — NOT a
 * tiny tracked all-caps eyebrow. The eyebrow above every section is the single
 * most recognisable generated-UI tic; here that treatment is reserved for
 * <Board>, where it labels a physical thing.
 */
export function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  /** A quiet right-hand fact: "4", "2 outstanding". */
  count?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex items-baseline gap-3">
      <h2 className="font-display text-heading text-ink">{title}</h2>
      {count && <p className="text-caption text-muted">{count}</p>}
      {action && (
        <Link
          href={action.href}
          className="ml-auto shrink-0 text-label font-medium text-gold-deep underline-offset-4 hover:underline"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Chip                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A pill of fact or status.
 *
 * Two shapes, because a barn screen has two kinds of pill: a labelled fact
 * ("AGE 19y") where the label is quiet and the value is loud, and a bare status
 * ("Overdue"). Status never relies on colour alone — every tone that means
 * something carries an icon too.
 */
export function Chip({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  /** Quiet leading label. Omit for a bare status pill. */
  label?: string;
  value: string;
  icon?: IconName;
  tone?: "neutral" | "gold" | "forest" | "danger";
}) {
  const tones = {
    neutral: "bg-sunk text-ink",
    gold: "bg-gold-soft text-gold-deep",
    forest: "bg-forest-soft text-forest",
    danger: "bg-danger-soft text-danger",
  } as const;

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-chip px-2.5 py-1 ${tones[tone]}`}
    >
      {icon && <Icon name={icon} className="size-3.5 shrink-0" strokeWidth={2} />}
      {label && (
        <span className="font-display text-eyebrow uppercase opacity-70">{label}</span>
      )}
      <span className="truncate text-caption font-semibold">{value}</span>
    </span>
  );
}

/** A row of chips that wraps rather than scrolling sideways. */
export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The empty state.
 *
 * `body` is REQUIRED, deliberately. A bare "No data" is the laziest thing an
 * interface can say; every empty state here has to tell the person what would
 * put something in it. The barn voice is plain and warm — what you'd say
 * leaning on the arena gate, not what a database would say.
 */
export function EmptyState({
  title,
  body,
  emoji,
  action,
}: {
  title: string;
  body: string;
  /** Decorative. Never the only thing in the box. */
  emoji?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-line bg-surface/60 px-4 py-6 text-center">
      {emoji && (
        <p aria-hidden="true" className="mb-1 text-xl leading-none">
          {emoji}
        </p>
      )}
      <p className="font-display text-heading text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-[38ch] text-caption text-muted">{body}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Callout                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A tinted notice. Full border and a tint — never a thick left stripe, which
 * is the tell of a component that wanted to be a card and gave up.
 */
export function Callout({
  tone = "gold",
  icon,
  children,
}: {
  tone?: "gold" | "forest" | "danger";
  icon?: IconName;
  children: ReactNode;
}) {
  const tones = {
    gold: "border-gold/45 bg-gold-soft text-ink",
    forest: "border-forest/25 bg-forest-soft text-ink",
    danger: "border-danger/30 bg-danger-soft text-ink",
  } as const;
  const iconTones = { gold: "text-gold-deep", forest: "text-forest", danger: "text-danger" } as const;

  return (
    <div className={`flex gap-2.5 rounded-control border p-3 ${tones[tone]}`}>
      {icon && <Icon name={icon} className={`mt-0.5 size-5 shrink-0 ${iconTones[tone]}`} />}
      <div className="min-w-0 flex-1 text-caption">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Definition list                                                             */
/* -------------------------------------------------------------------------- */

/** Label-and-value facts. Wraps rather than truncating — a barn name is data. */
export function FactList({ facts }: { facts: [string, string][] }) {
  if (facts.length === 0) return null;

  return (
    <dl className="flex flex-col gap-1.5">
      {facts.map(([label, value]) => (
        <div key={label} className="flex gap-3 text-caption">
          <dt className="w-24 shrink-0 text-muted">{label}</dt>
          <dd className="min-w-0 flex-1 break-words font-medium text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
