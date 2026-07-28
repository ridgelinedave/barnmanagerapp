# Crouse Barn App

A mobile-first barn-management PWA for **Crouse Equestrian** (Asheville / Candler, NC).
Parents see their riders' schedule and shows; staff clock in and work tasks; the owner runs
the whole barn from her phone.

**Status: Phase 0 (skeleton), Part 1 — no live database yet.**
The app shell, auth screens, PWA and all database code exist. Nothing has been applied to a
Supabase project. Follow **[Part 2: connect Supabase](#part-2-connect-supabase)** to finish
Phase 0.

- Full product spec: [`SPEC.md`](SPEC.md)
- Phase 0 scope and Definition of Done: [`docs/PHASE0-BRIEF.md`](docs/PHASE0-BRIEF.md)

---

## Table of contents

- [What's built](#whats-built)
- [Running it](#running-it)
- [Environment variables](#environment-variables)
- [Architecture](#architecture)
- [Security model](#security-model)
- [Database files](#database-files)
- [Part 2: connect Supabase](#part-2-connect-supabase)
- [Cloning for a new barn](#cloning-for-a-new-barn)
- [Open items for Belle](#open-items-for-belle)

---

## What's built

| Area | State |
|---|---|
| Next.js 16 (App Router) + TypeScript + Tailwind v4, mobile-first | Done |
| `config/barn.ts` — every barn-specific value | Done |
| `@supabase/ssr` browser + server clients, service-role client (server-only) | Done, unconnected |
| Sign-in screen — email magic link **and** password | Done, unconnected |
| Role-driven bottom tab bar + stub screens for all three roles | Done |
| Temporary dev role switcher (view the shells without login) | Done, dev-only |
| PWA: manifest, service worker, install-prompt hook | Done |
| Bell icon + unread badge | Done, empty feed |
| Migrations, helper functions, RLS policies, seed, policy tests | Written, **not applied** |
| CI: typecheck, lint, build, service-key leak check | Done |

Not built, on purpose: announcements, clock-in, QuickBooks, tasks, lessons, horses, shows,
invoices, shop, Academy. Those are Phases 1–3 (see `SPEC.md` §10).

---

## Running it

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:3000>. The placeholder `.env.local` means nothing connects to a
database, so the app opens on the sign-in screen with a banner saying so.

**To view the three role shells without logging in**, use the amber **Dev only — role
preview** bar at the top: tap `parent`, `staff` or `admin`. Each renders its own tab bar:

- **Parent** — Home · Lessons · Shows · More
- **Staff** — Home · Clock · Tasks · Schedule · More
- **Admin** — Home · Schedule · Manage · Shows · More

The switcher writes a `dev_role` cookie the server layout reads. It is a *display* override
only — it grants no data access, because every query still runs under RLS as the real
(here: absent) user. It is hard-disabled in production builds.

### Other commands

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm run check:leak` | Fails if the service role key can reach a client bundle |
| `npm run verify` | typecheck → lint → build → leak check |
| `npm run icons` | Regenerates the placeholder PWA icons from the config colours |
| `npm run db:seed` | Seeds the three fixture users (needs a live Supabase project) |
| `npm run test:policies` | RLS policy test suite (needs a live project + seed) |

---

## Environment variables

Copy `.env.example` to `.env.local` and fill it in. `.env.local` is gitignored; `.env.example`
is committed and documents every variable.

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase Project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | The anon / publishable key. Public by design — RLS, not this key, is what enforces access. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret, server-only** | Bypasses RLS entirely. Never `NEXT_PUBLIC_`, never imported by a client component, never committed. |

Optional: `SEED_TEST_PASSWORD` (fixture password; random if unset),
`NEXT_PUBLIC_DEV_ROLE_SWITCHER`.

---

## Dependencies

**Next 16 (App Router) + React 19 + Tailwind v4 is a deliberate target, not an accident of
`create-next-app`.** `SPEC.md` calls for "Next.js 14+"; 16 is the current major and is what
the code is written against — Tailwind v4's CSS-first `@theme` (no `tailwind.config.js`), and
Next 16's `proxy.ts` in place of the deprecated `middleware.ts`. Don't downgrade to match the
spec's floor; the spec sets a minimum, not a pin.

Next, React, Tailwind and the Supabase packages are pinned to **exact versions** (no `^`), and
`package-lock.json` is committed, so a clone six months from now builds the same tree that was
tested here. Use `npm ci`, not `npm install`, in CI and on a fresh clone.

Upgrading is a deliberate act: bump the pin, run `npm run verify`, and re-run the policy tests
against a live project before shipping.

---

## Architecture

```
app/
  (app)/            The signed-in shell — layout resolves role once, renders the tab bar
    home/ lessons/ shows/ clock/ tasks/ schedule/ manage/ more/ notifications/
  auth/             callback (PKCE), confirm (token hash), sign-out
  sign-in/          Magic link + password
  account-pending/  Signed in, but no profiles row — no role, so no tab bar
  manifest.json/    Serves /manifest.json, generated from config/barn.ts
components/         TabBar, AppHeader, NotificationBell, SignInForm, InstallPrompt, ...
config/barn.ts      THE barn config — the only place Crouse-specific values live
hooks/              useInstallPrompt
lib/
  supabase/         client (browser, anon) - server (RSC, anon) - admin (service role, server-only)
  session.ts        Resolves the viewer and their role
  nav.ts            Role -> tabs
  guard.ts          Keeps a role out of another role's tabs
proxy.ts            Refreshes the Supabase session, gates the shell
                    (Next 16's rename of the middleware convention)
public/             sw.js, offline.html, icons, brand
scripts/            Icon generator, service-key leak check
supabase/
  migrations/       Tables + RLS + policies (NOT APPLIED)
  seed/seed.mjs     Three fixture users (NOT RUN)
tests/policies.test.mjs   Per-role row-visibility assertions (NOT RUN)
```

**Role drives both UI and policy.** The `role` value on a user's `profiles` row is what
renders the tab bar *and* what the RLS policies check, so navigation and security cannot
drift apart.

**Three viewer states, not two.** A user can be signed out, signed in with a role, or *signed
in with no `profiles` row at all* — which is normal, since auth users exist before the barn
links them to a profile. That third state has no role and therefore no tab bar, so it gets its
own screen at `/account-pending` ("your account isn't set up yet") rather than an empty shell.
Both `app/(app)/layout.tsx` and `lib/guard.ts` redirect to it: a layout and its page render
concurrently in the App Router, so the page cannot assume the layout already stopped. The dev
role switcher has a **"no profile"** option that previews this state.

---

## Security model

Row Level Security **is** the client security model. There is no application-layer
authorization to get wrong.

1. **The browser only ever holds the anon key.** Anything it can read, the database has
   decided it may read.
2. **RLS is enabled in the same migration that creates every table** — including lookup
   tables. Default deny: `to authenticated` policies only, so signed-out access is nothing.
3. **Role and permission reads go through `SECURITY DEFINER` functions**
   (`public."current_role"()`, `public.current_family()`, `public.has_permission()`), never
   by querying `profiles` inside a policy — that recurses.
4. **The service role key is server-only.** It lives in `lib/supabase/admin.ts`
   (`import "server-only"`) and in terminal scripts. `npm run check:leak` fails the build if
   it appears in a client bundle, under a `NEXT_PUBLIC_` name, or as a JWT claiming
   `role=service_role`.
5. **Column protection is separate from row protection.** RLS is row-level, so:
   - a trigger stops a non-admin changing their own `role`, `manage_*` flags, `family_id` or
     QBO mapping — without it, "a user may edit their own profile" means "a user may make
     themselves an admin";
   - `notifications` grants `UPDATE (read_at)` only, so a recipient cannot rewrite the body
     of a notification they received.

> `CURRENT_ROLE` is a reserved SQL keyword, so the function is defined and called as
> `public."current_role"()`.

---

## Database files

Nothing here has been applied. Apply in filename order.

| File | Contents |
|---|---|
| `supabase/migrations/20260727000100_core_identity.sql` | `families`, `levels`, `profiles`, `riders` — each with `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`, and **RLS enabled in the same migration**. |
| `supabase/migrations/20260727000200_security_definer_helpers.sql` | `current_role()`, `current_family()`, `current_profile()`, `has_permission()` — all `SECURITY DEFINER` with `search_path = ''`. |
| `supabase/migrations/20260727000300_core_identity_policies.sql` | RLS policies per the `SPEC.md` §4 matrix, plus the privilege-escalation trigger on `profiles`. |
| `supabase/migrations/20260727000400_notifications.sql` | `notifications` table, RLS, policies, and the `UPDATE (read_at)` column grant. |
| `supabase/seed/seed.mjs` | Three fixture users (admin/staff/parent), the parent's family with one rider, a **second control family** the parent must not see, levels, one notification each. |
| `tests/policies.test.mjs` | Two parts: **ALLOW** (exact per-role row visibility) and **DENY** (adversarial — privilege escalation, column tampering, cross-family reads, staff write attempts). Runs through the **anon** key with real sessions — never the service role. |

The DENY half is the half that matters: an allow-only suite passes just as happily against a
table with RLS switched off, because "can see it" is true when everyone can see everything.
Only the deny cases distinguish a working policy from an absent one.

Access summary for the Phase 0 tables:

| Table | admin | staff | parent |
|---|---|---|---|
| `levels` | full | read | read |
| `families` | full | read all | read own family only |
| `riders` | full | read all | read own family's only |
| `profiles` | full | read all | read own + own family; may edit own name/phone only |
| `notifications` | own + insert | own | own; may set `read_at` only |

---

## Part 2: connect Supabase

Phase 0 is not done until every box below is ticked. Nothing in this list has been done yet.

- [ ] **1. Create the Supabase project.** Free tier, e.g. `crouse-barn`. Pick a region near
      Asheville (`us-east-1`).
- [ ] **2. Copy the keys.** Project Settings → API → Project URL, `anon` key, `service_role`
      key.
- [ ] **3. Paste them into `.env.local`**, replacing all three placeholder values. Confirm
      `.env.local` is gitignored (`git check-ignore .env.local` prints the filename).
- [ ] **4. Apply the migrations,** in filename order, either by pasting each file into the
      SQL Editor or with the CLI:

      npx supabase link --project-ref <your-project-ref>
      npx supabase db push

- [ ] **5. Run the seed** — creates the three test users and prints their shared password:

      npm run db:seed

- [ ] **6. Run the policy tests.** Every assertion must pass:

      npm run test:policies

- [ ] **7. Run the Security Advisor.** Dashboard → Advisors → Security Advisor. Fix every
      flag before proceeding — zero flags is the exit bar. Also enable **leaked password
      protection** (Authentication → Policies), which the advisor checks but no migration
      can set.
- [ ] **8. Configure auth redirect URLs.** Authentication → URL Configuration → Redirect
      URLs: add `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/confirm`
      (plus the deployed origin later). Magic links fail silently without this.
- [ ] **9. Log in as each of the three users** and confirm the correct empty tabs:
      - `phase0.admin@example.com` → Home · Schedule · Manage · Shows · More
      - `phase0.staff@example.com` → Home · Clock · Tasks · Schedule · More
      - `phase0.parent@example.com` → Home · Lessons · Shows · More

      No cross-role tabs, no errors. Test the magic-link path *and* the password path.
- [ ] **10. Run the leak check against a real build:**

      npm run verify

- [ ] **11. Check the PWA.** Install it on a phone; confirm it works one-handed at a 380px
      viewport with no horizontal scroll.
- [ ] **12. Remove the dev role switcher.** Delete `components/DevRoleSwitcher.tsx` and
      `lib/dev-role.ts` and their call sites in `app/(app)/layout.tsx`, `app/sign-in/page.tsx`,
      `app/account-pending/page.tsx`, `lib/session.ts` and `lib/supabase/middleware.ts`.
      Keep `/account-pending` itself — that screen is real behaviour, not scaffolding.
- [ ] **13. Delete the fixture data** before any real family is added — the two Phase 0
      families, their riders, and the fixture notifications.

---

## Cloning for a new barn

The app is standalone for Crouse but built to be duplicated. One barn = one Supabase project
+ one config file.

1. Copy the repo. Rename it and the `name` field in `package.json`.
2. **Edit `config/barn.ts` — and nothing else.** `id`, `name`, `shortName`, `owner`, `area`,
   `timezone`, `brand` colours, `lessons` durations, `backfillCutoffMinutes`, `geofence`,
   feature flags. No barn fact is hard-coded anywhere else; the manifest, icons, theme colour
   and page titles all derive from this file.
3. Replace `public/brand/<logo>.svg` with the new barn's logo and point `brand.logoSrc` at it.
4. Regenerate the placeholder icons (`npm run icons`) or drop in real artwork at
   `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`.
5. Create a fresh Supabase project and run [Part 2](#part-2-connect-supabase) against it.
   Never point two barns at one project — RLS scopes families within a barn, not across barns.
6. Deploy to its own host project with its own env vars.

If you ever need a barn fact that isn't in `config/barn.ts`, **add it to the config** rather
than inlining it in a component. That rule is what keeps the clone path a weekend of work.

---

## Open items for Belle

These are **placeholders, not facts.** Confirm before Phase 1 — nothing invented.

| Item | Current state |
|---|---|
| Exact brand hex values | `gold #C7A24A`, `cream #F6F1E7`, `ink #2B2B2B` — **PROVISIONAL**, read by eye from the Squarespace site. Needs the real brand values. |
| Logo | `public/brand/crouse-logo.svg` is a **placeholder mark**, not a Crouse asset. Needs the real gold wordmark (transparent SVG/PNG). |
| PWA icons | Generated placeholders in the provisional colours. Need real artwork. |
| Barn geolocation | `geofence: { lat: null, lng: null, radiusM: null }` — needed for the Phase 1 staff clock-in geofence. |
| Domain | Not decided. Deploys to the host's default URL until then. |

Everything in the config *not* on this list is confirmed: barn name, owner, area, timezone,
45/60-minute lessons, 120-minute backfill cutoff.
