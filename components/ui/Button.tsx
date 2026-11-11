import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * Buttons.
 *
 * SENTENCE CASE (2026-11-11, David's UI pass). Barlow 15px semibold, no
 * letter-spacing: "Publish", "Edit details", "Add videos". All-caps condensed
 * type is ONLY for small labels — group labels, table headers, status pills —
 * never for something you press. (It was condensed, uppercase and tracked
 * like signage; at a button's size that read as shouting.)
 *
 *   SQUARED — 5px, not 999px. A pill is a lozenge; this is a made object.
 *   TACTILE — a dark inset lip along the bottom edge of the primary, and on
 *     press it drops 1px, so the surface moves under a thumb.
 *   DIRECTIONAL — a primary that goes somewhere can carry a trailing arrow.
 *
 * ONE PRIMARY PER SCREEN. A second filled button competes with the first and
 * neither wins: everything else is secondary (an ink outline) or a text
 * button (ghost).
 */
type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  // The one gold surface. Ink label at 9.26:1.
  primary:
    "bg-accent text-accent-on border-transparent shadow-press " +
    "active:bg-accent/85 active:shadow-press-active active:translate-y-px",
  // Outline. Transparent, ink label, an INK edge at 50% — 3.24:1 on the
  // ground, 3.34:1 on white, past the 3:1 a control's boundary needs. It was
  // `border-line`, 1.10:1 on the ground: no edge at all, so a secondary button
  // read as a stray label, and SheetTrigger's white version read as a card.
  secondary:
    "bg-transparent text-ink border-ink/50 active:bg-sunk active:translate-y-px lg:hover:bg-surface",
  // Text with an underline on press. For the third action on a screen.
  ghost:
    "bg-transparent text-ink border-transparent underline underline-offset-4 decoration-line active:decoration-ink",
  // Destructive stays a ghost too — a filled red button invites the tap it
  // is trying to make you think about.
  danger:
    "bg-transparent text-danger border-danger/35 active:bg-danger-soft active:translate-y-px",
};

const BASE =
  "inline-flex items-center gap-2 rounded-control border " +
  "transition-[transform,background-color,box-shadow] duration-100 ease-out " +
  "disabled:pointer-events-none disabled:opacity-50";

/**
 * Two sizes, because a menu row is not a button that happens to be wide.
 *
 * `default` is the button: sentence case, centred, 48px on a phone and 44px
 * on the desk.
 *
 * `menu` is what a quiet overflow sheet is built from — sentence case, left
 * aligned, in the reading face, so a long plain label ("Generate lessons from
 * the weekly schedule") reads as an option rather than a billboard.
 */
type Size = "default" | "menu" | "sm";

const SIZES: Record<Size, string> = {
  // 48px under a thumb; 44px on the desk — the touch floor holds in both
  // shells (David's UI pass, 2026-11-11: it was 40px there).
  default:
    "min-h-12 justify-center px-5 lg:min-h-11 lg:px-4 " +
    "font-sans text-[0.9375rem] font-semibold leading-none tracking-normal",
  menu: "min-h-14 justify-start px-4 py-2.5 text-left text-body font-semibold leading-snug",
  // A control inside a desktop table row: 32px, the reading face, sentence
  // case. Only for the desktop register — the phone keeps its 44px+ targets.
  sm: "min-h-8 justify-center px-3 text-table font-semibold leading-none",
};

/**
 * The class string for a button of this variant and size — for a control that
 * cannot BE a <Button> (SheetTrigger's opener, a plain <a> download) but must
 * look exactly like one. A button looks like a button, everywhere.
 */
export function buttonClass(variant: Variant = "secondary", size: Size = "default", block = false): string {
  return `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${block ? "w-full" : ""}`;
}

export function Button({
  children,
  variant = "secondary",
  size = "default",
  icon,
  /** Trailing arrow. On by default for primary — the tap goes somewhere. */
  arrow,
  block = false,
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  arrow?: boolean;
  block?: boolean;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const showArrow = arrow ?? (size === "default" && variant === "primary");

  return (
    <button
      className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${block ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} className="size-4.5 shrink-0" strokeWidth={2} />}
      {size === "menu" ? <span className="min-w-0 flex-1">{children}</span> : children}
      {showArrow && <Icon name="arrow" className="size-4 shrink-0" strokeWidth={2} />}
    </button>
  );
}

/** The same shape as a link, so a row of actions lines up exactly. */
export function ButtonLink({
  children,
  href,
  variant = "secondary",
  size = "default",
  icon,
  arrow,
  block = false,
  className = "",
}: {
  children: ReactNode;
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  arrow?: boolean;
  block?: boolean;
  className?: string;
}) {
  const showArrow = arrow ?? (size === "default" && variant === "primary");

  return (
    <Link
      href={href}
      className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${block ? "w-full" : ""} ${className}`}
    >
      {icon && <Icon name={icon} className="size-4.5 shrink-0" strokeWidth={2} />}
      {size === "menu" ? <span className="min-w-0 flex-1">{children}</span> : children}
      {showArrow && <Icon name="arrow" className="size-4 shrink-0" strokeWidth={2} />}
    </Link>
  );
}
