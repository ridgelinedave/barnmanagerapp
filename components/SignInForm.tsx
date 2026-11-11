"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { createClient } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/env";

/**
 * Sign in — on the white door (components/AuthShell.tsx).
 *
 * DECIDED 2026-11-10 (David): the full-bleed oxblood field with ghost fields
 * read as aggressive. Now a traditional bordered card on white, the barn's
 * colours as accents (a band across the card's top edge), standard light
 * fields and the barn's primary button — the same controls as everywhere past
 * this door. Kept from the original brief:
 *
 *   ONE METHOD — email and password. Two ways to sign in is two things to
 *     explain, and the barn creates accounts anyway. Password reset is the
 *     recovery path, at the bottom.
 *   EYE TOGGLE — because a phone keyboard in a barn, in gloves, mistypes.
 */
const ERROR_COPY: Record<string, string> = {
  link_invalid: "That link has expired. Sign in with your password.",
  missing_code: "That link was incomplete. Sign in with your password.",
  missing_token: "That link was incomplete. Sign in with your password.",
};

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    ERROR_COPY[searchParams.get("error") ?? ""] ?? null,
  );

  const next = safeNext(searchParams.get("next"));
  const configured = supabaseConfigured();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!configured) {
      setError("Supabase isn't connected yet. Add real keys to .env.local.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      router.replace(next);
      router.refresh();
    } catch (caught) {
      // Supabase says "Invalid login credentials", which is correct and cold.
      setError(
        caught instanceof Error && /invalid login/i.test(caught.message)
          ? "That email and password don't match."
          : caught instanceof Error
            ? caught.message
            : "Sign-in failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="mb-6 text-center font-display text-title text-ink">Sign in</h1>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <div className="relative flex items-center">
            <Input
              id="password"
              name="password"
              type={reveal ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pr-12"
            />
            {/* EYE TOGGLE — a phone keyboard in a barn, in gloves, mistypes. */}
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? "Hide password" : "Show password"}
              aria-pressed={reveal}
              className="absolute right-0 flex size-12 items-center justify-center rounded-control text-muted focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-ink"
            >
              <Icon name={reveal ? "eyeOff" : "eye"} className="size-5" />
            </button>
          </div>
        </Field>

        {error && (
          <p role="alert" className="rounded-control border border-danger/30 bg-danger-soft p-3 text-caption text-ink">
            {error}
          </p>
        )}

        {!configured && (
          <p className="text-caption text-muted">
            Supabase isn&apos;t connected yet — sign-in is wired but will not work until real keys are in .env.local.
          </p>
        )}

        <Button type="submit" variant="primary" block arrow={false} disabled={busy} className="mt-1">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {/* 17px of text, a 44px target: padding gives the finger something real
          to hit without the link looking like a button. */}
      <a
        href="/sign-in/reset"
        className="mx-auto mt-4 inline-flex min-h-11 items-center px-3 text-caption text-accent-text underline-offset-4 hover:underline"
      >
        Forgot my password
      </a>
    </AuthShell>
  );
}

function safeNext(value: string | null): string {
  if (!value) return "/home";
  if (!value.startsWith("/") || value.startsWith("//")) return "/home";
  return value;
}
