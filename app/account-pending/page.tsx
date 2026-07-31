import { redirect } from "next/navigation";
import Image from "next/image";
import { getViewer } from "@/lib/session";
import { devRoleSwitcherEnabled, DEV_ROLE_NONE } from "@/lib/dev-role";
import { DevRoleSwitcher } from "@/components/DevRoleSwitcher";
import { Button } from "@/components/ui/Button";
import { barn } from "@/config/barn";

export const metadata = { title: "Account not set up" };

/**
 * The signed-in-but-no-`profiles`-row screen.
 *
 * This is a real state, not an edge case: auth users are created before (or
 * independently of) their barn profile, and a user in that state has no role —
 * so there is no tab bar to render. Sending them to an empty shell would look
 * broken; sending them back to sign-in would loop, because they *are* signed in.
 *
 * Deliberately neutral: it does not say whether the account exists, is pending,
 * or was removed. Nothing here reveals anything about the barn's roster.
 *
 * Lives outside the (app) route group so it inherits no tab bar.
 */
export default async function AccountPendingPage() {
  const state = await getViewer();

  // Anyone who *does* have a role belongs in the app, not here.
  if (state.status === "viewer") redirect("/home");
  if (state.status === "anonymous") redirect("/sign-in");

  return (
    <main className="flex flex-1 flex-col">
      {devRoleSwitcherEnabled() && <DevRoleSwitcher current={DEV_ROLE_NONE} />}

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-5 py-10 text-center">
        <Image
          src={barn.brand.logoSrc}
          alt=""
          width={64}
          height={64}
          priority
          className="mx-auto size-16"
        />

        <div className="flex flex-col gap-2">
          <h1 className="font-display text-display text-ink">
            Your account isn&apos;t set up yet
          </h1>
          <p className="text-caption text-muted">
            You&apos;re signed in{state.email ? ` as ${state.email}` : ""}, but this account
            hasn&apos;t been linked to a barn profile. Contact {barn.owner} and we&apos;ll get you
            set up.
          </p>
        </div>

        <form action="/auth/sign-out" method="post">
          <Button type="submit" variant="secondary" block>
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
