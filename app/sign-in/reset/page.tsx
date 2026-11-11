import { AuthShell } from "@/components/AuthShell";
import { ButtonLink } from "@/components/ui/Button";
import { barn } from "@/config/barn";

export const metadata = { title: "Password reset" };

/**
 * Password recovery — honest about what it is today.
 *
 * There is no self-serve reset yet, and inventing one here would mean adding
 * an unauthenticated auth surface (a reset-token flow) without the audit the
 * invite claim route got. Accounts in this app are barn-created, so barn-led
 * recovery is the truthful answer until that flow is built and reviewed.
 *
 * On the same white door as sign-in (components/AuthShell.tsx), so the person
 * never feels they have left.
 */
export default function ResetPage() {
  return (
    <AuthShell>
      <h1 className="mb-3 text-center font-display text-title text-ink">Password reset</h1>
      <p className="mb-6 text-center text-body text-ink">Message {barn.owner} for a new sign-in link.</p>
      <ButtonLink href="/sign-in" variant="secondary" block arrow={false}>
        Back to sign in
      </ButtonLink>
    </AuthShell>
  );
}
