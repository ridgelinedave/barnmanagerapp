import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import { devRoleSwitcherEnabled } from "@/lib/dev-role";
import { DevRoleSwitcher } from "@/components/DevRoleSwitcher";
import { TabBar } from "@/components/TabBar";
import { ViewerProvider } from "@/components/ViewerContext";

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
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const state = await getViewer();

  if (state.status === "anonymous") redirect("/sign-in");
  if (state.status === "no-profile") redirect("/account-pending");

  const { viewer } = state;

  return (
    <ViewerProvider value={{ role: viewer.role, isDevRole: viewer.isDevRole }}>
      <div className="flex min-h-dvh flex-col">
        {devRoleSwitcherEnabled() && (
          <DevRoleSwitcher current={viewer.isDevRole ? viewer.role : null} />
        )}
        {children}
        <TabBar role={viewer.role} />
      </div>
    </ViewerProvider>
  );
}
