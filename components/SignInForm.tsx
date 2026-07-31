"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Callout } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Field, FormFeedback, Input } from "@/components/ui/Field";
import { createClient } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/env";
import { barn } from "@/config/barn";

type Mode = "magic" | "password";

const ERROR_COPY: Record<string, string> = {
  link_invalid: "That sign-in link has expired. Request a new one.",
  missing_code: "That sign-in link was incomplete. Request a new one.",
  missing_token: "That sign-in link was incomplete. Request a new one.",
};

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<Mode>("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(
    ERROR_COPY[searchParams.get("error") ?? ""] ?? null,
  );

  const next = safeNext(searchParams.get("next"));
  const configured = supabaseConfigured();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSent(false);

    if (!configured) {
      setError("Supabase isn't connected yet. Add real keys to .env.local (see README).");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();

      if (mode === "magic") {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
            // Accounts are created by the barn, not self-served.
            shouldCreateUser: false,
          },
        });
        if (otpError) throw otpError;
        setSent(true);
      } else {
        const { error: pwError } = await supabase.auth.signInWithPassword({ email, password });
        if (pwError) throw pwError;
        router.replace(next);
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/*
       * The crest on its own charcoal field, exactly as it appears on the
       * launch screen and the sign. Opening the app and signing in should feel
       * like the same door, not two different ones.
       */}
      <div className="safe-top bg-chrome px-5 pb-9 pt-12 text-center">
        <Image
          src={barn.brand.logoSrc}
          alt=""
          width={72}
          height={72}
          priority
          className="mx-auto size-18"
        />
        <h1 className="mt-3 font-display text-display text-white">{barn.name}</h1>
        <p className="mt-1 text-caption text-white/70">Sign in to your barn account</p>
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 py-7">
        {!configured && (
          <Callout tone="danger" icon="alert">
            Supabase isn&apos;t connected yet. Sign-in is wired but will not work until real keys
            are in <code className="font-mono">.env.local</code>.
          </Callout>
        )}

        {/* Segmented control, one gold pill on a sunk track. */}
        <div
          role="tablist"
          aria-label="Sign-in method"
          className="flex gap-1 rounded-control bg-sunk p-1"
        >
          {(
            [
              ["magic", "Email link"],
              ["password", "Password"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              type="button"
              aria-selected={mode === value}
              onClick={() => {
                setMode(value);
                setError(null);
                setSent(false);
              }}
              className={`min-h-11 flex-1 rounded-[0.5rem] text-label font-semibold transition-colors duration-150 ease-out ${
                mode === value ? "bg-gold text-ink" : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          {mode === "password" && (
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
          )}

          <FormFeedback
            error={error}
            message={sent ? "Check your email for a sign-in link." : null}
          />

          <Button type="submit" variant="primary" block disabled={busy}>
            {busy ? "Working…" : mode === "magic" ? "Email me a link" : "Sign in"}
          </Button>
        </form>

        <p className="mt-auto text-center text-caption text-muted">
          Accounts are created by the barn. Contact {barn.owner} if you need access.
        </p>
      </div>
    </div>
  );
}

function safeNext(value: string | null): string {
  if (!value) return "/home";
  if (!value.startsWith("/") || value.startsWith("//")) return "/home";
  return value;
}
