"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
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
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-5 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <Image
          src={barn.brand.logoSrc}
          alt={barn.name}
          width={64}
          height={64}
          priority
          className="size-16"
        />
        <div>
          <h1 className="text-xl font-semibold">{barn.name}</h1>
          <p className="mt-1 text-sm text-brand-ink/70">Sign in to your barn account.</p>
        </div>
      </div>

      {!configured && (
        <p
          role="status"
          className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Supabase isn&apos;t connected yet. Sign-in is wired but will not work until real keys
          are in <code className="font-mono">.env.local</code>.
        </p>
      )}

      <div role="tablist" aria-label="Sign-in method" className="flex rounded-xl bg-white p-1">
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
            className={`min-h-11 flex-1 rounded-lg text-sm font-semibold ${
              mode === value ? "bg-brand-gold text-white" : "text-brand-ink/70"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate={false}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
          />
        </div>

        {mode === "password" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
            />
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        {sent && (
          <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-900">
            Check your email for a sign-in link.
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="min-h-12 rounded-xl bg-brand-gold px-4 text-base font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Working…" : mode === "magic" ? "Email me a link" : "Sign in"}
        </button>
      </form>

      <p className="text-center text-xs text-brand-ink/60">
        Accounts are created by the barn. Contact {barn.owner} if you need access.
      </p>
    </div>
  );
}

function safeNext(value: string | null): string {
  if (!value) return "/home";
  if (!value.startsWith("/") || value.startsWith("//")) return "/home";
  return value;
}
