import Image from "next/image";
import Link from "next/link";
import { InviteClaimForm } from "@/components/InviteClaimForm";
import { Callout, Card, Chip, ChipRow } from "@/components/ui/primitives";
import { loadPendingInvite } from "@/lib/invites-server";
import { INVITE_INVALID_MESSAGE } from "@/lib/invites";
import { PERMISSION_FLAGS, PERMISSION_FLAG_LABELS, type Role } from "@/lib/types";
import { barn, featureEnabled } from "@/config/barn";

export const metadata = { title: "Your invitation" };

/**
 * The claim screen: /invite/<token>.
 *
 * Lives OUTSIDE the (app) route group, so it inherits no tab bar — the person
 * looking at it has no role yet, and no account.
 *
 * It is rendered for a signed-out stranger, so it says as little as possible
 * about anything except this one invite. There is no barn roster on it, no
 * other names, and — when the token is bad — no clue as to why.
 */
export const dynamic = "force-dynamic";

const ROLE_SENTENCE: Record<Role, string> = {
  admin: "an admin — you'll be able to run the whole barn from the app",
  staff: "staff — you'll see the daily jobs, the schedule and the horses",
  parent: "a parent — you'll see your riders' lessons, paperwork and horses",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex flex-col items-center gap-4 bg-chrome px-5 py-8 text-center">
        <Image
          src={barn.brand.logoSrc}
          alt=""
          width={72}
          height={72}
          priority
          className="size-18"
        />
        <p className="font-display text-title text-white">{barn.name}</p>
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 py-8">
        {children}
      </div>
    </main>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // The flag and a bad token give the SAME answer. An invite screen that
  // behaves differently when the feature is off would tell a stranger that the
  // feature exists and is coming.
  const invite = featureEnabled("invites") ? await loadPendingInvite(token) : null;

  if (!invite) {
    return (
      <Shell>
        <Callout tone="danger" icon="alert">
          {INVITE_INVALID_MESSAGE}
        </Callout>
        <p className="text-caption text-muted">
          If you already have an account, you can{" "}
          <Link href="/sign-in" className="font-medium text-gold-deep underline underline-offset-4">
            sign in here
          </Link>
          .
        </p>
      </Shell>
    );
  }

  const flags = PERMISSION_FLAGS.filter((flag) => invite[flag]);

  return (
    <Shell>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-display text-ink">
          You&apos;ve been invited, {invite.full_name.split(" ")[0]}
        </h1>
        <p className="text-caption text-muted">
          {barn.owner} has set you up at {barn.name} as {ROLE_SENTENCE[invite.role]}.
        </p>
      </div>

      {/* What they are being handed, stated plainly. They cannot change any of
          it here — it was decided when the invite was written — so the honest
          thing is to show it rather than let them discover it after signing in. */}
      <Card className="flex flex-col gap-2 p-4">
        <ChipRow>
          <Chip
            label="Role"
            value={invite.role === "parent" ? "Parent" : invite.role === "staff" ? "Staff" : "Admin"}
            tone={invite.role === "parent" ? "neutral" : "gold"}
          />
          {invite.familyName && <Chip label="Family" value={invite.familyName} />}
        </ChipRow>

        {invite.role === "staff" && flags.length > 0 && (
          <ChipRow>
            {flags.map((flag) => (
              <Chip key={flag} value={PERMISSION_FLAG_LABELS[flag]} icon="check" tone="forest" />
            ))}
          </ChipRow>
        )}

        {invite.role === "admin" && (
          <p className="text-caption text-muted">
            Admins can see and change everything, including who else has access.
          </p>
        )}
      </Card>

      <InviteClaimForm token={invite.token} knownEmail={invite.email} />

      <p className="text-caption text-muted">
        Not you? Don&apos;t use this link — tell {barn.owner} it went to the wrong person.
      </p>
    </Shell>
  );
}
