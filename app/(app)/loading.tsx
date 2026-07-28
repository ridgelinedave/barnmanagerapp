import { LaunchScreen } from "@/components/LaunchScreen";

/**
 * Shown while the shell resolves who is looking — which means a session lookup
 * and a profile read before the first tab can render.
 *
 * Using the branded launch screen here means an installed PWA carries the same
 * dark field from the iOS splash straight through to the app, instead of the
 * splash handing over to a blank white frame.
 */
export default function AppLoading() {
  return <LaunchScreen />;
}
