import { SubTabs } from "@/components/ui/SubTabs";
import { lessonSegments } from "@/lib/nav";
import type { Role } from "@/lib/types";
import { barn, featureEnabled } from "@/config/barn";

/**
 * The Lessons tab's segmented control — Students (or My lessons) · Shows ·
 * the barn's Academy. Rendered through TabPage's `tabs`, so it sits in the
 * header on a desk and above the content on a phone. A role with only one
 * segment gets no control at all.
 */
export function LessonsSegments({ role, current }: { role: Role; current: string }) {
  const items = lessonSegments(role, featureEnabled, current, { learning: barn.learning.label });
  if (items.length < 2) return null;
  return <SubTabs label="Lessons" items={items} />;
}
