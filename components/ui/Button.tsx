import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * Buttons.
 *
 * DE-AI'd, deliberately. The generated-app button is a full pill with a flat
 * fill and a centred sentence-case label, and it is the single most
 * recognisable tell in the whole interface. This one is built the other way:
 *
 *   SQUARED — 5px, not 999px. A pill is a lozenge; this is a made object.
 *   CONDENSED, UPPERCASE, TRACKED — Barlow Condensed 700 at 2px letter-spacing.
 *     The label reads like signage, which is what a barn is full of.
 *   TACTILE — a dark inset lip along the bottom edge, and on press the button
 *     drops 1px and the lip shortens, so the surface genuinely moves under a
 *     thumb rather than just changing colour.
 *   DIRECTIONAL — primary actions can carry a trailing arrow. It says the tap
 *     goes somewhere, which is true of almost every primary action here.
 *
 * SECONDARY IS NOT A GREY PILL. A second filled button competes with the first
 * and neither wins; secondary is a ghost with a hairline, and tertiary is a
 * plain underline. There is exactly one filled gold button per screen.
 */
type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  // The one gold surface. Ink label at 9.26:1.
  primary:
    "bg-accent text-accent-on border-transparent shadow-press " +
    "active:bg-accent/85 active:shadow-press-active active:translate-y-px",
  // Ghost. A hairline and ink — not a filled grey box pretending to be a button.
  secondary:
    "bg-transparent text-ink border-line active:bg-sunk active:translate-y-px",
  // Text with an underline on press. For the third action on a screen.
  ghost:
    "bg-transparent text-accent-text border-transparent underline-offset-4 active:underline",
  // Destructive stays a ghost too — a filled red button invites the tap it
  // is trying to make you think about.
  danger:
    "bg-transparent text-danger border-danger/35 active:bg-danger-soft active:translate-y-px",
};

const BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-control border px-5 " +
  "font-display text-[1.0625rem] font-bold uppercase tracking-[0.11em] leading-none " +
  "transition-[transform,background-color,box-shadow] duration-100 ease-out " +
  "disabled:pointer-events-none disabled:opacity-50";

export function Button({
  children,
  variant = "secondary",
  icon,
  /** Trailing arrow. On by default for primary — the tap goes somewhere. */
  arrow,
  block = false,
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: Variant;
  icon?: IconName;
  arrow?: boolean;
  block?: boolean;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const showArrow = arrow ?? variant === "primary";

  return (
    <button
      className={`${BASE} ${VARIANTS[variant]} ${block ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} className="size-4.5 shrink-0" strokeWidth={2} />}
      {children}
      {showArrow && <Icon name="arrow" className="size-4 shrink-0" strokeWidth={2} />}
    </button>
  );
}

/** The same shape as a link, so a row of actions lines up exactly. */
export function ButtonLink({
  children,
  href,
  variant = "secondary",
  icon,
  arrow,
  block = false,
  className = "",
}: {
  children: ReactNode;
  href: string;
  variant?: Variant;
  icon?: IconName;
  arrow?: boolean;
  block?: boolean;
  className?: string;
}) {
  const showArrow = arrow ?? variant === "primary";

  return (
    <Link
      href={href}
      className={`${BASE} ${VARIANTS[variant]} ${block ? "w-full" : ""} ${className}`}
    >
      {icon && <Icon name={icon} className="size-4.5 shrink-0" strokeWidth={2} />}
      {children}
      {showArrow && <Icon name="arrow" className="size-4 shrink-0" strokeWidth={2} />}
    </Link>
  );
}
