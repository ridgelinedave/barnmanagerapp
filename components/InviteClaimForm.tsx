"use client";

import { useActionState, useId } from "react";
import { claimInvite, type ClaimState } from "@/app/invite/[token]/actions";
import { Button } from "@/components/ui/Button";
import { Field, FormFeedback, Input } from "@/components/ui/Field";

const EMPTY: ClaimState = { error: null };

/**
 * Setting up a login from an invite.
 *
 * Two fields, or three when the barn did not already know the email. Nothing
 * here decides anything about the account: the role, the family and the
 * permissions were settled when the invite was written, and this form has no
 * control that could change them. Saying so on screen is the point — a person
 * being handed an account should be able to see what they are being handed.
 */
export function InviteClaimForm({
  token,
  knownEmail,
}: {
  token: string;
  /** Set when the invite already carries an email; then it is shown, not asked. */
  knownEmail: string | null;
}) {
  const [state, formAction, pending] = useActionState(claimInvite, EMPTY);
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />

      {knownEmail ? (
        <Field
          label="Your sign-in email"
          htmlFor={`${id}-email`}
          hint="The barn already has this. Ask them to change it if it's wrong."
        >
          {/* Displayed, not submitted — the server reads the email off the
              invite row when it has one, so this is a fact, not an input. */}
          <Input id={`${id}-email`} value={knownEmail} readOnly disabled autoComplete="username" />
        </Field>
      ) : (
        <Field
          label="Your email"
          htmlFor={`${id}-email`}
          hint="This is what you'll sign in with."
        >
          <Input
            id={`${id}-email`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            required
          />
        </Field>
      )}

      <Field
        label="Choose a password"
        htmlFor={`${id}-password`}
        hint="At least 8 characters."
      >
        <Input
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>

      <Field label="Type it again" htmlFor={`${id}-confirm`}>
        <Input
          id={`${id}-confirm`}
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>

      <FormFeedback error={state.error} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Setting up…" : "Create my account"}
      </Button>
    </form>
  );
}
