import { EmptyState } from "@/components/ui/primitives";

/**
 * Placeholder body for a tab that has no feature behind it yet.
 *
 * This is scaffolding, not shipped copy. Every one of these is replaced by a
 * real screen as its phase lands — nothing here may reach a live barn (SPEC
 * §12, "a live site carries zero placeholder").
 *
 * One factual line through EmptyState: what is missing and which phase builds
 * it. The page title already says what the screen is.
 */
export function StubScreen({
  heading,
  phase,
}: {
  heading: string;
  /** Which build phase fills this tab in. */
  phase: string;
}) {
  return <EmptyState title={`${heading}: not built yet (${phase})`} />;
}
