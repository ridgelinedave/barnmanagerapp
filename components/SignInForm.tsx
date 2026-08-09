"use client";

import Image from "next/image";
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
        {/*
         * --- the crest: "Crouse skin", swaps per barn ---------------------
         *
         * Belle's real crest. The mockup drew a monogram-in-a-circle plus a
         * typeset CROUSE / EQUESTRIAN because whoever built it did not have
         * this file — it was standing in for exactly this.
         *
         * The crest is a complete lockup: it already reads CROUSE, EQUESTRIAN,
         * WNC, USA, EST. 2021. So it stands alone. Setting "CROUSE /
         * EQUESTRIAN" underneath a crest that already says it, or captioning
         * it "Barn Management", is the doubling that makes a real logo look
         * like a stock one.
         *
         * `alt` carries the barn name rather than being empty, because with no
         * text on the screen this image IS the name for anyone who cannot see it.
         */}
        <div className="mb-10 text-center">
          <Image
            src={barn.brand.logoSrc}
            alt={barn.name}
            width={340}
            height={340}
            priority
            className="mx-auto size-[10.5rem]"
          />
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
        {/* The mockup also carried a faint barn name along the bottom edge.
            With the crest standing alone above, that was the name a third
            time. Gone. */}
        {/* The label is 17px of text; the target is 44px. Padding plus an
            inline-flex box gives the finger something real to hit without the
            link looking like a button. */}
        <a
          href="/sign-in/reset"
          className="inline-flex min-h-11 items-center px-4 text-caption text-white/60 transition-colors hover:text-gold"
        >
          <span className="border-b border-transparent pb-px transition-colors hover:border-gold">
            Forgot my password
          </span>
        </a>
      </div>
    </div>
  );
}

function safeNext(value: string | null): string {
  if (!value) return "/home";
  if (!value.startsWith("/") || value.startsWith("//")) return "/home";
  return value;
}
