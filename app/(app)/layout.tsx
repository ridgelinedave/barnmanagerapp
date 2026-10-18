import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import { devRoleSwitcherEnabled } from "@/lib/dev-role";
import { DevRoleSwitcher } from "@/components/DevRoleSwitcher";
import { TabBar } from "@/components/TabBar";
import { BootMarker } from "@/components/BootMarker";
import { ViewerProvider } from "@/components/ViewerContext";
import { Sidebar } from "@/components/Sidebar";
import { featureEnabled } from "@/config/barn";
import { sidebarFor } from "@/lib/nav";

/**
 * The app shell. Resolves the viewer's role once, here, and renders the tab bar
 * from it — the same role value the RLS policies check, so navigation and
 * security cannot drift apart.
 *
 * Two states never reach the shell:
 *  - anonymous        → /sign-in
 *  - signed in, but no `profiles` row (so no role) → /account-pending
 *
 * The same two redirects live in `lib/guard.ts`, because in the App Router a
 * layout and its page render concurrently — the page must reach the same
 * conclusion on its own rather than trusting the layout to have stopped first.
 *
 * TWO SHELLS, ONE APP (DESIGN-MASTER §14b). Both navigations are rendered and
 * CSS picks one at the `lg` breakpoint: below it the five-tab bar, from it the
 * sidebar. Choosing in CSS rather than in JavaScript means the server renders
 * the right chrome on the first paint, with no flash while a hook measures the
 * window, and a resize simply swaps them. The hidden one is `display: none`,
 * so it is out of the accessibility tree and the tab order, not merely out of
 * sight. The pages are identical under both; only this file and the layout
 * components know which shell is showing.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const state = await getViewer();

  if (state.status === "anonymous") redirect("/sign-in");
  if (state.status === "no-profile") redirect("/account-pending");

  const { viewer } = state;

  const account = {
    name: viewer.profile?.full_name || viewer.email || (viewer.isDevRole ? "Preview" : "Your account"),
    detail: viewer.isDevRole ? `${viewer.role} · dev preview` : viewer.role,
  };

  return (
    <ViewerProvider value={{ role: viewer.role, isDevRole: viewer.isDevRole }}>
      <Sidebar model={sidebarFor(viewer.role, featureEnabled)} account={account} />
      {/* lg:pl-64 makes room for the fixed sidebar; below lg it is absent. */}
      <div className="flex min-h-dvh flex-col lg:pl-64">
        {/* Mounts once per document, and only in the browser. From its effect
            onwards the loading fallback knows this is a navigation rather than
            a cold start, so the launch screen stops flashing between tabs. */}
        <BootMarker />
        {devRoleSwitcherEnabled() && (
          <DevRoleSwitcher current={viewer.isDevRole ? viewer.role : null} />
        )}
        {children}
        <TabBar role={viewer.role} />
      </div>
    </ViewerProvider>
  );
}
