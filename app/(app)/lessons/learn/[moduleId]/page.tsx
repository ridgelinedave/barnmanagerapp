import { redirect } from "next/navigation";

/**
 * Old address. A module is a heading on the Academy screen now, with its
 * lessons listed under it, so this sends the viewer to that heading.
 *
 * It confirms nothing: the Academy lists only what RLS lets this viewer read,
 * so a module they may not see simply is not there to scroll to.
 */
export default async function LearningModulePage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = await params;
  redirect(/^[0-9a-f-]{36}$/i.test(moduleId) ? `/lessons/learn#module-${moduleId}` : "/lessons/learn");
}
