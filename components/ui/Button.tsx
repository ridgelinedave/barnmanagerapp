import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * Buttons.
 *
 * Four variants and no more. `primary` is the gold surface carrying ink — the
 * pairing sampled from the sign and measured at 7.61:1 — and there is exactly
 * ONE of them per screen. Everything else is secondary, ghost, or danger.
 *
 * Height floor is 48px (`min-h-12`), comfortably over the 44px minimum, because
 * these are pressed in gloves.
 */
type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-gold text-ink border-transparent",
  secondary: "bg-surface text-ink border-line",
  ghost: "bg-transparent text-gold-deep border-transparent",
  danger: "bg-surface text-danger border-danger/35",
};

const BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-control border px-4 " +
  "text-label font-semibold transition-[transform,opacity,background-color] duration-150 " +
  "ease-out active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50";

export function Button({
  children,
  variant = "secondary",
  icon,
  block = false,
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: Variant;
  icon?: IconName;
  /** Full-width. The default on mobile forms; not for inline actions. */
  block?: boolean;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`${BASE} ${VARIANTS[variant]} ${block ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} className="size-4.5 shrink-0" strokeWidth={2} />}
      {children}
    </button>
  );
}

/** The same shape as a link. Kept identical so a row of actions lines up. */
export function ButtonLink({
  children,
  href,
  variant = "secondary",
  icon,
  block = false,
  className = "",
}: {
  children: ReactNode;
  href: string;
  variant?: Variant;
  icon?: IconName;
  block?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`${BASE} ${VARIANTS[variant]} ${block ? "w-full" : ""} ${className}`}
    >
      {icon && <Icon name={icon} className="size-4.5 shrink-0" strokeWidth={2} />}
      {children}
    </Link>
  );
}
