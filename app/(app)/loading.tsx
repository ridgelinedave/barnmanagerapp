import { AppLoading } from "@/components/AppLoading";

/**
 * The (app) segment's Suspense fallback.
 *
 * Deliberately thin: WHICH wait this is — a cold start or a tab switch — can
 * only be answered in the browser, so the decision lives in the client
 * component. See components/AppLoading.tsx.
 */
export default function AppLoadingBoundary() {
  return <AppLoading />;
}
