import { redirect } from "next/navigation";
import { currentRole } from "@/lib/guard";
import { featureEnabled } from "@/config/barn";
import { lessonSegments } from "@/lib/nav";
import { StudentsView } from "./_views/StudentsView";
import { MyLessonsView } from "./_views/MyLessonsView";

export const metadata = { title: "Lessons" };

/**
 * The Lessons tab. There is no menu screen (CLAUDE.md, "No menu screens"): the
 * tab opens straight on its FIRST segment, and the segmented control at the top
 * reaches the rest — Students (or My lessons) · Shows · the barn's Academy.
 *
 *   admin   Students, here
 *   parent  their own lessons (with any makeup offers on top), here
 *   staff   no view of their own at /lessons, so straight to the first
 *           segment they do have
 *
 * The segments live in lib/nav.ts (LESSONS_GROUP), because the desktop
 * sidebar is derived from the same list.
 */
export default async function LessonsPage() {
  const role = await currentRole();

  if (role === "admin" && featureEnabled("lessons")) return <StudentsView />;
  if (role === "parent") return <MyLessonsView />;

  const first = lessonSegments(role, featureEnabled, "").find((s) => s.href !== "/lessons");
  redirect(first?.href ?? "/home");
}
