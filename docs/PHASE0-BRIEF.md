# Crouse Barn App — Phase 0 Skeleton Build Brief

**Author:** Ridgeline Marketing (Web Architect)
**For:** Claude Code (build agent) — run this in the Code tab
**Source of truth for the full app:** `BARN APP from claude chat explainer.md` (keep a copy in the repo root as `SPEC.md`)
**Status:** COO-approved (special project — custom app stack explicitly ordered by David; the static-HTML-only rule does not apply here)

---

## 0. What this document is

This is the **Phase 0 (Foundation / "skeleton")** brief only. It turns the approved
explainer spec into a precise, buildable scope for the first milestone. Later phases
(operations, barn depth, shows & money) stay defined in the explainer/`SPEC.md` and are
**out of scope** until Phase 0 exits clean.

**Two rules that shape everything below:**

1. **Standalone for Crouse, duplicatable by design.** We are building one app for one
   barn (Crouse Equestrian). But every barn-specific value lives in **one config file**
   (`/config/barn.ts`). App code never hard-codes a barn fact. Cloning for a future barn =
   new Supabase project + new config file + new logo. The README documents that clone path.
2. **Security is the architecture, from line one.** Row Level Security (RLS) is enabled on
   every table in the same migration that creates it. The browser only ever holds the
   Supabase anon key. The service role key lives only in server-side code. This is
   non-negotiable and is checked in CI.

---

## 1. Client facts (verified) — for the Crouse config

These are confirmed and safe to put in `/config/barn.ts`:

| Field | Value |
|---|---|
| Barn / app name | Crouse Equestrian |
| Owner / admin | Belle Crouse (USDF Bronze Medalist; dressage, eventing, western) |
| Area | Asheville / Candler, NC |
| Timezone | `America/New_York` |
| Disciplines (v1 focus) | Dressage (primary); eventing/western noted |
| Lesson durations | Private 45 min, Group 60 min |
| Backfill cutoff | 120 minutes (spec default) |

**Placeholders — do NOT invent; confirm before shipping:**

- **Exact brand colors (hex).** Crouse's brand reads as **gold + cream/white** on their
  Squarespace site, but I do not have the exact hex values. Config ships with clearly-marked
  provisional values (`gold #C7A24A`, `cream #F6F1E7`, `ink #2B2B2B` — PROVISIONAL). Confirm
  with Belle or extract from her official brand assets before Phase 1.
- **Logo file.** Crouse uses a gold "Crouse" wordmark. We need the actual logo asset
  (SVG/PNG, transparent). Placeholder logo used until Belle provides it.
- **Barn geolocation (lat/lng + radius).** Needed for staff clock-in geofence in a later
  phase — leave as a config placeholder now; get the farm's coordinates from Belle.

> Per Ridgeline rules: never invent client facts. Anything above marked PROVISIONAL/placeholder
> must be confirmed with Belle, not guessed at, before it goes live.

---

## 2. Phase 0 scope (build exactly this — nothing from later phases)

**Foundation:**
- New repo. **Next.js 14+ (App Router) + TypeScript + Tailwind CSS.**
- Supabase wired: Postgres + Auth + Storage. `@supabase/ssr` for server/client split.
  Client code uses the **anon** key only. Service role key is server-only (API routes / edge).
- `/config/barn.ts` — the single barn-config file (see §3). All barn-specific values here.

**Auth:**
- Email **magic link + password** sign-in. Simple sign-in screen.
- On first load, resolve the signed-in user's `profiles` row → `role` → render their tab bar.

**Data model (Phase 0 tables only):** `profiles`, `families`, `riders`, `levels`.
- Every table: `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`.
- **RLS enabled in the same migration as each table.** Default deny.
- Role/permission reads via `SECURITY DEFINER` functions (`current_role()`,
  `current_family()`, `has_permission()`) to avoid recursive RLS — per explainer §6.
- Family-scoped read policies for parents; staff/admin per the §4 access matrix (only the
  four Phase-0 tables need policies now).

**App shell:**
- PWA: `manifest.json` + service worker (via `next-pwa` or manual) + install prompt hook.
- **Role-driven bottom tab bar** (max 5 tabs), rendering empty/stub screens per role:
  - Parent: `Home · Lessons · Shows · More`
  - Staff: `Home · Clock · Tasks · Schedule · More`
  - Admin: `Home · Schedule · Manage · Shows · More`
- `notifications` table + a **bell icon with unread badge** (feed can be empty for now).

**Guardrails / infra:**
- `.env.example` with every required var documented; real `.env` git-ignored.
- **CI grep check**: fail the build if the service role key (or `SUPABASE_SERVICE_ROLE`)
  appears in any client-reachable bundle.
- **Policy test suite** (pgTAP or a script): for each role fixture (admin/staff/parent),
  assert exactly which rows are visible per table. Wire it into CI.
- Seed **three test users** — one admin, one staff, one parent (parent linked to a family
  with one rider) — so the exit check is runnable.

**Explicitly NOT in Phase 0:** announcements content, clock-in, QBO, tasks, lessons,
horses, shows, invoices, shop. Those are Phase 1–3. Do not build them; do not stub their
tables yet beyond what's listed.

---

## 3. `/config/barn.ts` — shape to create

A single typed object. App reads brand, name, timezone, and **feature flags** from here.
Phase 0 flips on only the foundational surfaces; later phases enable their own flags.

```ts
export const barn = {
  id: "crouse",
  name: "Crouse Equestrian",
  shortName: "Crouse",
  timezone: "America/New_York",           // America/New_York
  brand: {
    // PROVISIONAL — confirm exact hex with Belle / brand assets before Phase 1
    gold: "#C7A24A",
    cream: "#F6F1E7",
    ink:  "#2B2B2B",
    logoSrc: "/brand/crouse-logo.svg",     // placeholder until Belle provides asset
  },
  lessons: { privateMin: 45, groupMin: 60 },
  backfillCutoffMinutes: 120,
  geofence: { lat: null, lng: null, radiusM: null }, // placeholder — get from Belle
  features: {                              // Phase 0: only shell-level flags on
    announcements: false,
    clockIn: false,
    tasks: false,
    horses: false,
    shows: false,
    invoices: false,
    shop: false,
  },
} as const;
```

---

## 4. Definition of Done — Phase 0 exits when ALL are true

- Three test users (admin / staff / parent) log in and each see the **correct empty tab bar**
  for their role — no cross-role tabs, no errors.
- Supabase **Security Advisor is clean** (zero flags) after the migration.
- **Policy tests pass** in CI for all three role fixtures.
- CI **service-key leak check** passes (no service role key in client bundles).
- App **installs as a PWA** and works one-handed on a 380px viewport with no horizontal scroll.
- `/config/barn.ts` is the only place Crouse-specific values appear; README documents the
  clone-for-a-new-barn steps.

---

## 5. Prerequisites David must set up first (before running Claude Code)

The skeleton needs a live Supabase project. Before the Code tab run:

1. **Create a free Supabase project** (name it e.g. `crouse-barn`). From Project Settings → API,
   grab: `Project URL`, `anon` public key, and `service_role` key.
2. **Decide the repo location** on your machine (suggested: `C:\Dev\crouse-barn-app`).
3. Have those three Supabase values ready to paste into `.env` when Claude Code asks — do
   **not** paste the `service_role` key anywhere client-side; it goes in server env only.

Vercel, Resend, Stripe, and QuickBooks are **not** needed for Phase 0 — they come in later phases.

---

## 6. How to proceed

Open the Code tab in the repo folder and paste the kickoff prompt from
`CLAUDE-CODE-KICKOFF.md` (delivered alongside this brief). It references this brief and the
full `SPEC.md` so Claude Code has the complete source of truth while building only Phase 0.
