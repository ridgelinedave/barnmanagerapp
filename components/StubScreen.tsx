import { EmptyState } from "@/components/ui/primitives";

/**
 * Placeholder body for a tab that has no feature behind it yet.
 *
 * This is scaffolding, not shipped copy. Every one of these is replaced by a
 * real screen as its phase lands — nothing here may reach a live barn (SPEC
 * §12, "a live site carries zero placeholder").
 *
 * It renders through EmptyState so even the scaffolding obeys the rule that an
 * empty box has to say what would put something in it. `detail` is a string
 * rather than children: the old version took arbitrary nodes and every caller
 * passed the same lonely paragraph.
 */
export function StubScreen({
  heading,
  phase,
  detail,
}: {
  heading: string;
  /** Which build phase fills this tab in. */
  phase: string;
  /** What will eventually live here, in the barn's words. */
  detail?: string;
}) {
  return (
    <EmptyState
      title={heading}
      body={detail ? `${detail} Being built in ${phase}.` : `Being built in ${phase}.`}
    />
  );
}
