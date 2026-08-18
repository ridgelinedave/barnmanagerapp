import { permanentRedirect } from "next/navigation";

/**
 * A deep link to one show, from before the hub moved under Lessons.
 *
 * The id is carried across rather than dropping the visitor on the hub — a
 * link someone shared to a specific show should still open that show.
 */
export default async function ShowRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/lessons/shows/${id}`);
}
