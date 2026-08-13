/**
 * Has the app shell mounted in THIS document yet?
 *
 * The one bit of state that tells a cold load apart from a tab switch, and the
 * reason the launch screen stopped flashing on every navigation.
 *
 * Next.js renders `app/(app)/loading.tsx` in two very different situations and
 * gives the component no way to tell them apart: once while the first request
 * streams (a genuine cold start, where a branded screen is right), and again on
 * every client-side navigation whose target suspends (where a full-screen black
 * field for 200ms reads as the app crashing and reopening).
 *
 * `markBooted` is called from an effect in the app layout, so it only ever runs
 * in the browser. That matters: this module also evaluates on the server, where
 * its scope is shared by every request — if the server could set it, one user's
 * navigation would suppress the next user's launch screen. It cannot, so the
 * server always reports "not booted", which is correct for the only thing the
 * server renders this for: a fresh document.
 *
 * There is deliberately NO minimum display time. The launch screen is shown for
 * exactly as long as the shell takes to resolve and not a frame longer; a floor
 * would make a fast load slower on purpose, which is the opposite of the point.
 */
let booted = false;

/** Called once, from the app layout, after the shell has mounted. */
export function markBooted(): void {
  booted = true;
}

export function hasBooted(): boolean {
  return booted;
}
