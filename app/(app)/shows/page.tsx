import { permanentRedirect } from "next/navigation";

/**
 * The Shows tab is gone; the hub lives under Lessons now.
 *
 * Kept as a redirect rather than deleted because this path is in the wild:
 * it was a bottom tab for months, so it is in browser history, in anything
 * anyone has bookmarked or pasted into a message, and in the PWA's saved
 * state. A 404 there would read as "the shows feature was removed".
 *
 * permanentRedirect, not redirect: this is a 308 and the move is not
 * provisional.
 */
export default function ShowsRedirect() {
  permanentRedirect("/lessons/shows");
}
