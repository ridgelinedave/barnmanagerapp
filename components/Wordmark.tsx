import { monarch } from "@/config/barn";

/**
 * The Monarch wordmark. THE ONLY PLACE CINZEL IS USED.
 *
 * Monarch is the product; a barn is a skin on it. Inside a barn's app the
 * barn's own brand leads — their crest, their accent — and Monarch sits
 * lightly at the edges, which is what this component is for: a quiet product
 * signature, not a second logo competing with the barn's.
 *
 * Wordmark only, no icon, per §16a. Cinzel is a Roman inscription face, so it
 * is set in caps with wide tracking — that is how the letterforms were drawn
 * to be seen, and it is also why it is kept away from every screen title in
 * the app, where it would be slow to read.
 */
export function Wordmark({
  size = "sm",
  tone = "muted",
}: {
  size?: "sm" | "md" | "lg";
  /** `muted` for a signature at the edge; `accent` when it is the subject. */
  tone?: "muted" | "accent" | "ink";
}) {
  const sizes = {
    sm: "text-[0.75rem] tracking-[0.34em]",
    md: "text-[1.125rem] tracking-[0.3em]",
    lg: "text-[2rem] tracking-[0.26em]",
  } as const;

  const tones = {
    muted: "text-muted",
    accent: "text-accent-text",
    ink: "text-ink",
  } as const;

  return (
    <span className={`font-wordmark font-semibold uppercase ${sizes[size]} ${tones[tone]}`}>
      {monarch.name}
    </span>
  );
}

/**
 * "Powered by Monarch" — the edge signature.
 *
 * Deliberately small and quiet. A barn's members should feel they are in their
 * barn's app; this is the maker's mark on the underside, not a banner.
 */
export function PoweredByMonarch({ className = "" }: { className?: string }) {
  return (
    <p className={`flex items-center justify-center gap-1.5 text-caption text-muted ${className}`}>
      <span>Powered by</span>
      <Wordmark size="sm" tone="muted" />
    </p>
  );
}
