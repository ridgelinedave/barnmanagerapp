import type { ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * Surfaces, labels and chips — the vocabulary every screen is built from.
 *
 * RULES THAT ARE EASY TO BREAK AND EXPENSIVE TO UNDO:
 *
 *  1. Cards never nest. A card inside a card gives you two competing borders
 *     and a radius that has to fight its parent. When something needs to sit
 *     visually *inside* a card, it is a <Sunk> tile, which is a tint with no
 *     border at all.
 *  2. Nothing here takes a raw colour. Components name tokens (`bg-surface`,
 *     `text-muted`) so a second barn re-skins from config/barn.ts alone.
 *  3. THE ACCENT IS NOT DECORATION (2026-10 aesthetics pass). It marks the
 *     primary button and the active nav item and nothing else. Nothing in this
 *     file uses it: no oxblood card edge, no oxblood heading, no oxblood chip.
 *     A colour that is on everything stops meaning "act here".
 *  4. No elevation shadow, no radius above 6px. A hairline separates; a small
 *     corner reads as a made object.
 */

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A white panel on the blush ground, separated by a 1px hairline and nothing
 * else.
 *
 * CARDS ARE FOR THINGS THAT ARE GENUINELY A CARD — a horse, a person, an
 * announcement, a lesson you might cancel. A list of facts, a set of controls
 * or a table of contents is rows, not a stack of cards; the identical-card
 * column is what made this app read as generated.
 *
 * The oxblood left edge and the tinted shadow that used to sit here are gone:
 * the shadow was elevation, and the edge was the accent used as ornament.
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
 * A panel with a labelled cap — the barn-board look. Used for the one or two
 * groupings on a screen that are genuinely a *board* rather than a section.
 *
 * The cap is the 11px label over a hairline, not a tinted bar: a wash of the
 * accent under a heading was the accent as decoration.
 */
export function Board({
  label,
  action,
  children,
}: {
  label: string;
  action?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <h2 className="font-sans text-micro uppercase text-muted">{label}</h2>
        {action && (
          /* The hit area is 44px even though the label is small: padding plus a
             negative margin gives the finger a real target without inflating
             the bar. A text link that only looks tappable is not tappable. */
          <Link
            href={action.href}
            className="-my-2.5 ml-auto flex min-h-11 shrink-0 items-center text-caption font-medium text-ink underline underline-offset-4"
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
  // `gold` is the gold TINT as a ground — decorative, never text, never the
  // accent. It used to be the accent tint, which put oxblood where nothing
  // was to be pressed.
  const tones = {
    neutral: "bg-sunk text-ink",
    gold: "bg-gold-tint text-ink",
    forest: "bg-forest-soft text-ink",
    danger: "bg-danger-soft text-ink",
  } as const;

  return <div className={`rounded-control p-3 ${tones[tone]} ${className}`}>{children}</div>;
}

/* -------------------------------------------------------------------------- */
/* Headings                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A section label: 11px uppercase letterspaced muted, LEFT aligned, over a
 * hairline that runs the width of the section.
 *
 * It used to be an oxblood heading in the condensed face with a short gold
 * rule — a display treatment on every section, so nothing on a screen was
 * louder than anything else. A section label is structure, and structure is
 * quiet; the screen title is where the display face earns its place.
 */
export function SectionHeader({
  title,
  count,
  action,
  id,
}: {
  title: string;
  /** For a control elsewhere that is labelled by this heading. */
  id?: string;
  /** A quiet right-hand fact: "4", "2 outstanding". */
  count?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-line pb-1.5">
      <h2 id={id} className="font-sans text-micro uppercase text-muted">{title}</h2>
      {count && <p className="text-micro text-muted tabular-nums">{count}</p>}
      {action && (
        /* 44px hit area on a phone, by padding and a negative margin. */
        <Link
          href={action.href}
          className="-my-3 ml-auto flex min-h-11 shrink-0 items-center text-caption font-medium text-ink underline underline-offset-4 lg:min-h-0 lg:my-0"
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
 * A status or a labelled fact.
 *
 * OUTLINED, NOT FILLED: 11px uppercase, a 1px border in the status colour,
 * transparent fill. A solid pastel pill reads as a sticker and, stacked three
 * to a row, as noise; an outlined label reads as a label.
 *
 * Status never relies on colour alone — every tone that means something keeps
 * the icon it carries. Every tone's colour is AA as 11px text on white and on
 * the blush ground: muted 6.34:1, gold-deep 6.67:1, forest and danger higher.
 * `gold` is gold-DEEP, never gold, which is 2.19:1 and decorative only.
 */
export function Chip({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  /** Quiet leading label. Omit for a bare status. */
  label?: string;
  value: string;
  icon?: IconName;
  tone?: "neutral" | "gold" | "forest" | "danger";
}) {
  const tones = {
    neutral: "border-muted/60 text-muted",
    gold: "border-gold-deep/70 text-gold-deep",
    forest: "border-forest/70 text-forest",
    danger: "border-danger/70 text-danger",
  } as const;

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-chip border bg-transparent px-1.5 py-0.5 text-micro uppercase ${tones[tone]}`}
    >
      {icon && <Icon name={icon} className="size-3 shrink-0" strokeWidth={2} />}
      {label && <span className="opacity-80">{label}</span>}
      <span className="truncate">{value}</span>
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
 * The empty state: ONE short factual line, left-aligned, where the content
 * would have started — "No horses yet." There is deliberately no body: an
 * empty state is not an invitation or an explanation (CLAUDE.md, copy rule 4).
 * If the add button is on screen, the line does not mention it.
 */
export function EmptyState({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  const line = /[.!?…]$/.test(title.trim()) ? title.trim() : `${title.trim()}.`;

  return (
    <div className="flex flex-col items-start gap-2 py-1">
      <p className="text-label text-muted">{line}</p>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Callout                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A notice: a full hairline border and a quiet ground — never a thick left
 * stripe, which is the tell of a component that wanted to be a card and gave
 * up. The `gold` tone (the default, used for "worth knowing") is neutral now:
 * it used to be the accent tint, i.e. oxblood on something nobody presses.
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
    gold: "border-line bg-sunk text-ink",
    forest: "border-forest/30 bg-forest-soft text-ink",
    danger: "border-danger/30 bg-danger-soft text-ink",
  } as const;
  const iconTones = { gold: "text-muted", forest: "text-forest", danger: "text-danger" } as const;

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
