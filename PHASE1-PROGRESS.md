# Phase 1 progress — BLOCKED before the gate

**Date:** 2026-07-28 (overnight run)
**Status:** Phase 0 Part 2 could not be completed. The Phase 1 hard gate did not open, so
**no Phase 1 work was started.** Slices 1–4 (announcements, tasks, lessons, clock-in) are
untouched, exactly as instructed.

**Nothing was applied to the database.** The Supabase project is in the same state as when
you went to bed: empty.

---

## The blocker, in one line

I can reach your Supabase project's **data and auth APIs**, but there is no path from this
machine to run **DDL** (`create table`, `create function`, `create policy`) — so the four
migrations could not be applied, and everything downstream of them is blocked.

---

## What I verified before hitting the wall

| Check | Result |
|---|---|
| `.env.local` holds three real values, no `placeholder` | **Pass** — URL, publishable key, secret key all present |
| `npm run check:leak` | **Pass** |
| Project reachable with the publishable key | **Pass** |
| Project reachable with the secret key | **Pass** |
| Auth admin API reachable | **Pass** — 0 existing users |
| Migrations applied | **No** — 0 of 4 |

Run `npm run db:probe` any time to re-check. Current output:

```
Tables
  [ ] families      — NOT CREATED
  [ ] levels        — NOT CREATED
  [ ] profiles      — NOT CREATED
  [ ] riders        — NOT CREATED
  [ ] notifications — NOT CREATED

Helper functions (migration 0002)
  [ ] current_role()     — NOT CREATED
  [ ] current_family()   — NOT CREATED
  [ ] current_profile()  — NOT CREATED
  [ ] has_permission()   — NOT CREATED

Auth
  [x] auth admin API reachable — 0 existing user(s)
```

> One correction worth recording: my first probe reported all five tables as existing. That was
> a bug in the probe, not a real state — a PostgREST `HEAD` count request against a missing table
> returns `204` with no error, which read as "exists". The probe now uses a real row select, which
> returns `PGRST205`. Fixed and committed. I mention it because I said "tables exist" out loud
> before catching it.

---

## Why I could not apply the migrations

Four routes exist for running DDL against a Supabase project. All four are closed from here:

1. **Supabase CLI (`supabase db push`)** — CLI is installed (v2.110.0) but not authenticated.
   `supabase login` is an interactive browser OAuth flow, and this session is non-interactive.
   No stored token: `~/.supabase/` contains only `telemetry.json`, and `SUPABASE_ACCESS_TOKEN`
   is not set.
2. **Management API** (`POST /v1/projects/{ref}/database/query`) — runs arbitrary SQL, but
   requires a personal access token (`sbp_…`). Not available, and not something I should ask
   you to paste to me.
3. **Direct Postgres connection** — requires the database password, set at project creation.
   Not available.
4. **PostgREST with the secret key** — this is the one I *can* reach, but it only executes
   queries against tables that already exist. It cannot run DDL. By design.

**I deliberately did not drive your browser to do it.** The Chrome tooling could in principle
open the Supabase dashboard under your logged-in session and paste SQL into the SQL Editor, but
running schema changes against your database through your own authenticated session while you
were asleep is not something to do on an inference. Your instruction covered this case
explicitly — "if you can't reach the database directly, print the SQL so I can paste it" — so
that is what I prepared.

---

## What I need from you (5 minutes, then everything else can run)

### Option A — paste it yourself (fastest)

1. Open **https://supabase.com/dashboard/project/udmjmurrkyihzhoicwvk/sql/new**
   (Dashboard → your project → **SQL Editor** in the left sidebar → **New query**).
2. Open **`supabase/migrations/_ALL.generated.sql`** in this repo. It is all four migrations
   concatenated in order, generated from the real files.
3. Select all, paste into the editor, click **Run** (or Ctrl+Enter).
4. Expect **"Success. No rows returned."** If you get an error, copy it — do not re-run blindly,
   though re-running *is* safe (see note below).
5. Tell me it is done.

### Option B — let me do the rest myself

Run this in a terminal, follow the browser prompt, then tell me it is done:

```bash
npx supabase login
```

With a token present I can `link` and `db push` without you touching the SQL Editor, and I can
re-run migrations myself as later phases add them. This is the better long-term setup.

### Either way, I still need you for the dashboard-only steps

These cannot be done from code at all — they are project settings:

- **Advisors → Security Advisor** — run it, and tell me what it flags.
- **Authentication → Sign In / Providers → enable leaked-password protection.**
- **Authentication → URL Configuration** — set Site URL to `http://localhost:3000`, and add
  these Redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/auth/confirm`

  Without these, magic links fail silently — the link resolves but drops the session.

---

## What I did do overnight (Phase 0 hardening only, committed to `main`)

No feature work. Everything below exists to make Part 2 succeed on the first attempt when you
unblock it.

1. **Migrations are now safe to re-run.** Postgres has no `create policy if not exists`, so a
   file pasted twice — or pasted again after a partial failure — used to die on the first
   duplicate and leave the schema half-applied. All 19 policy statements now have a
   `drop policy if exists` immediately before them. Tables were already `if not exists`,
   functions already `create or replace`. **You can now paste the SQL as many times as you like.**
2. **`supabase/migrations/_ALL.generated.sql`** — all four migrations in one paste-ready file.
   Generated from the migration files, never hand-edited. Regenerate with `npm run db:combine`.
3. **`npm run db:probe`** — read-only state check. Reports which tables and functions exist and
   whether RLS is genuinely enforcing, by writing a row with the secret key and trying to read it
   back with the publishable key. That behavioural test matters because an empty table with RLS
   off looks identical to an empty table with RLS on. It cleans up after itself.
4. **Leak check updated for the new key format.** Your project uses Supabase's current
   `sb_publishable_…` / `sb_secret_…` keys rather than legacy JWTs, so the old
   `role=service_role` claim check would never have fired. It now also matches `sb_secret_*`
   directly. `sb_publishable_*` is deliberately not matched — it belongs in the bundle.
   Verified with a live negative test: I planted your real secret key in a built asset and both
   detections caught it. Probe file removed.
5. **Probe bug fixed** (the `HEAD`-returns-204 false positive described above).

---

## Assumptions and decisions

- **Treated the project as development**, per your instruction — no fixture cleanup is scheduled,
  and the three test users will be kept once seeded.
- **Did not touch the secret key** beyond reading it from `.env.local` for the leak check's
  negative test, which ran locally and wrote nothing to the database.
- **Did not create the `phase-1` branch.** Creating an empty branch would imply work started.
  `main` holds Phase 0 plus the hardening above.
- **Did not install anything new.** No new dependencies.

---

## Test output

`npm run test:policies` **could not run.** It refuses to start without the seed fixtures, and
the seed cannot run against tables that do not exist. The suite is unchanged from the verified
Phase 0 state: PART 1 (allow) and PART 2 (adversarial deny) as committed in `4d8742f`.

`npm run verify` passes:

```
typecheck  ✓
lint       ✓
build      ✓  (18 routes)
check:leak ✓
```

---

## Next steps, in order

1. **You:** apply the SQL (Option A or B above).
2. **Me:** `npm run db:seed` → three test users + control family + fixtures.
3. **Me:** `npm run test:policies` → must be 100% green, both halves.
4. **You:** Security Advisor, leaked-password protection, redirect URLs.
5. **Me:** verify the three logins show the correct tab bars, and that a profile-less user lands
   on `/account-pending`.
6. **Me:** PWA install, 320px no-scroll, production build hides the dev switcher.
7. **Then and only then:** the Phase 1 gate opens and slice 1 (announcements + FAQ + resources)
   starts on a `phase-1` branch.

---

## Still deferred (unchanged, per your instruction)

QuickBooks/Intuit OAuth, TimeActivity, invoices · Resend email sending (in-app notifications
only) · SMS and push · final branding and logo · the Academy · the boarder persona.

Brand colours, the logo, the PWA icons, and the barn geofence in `config/barn.ts` are still
**PROVISIONAL placeholders** awaiting Belle's real assets.
