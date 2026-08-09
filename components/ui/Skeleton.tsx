/**
 * Skeleton loaders.
 *
 * These are NOT decorative. The rule they follow is that a skeleton must have
 * the same height and rhythm as the thing it stands in for — a 56px row
 * skeleton for a 56px row — so when the real content arrives nothing jumps.
 * A skeleton that is the wrong size is worse than no skeleton at all, because
 * it promises a layout and then breaks it.
 *
 * Marked aria-hidden and paired with an sr-only "Loading" from the caller: a
 * screen reader should hear one word, not a dozen empty boxes.
 */
export function SkeletonLine({ w = "100%", h = "0.875rem" }: { w?: string; h?: string }) {
  return <span aria-hidden="true" className="skeleton block" style={{ width: w, height: h }} />;
}

/** One list row: avatar, two lines of text, trailing chip. Matches ListRow. */
export function SkeletonRow() {
  return (
    <div
      aria-hidden="true"
      className="flex min-h-14 items-center gap-3 rounded-card border border-line p-3.5"
    >
      <span className="skeleton size-11 shrink-0 rounded-avatar" />
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <SkeletonLine w="55%" h="1rem" />
        <SkeletonLine w="35%" h="0.75rem" />
      </span>
      <span className="skeleton h-6 w-14 shrink-0 rounded-chip" />
    </div>
  );
}

/** A stack of rows. `label` is what the screen reader hears instead. */
export function SkeletonList({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="sr-only" role="status">
        {label}
      </span>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

/** A section heading plus its rows — the shape of most screens here. */
export function SkeletonSection({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <section className="flex flex-col gap-3">
      <span className="sr-only" role="status">
        {label}
      </span>
      <SkeletonLine w="38%" h="1.1875rem" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </section>
  );
}
