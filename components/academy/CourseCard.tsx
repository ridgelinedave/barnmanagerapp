import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/Button";
import { FaceImage } from "@/components/ui/FaceImage";

/**
 * A course in the Academy grid — Circle's STRUCTURE, the Monarch LOOK.
 *
 * Circle: a landscape cover, the title, then either Enroll or a progress bar
 * with "N% complete". Here: a 16:9 cover at the 6px radius cap with a rule
 * edge and no shadow, the title in Marcellus, and the action in the house
 * button. The barn's identity arrives through the cover itself — Crouse's
 * covers already carry the CE crest and gold title bands — so the card adds
 * no colour of its own.
 *
 * Presentational only: typed props, no data access. The page hands in the
 * enrol server action and the hrefs.
 */
export type CourseCardProps = {
  id: string;
  title: string;
  /** Signed cover URL, or null for none (a tinted block, never a broken image). */
  coverSrc: string | null;
  /** The course page. */
  href: string;
  enrolled: boolean;
  /** 0-100, completed published lessons over published lessons. */
  percent: number;
  /** The next incomplete lesson, or the course page when all are done. */
  continueHref: string | null;
  /** Server action that enrols the viewer; receives `module_id`. */
  enrollAction?: (formData: FormData) => void | Promise<void>;
  /** "Draft" for the admin's view of an unpublished course. */
  badge?: string;
};

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="flex flex-col gap-1">
      {/* Track: brand.rule (#D8C6CB); fill: the accent. The bar is not the
          only signal — the percentage is written beside it. */}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Course progress"}
        className="h-1.5 w-full overflow-hidden rounded-full bg-rule"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${value}%` }} />
      </div>
      <span className="font-condensed text-label font-medium tabular-nums text-muted">{value}% complete</span>
    </div>
  );
}

export function CourseCover({ src, title, className = "" }: { src: string | null; title: string; className?: string }) {
  const empty = (
    <span
      aria-hidden="true"
      className={`flex aspect-video w-full items-center justify-center rounded-control bg-accent-tint font-display text-display text-accent-text ${className}`}
    >
      {title.trim().charAt(0).toUpperCase()}
    </span>
  );
  if (!src) return empty;
  return (
    <FaceImage
      src={src}
      className={`aspect-video w-full rounded-control border border-rule object-cover ${className}`}
      fallback={empty}
    />
  );
}

export function CourseCard({
  id,
  title,
  coverSrc,
  href,
  enrolled,
  percent,
  continueHref,
  enrollAction,
  badge,
}: CourseCardProps) {
  return (
    <article className="flex flex-col gap-3">
      <Link href={href} className="flex flex-col gap-2.5 rounded-control lg:hover:opacity-90" aria-label={title}>
        <CourseCover src={coverSrc} title={title} />
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 font-display text-title leading-tight text-ink">{title}</span>
          {badge && (
            <span className="shrink-0 rounded-chip border border-muted/60 px-1.5 py-0.5 font-condensed text-micro uppercase text-muted">
              {badge}
            </span>
          )}
        </span>
      </Link>

      {enrolled ? (
        <div className="flex flex-col gap-3">
          <ProgressBar percent={percent} label={`${title} progress`} />
          {continueHref && (
            <ButtonLink href={continueHref} variant={percent >= 100 ? "secondary" : "primary"} block>
              {percent >= 100 ? "Watch again" : percent > 0 ? "Continue" : "Start"}
            </ButtonLink>
          )}
        </div>
      ) : enrollAction ? (
        <form action={enrollAction}>
          <input type="hidden" name="module_id" value={id} />
          <Button type="submit" variant="secondary" block arrow={false}>
            Enroll
          </Button>
        </form>
      ) : null}
    </article>
  );
}

/** The grid: 1 column on a phone, 2 on a tablet, 3 on the desk. */
export function CourseGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 lg:gap-x-6 lg:gap-y-10">{children}</div>;
}
