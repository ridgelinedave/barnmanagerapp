import Link from "next/link";
import { barn } from "@/config/barn";

export const metadata = { title: "Forgot my password" };

/**
 * Password recovery — honest about what it is today.
 *
 * There is no self-serve reset yet, and inventing one here would mean adding
 * an unauthenticated auth surface (a reset-token flow) without the audit the
 * invite claim route got. Accounts in this app are barn-created, so barn-led
 * recovery is the truthful answer until that flow is built and reviewed.
 *
 * Dark, because it is reached from the one dark screen and bouncing the person
 * onto white mid-flow would feel like leaving the app.
 */
export default function ResetPage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center bg-deep px-7 text-white">
      <h1 className="font-display text-[1.75rem] font-semibold uppercase tracking-[0.08em]">
        Forgot my password
      </h1>
      <p className="mt-3 text-body text-white/70">
        Message {barn.owner} and she&apos;ll send you a new sign-in link. Self-serve reset is
        coming.
      </p>

      <Link
        href="/sign-in"
        className="
          mt-8 flex h-[3.25rem] items-center justify-center rounded-[0.3125rem]
          border border-white/[0.16] bg-white/[0.05]
          font-display text-[1.0625rem] font-bold uppercase tracking-[0.11em] text-white
          transition-colors active:bg-white/[0.1]
        "
      >
        Back to sign in
      </Link>
    </main>
  );
}
