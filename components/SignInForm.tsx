"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { createClient } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/env";
import { barn } from "@/config/barn";

/**
 * Sign in. THE ONE DARK SCREEN in the app.
 *
 * Everything past this door is paper-white with black chrome; this is the
 * threshold, and it is the same black as the launch splash so opening the app
 * and signing in read as one continuous surface rather than two shades of
 * almost-black.
 *
 * Built to design/mockups/login.html, variant B:
 *
 *   GHOST FIELDS — a barely-there fill with a hairline that lights gold on
 *     focus. White boxes on black glow in a dark barn at 5am; these do not.
 *   ONE METHOD — email and password. The magic-link option is gone: two ways
 *     to sign in is two things to explain, and the barn creates accounts
 *     anyway. Password reset is the recovery path, at the bottom.
 *   EYE TOGGLE — because a phone keyboard in a barn, in gloves, mistypes.
 *
 * The wordmark block is "Crouse skin" — it swaps per barn. Everything else
 * here is product character and stays.
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

  const field =
    "h-[3.125rem] w-full rounded-[0.75rem] border border-white/[0.16] bg-white/[0.05] px-4 " +
    "text-body text-white placeholder:text-white/40 outline-none " +
    "focus:border-gold focus:bg-white/[0.08] transition-colors duration-150";

  const label = "mb-1.5 block pl-0.5 text-[0.6875rem] uppercase tracking-[0.13em] text-white/60";

  return (
    <div className="flex min-h-dvh flex-col bg-black px-7 text-white">
      <div className="flex flex-1 flex-col justify-center py-10">
        {/* --- wordmark: "Crouse skin", swaps per barn --------------------- */}
        <div className="mb-11 text-center">
          <div className="mx-auto mb-4 flex size-[3.25rem] items-center justify-center rounded-full border-[1.5px] border-gold">
            <span className="font-display text-[1.5rem] font-bold tracking-[0.06em] text-gold">
              {barn.shortName.charAt(0)}
            </span>
          </div>
          <p className="font-display text-[1.875rem] font-semibold uppercase leading-none tracking-[0.16em]">
            {barn.name.split(" ")[0]}
            <br />
            <span className="font-medium text-white/85">{barn.name.split(" ").slice(1).join(" ")}</span>
          </p>
          <p className="mt-2.5 text-[0.6875rem] uppercase tracking-[0.22em] text-white/55">
            Barn Management
          </p>
        </div>

        <form onSubmit={onSubmit} noValidate>
          <div className="mb-3.5">
            <label htmlFor="email" className={label}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="you@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={field}
            />
          </div>

          <div className="mb-3.5">
            <label htmlFor="password" className={label}>
              Password
            </label>
            <div className="relative flex items-center">
              <input
                id="password"
                name="password"
                type={reveal ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${field} pr-12`}
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? "Hide password" : "Show password"}
                aria-pressed={reveal}
                className="absolute right-0 flex size-12 items-center justify-center text-white/55"
              >
                <Icon name={reveal ? "eyeOff" : "eye"} className="size-5" />
              </button>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="mb-3 rounded-[0.3125rem] border border-danger/40 bg-danger/15 px-3 py-2.5 text-caption text-white"
            >
              {error}
            </p>
          )}

          {!configured && (
            <p className="mb-3 text-caption text-white/60">
              Supabase isn&apos;t connected yet — sign-in is wired but will not work until real
              keys are in .env.local.
            </p>
          )}

          {/*
           * The gold button, squared and tactile. Written out rather than
           * using <Button> because this is the one screen on black, and the
           * shared component's focus and press states are tuned for paper.
           */}
          <button
            type="submit"
            disabled={busy}
            className="
              mt-2 h-[3.25rem] w-full rounded-[0.3125rem] bg-gold text-ink
              font-display text-[1.125rem] font-bold uppercase tracking-[0.11em]
              shadow-press transition-[transform,background-color,box-shadow] duration-100 ease-out
              active:translate-y-px active:bg-gold-press active:shadow-press-active
              disabled:pointer-events-none disabled:opacity-60
            "
          >
            {busy ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>

      <div className="pb-9 text-center">
        <a
          href="/sign-in/reset"
          className="border-b border-transparent pb-px text-caption text-white/60 transition-colors hover:border-gold hover:text-gold"
        >
          Forgot my password
        </a>
        <p className="mt-6 text-[0.625rem] uppercase tracking-[0.2em] text-white/25">{barn.name}</p>
      </div>
    </div>
  );
}

function safeNext(value: string | null): string {
  if (!value) return "/home";
  if (!value.startsWith("/") || value.startsWith("//")) return "/home";
  return value;
}
