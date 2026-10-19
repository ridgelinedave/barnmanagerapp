# Phase 2 — progress report

**Branch:** `phase-2` · branched from `phase-1-complete` (`54cdd11`)
**`main` = `phase-2` at `6bb0d0a`** (2026-08-18). `main` is the deploy trunk.
**Date:** 2026-07-29, updated 2026-07-31 (design pass merged, Team panel added),
brought current 2026-10-18 through `6bb0d0a` (see "Since 0018" below)
**Deployed.** Vercel builds `main` from GitHub (`ridgelinedave/barnmanagerapp`,
private) against the live Supabase project, since 2026-08-18.

---

## Since 0018 — `2a3f284..6bb0d0a`, 2026-08-09 to 2026-08-18

Everything below this section was written on 2026-07-31 and is accurate as
history, but its counts and its "Headline" are two months old. This section is
the current state.

**Verified 2026-10-18, this session.** After 61 days untouched the Supabase
project had been paused by the platform and was restored by David; once it was
back, with no code change:

- `npm run verify` — green. Typecheck clean, lint 0 errors / 6 pre-existing
  warnings, build compiled (45 pages), leak check passed, pdf 12, ical 30,
  invites 27, age 36, month 48.
- `npm run db:verify` — schema matches the migrations: 33 tables with RLS on,
  130 policies, 42 SECURITY DEFINER functions all with a pinned search_path,
  15 guard/fan-out triggers, both Storage buckets (`documents`, `shows`)
  private.
- `npm run db:gate` — **628 passed, 0 failed, 0 skipped**, twice with no
  re-seed. Advisor **clean across 8 lints**.

**Suite count history since 0018:** 567 → 568 (calendar-token assertion
corrected) → 569 + 1 skipped section (0020 written, unapplied) → 585 (0020
live) → 589 (0021: the definer sweep picked up two new functions by itself) →
591 (navigation) → 596 (0022: five new functions) → **628** (`6bb0d0a`: the
"barn ops — supplies, water, plans, maintenance" section, 32 explicit RLS
assertions over the five 0022 tables).

### Migrations 0019–0022

| # | File | What | Flag |
|---|---|---|---|
| 0019 | `20260731000400_horse_description.sql` | `colour`, `sex`, `height_hands` as real columns on `horses`, with CHECKs | — |
| 0020 | `20260731000500_training_logs.sql` | `training_logs`, shaped like `care_events`: owns-not-rides visibility, staff insert-only, `logged_by` pinned | — |
| 0021 | `20260731000600_shows.sql` | `shows`, `show_entries`, `show_results`, the private `shows` banner bucket, two definer helpers | `shows` **on** |
| 0022 | `20260817000100_barn_ops.sql` | `supply_items`, `water_sources`, `blanket_plans`, `turnout_plans`, `maintenance_requests`, column guards, `enqueue_boarder_supply_notices()` | — |

Migration files on disk: 22, from `20260727000100_core_identity.sql` through
`20260817000100_barn_ops.sql` (plus the generated `_ALL.generated.sql`).

### The commits, from `git log`

| Commit | Date | Subject |
|---|---|---|
| `89429b6` | 2026-08-09 | Visual foundation: retire cream, de-AI the chrome, feed board by horse |
| `3647088` | 2026-08-09 | Sign-in and splash: the real crest, standing alone |
| `8fad3c6` | 2026-08-09 | Apply migration 0019: colour, sex and height as real columns |
| `87c5b15` | 2026-08-10 | Monarch: accent as a theme token, light chrome, Cinzel wordmark |
| `088282c` | 2026-08-10 | Rider age bands (confirmed), and training_logs — SQL not applied |
| `c675ca6` | 2026-08-10 | Apply migration 0020: training_logs live |
| `2237fa7` | 2026-08-11 | Belle's oxblood palette replaces Electric Cobalt |
| `6a9f2f1` | 2026-08-11 | Calendar: month grid and agenda over lessons, events and care |
| `0147710` | 2026-08-12 | Forms: template authoring, issue flow, checklist-of-cards |
| `525f17d` | 2026-08-13 | Sign-in: quiet "Powered by Monarch" signature |
| `55257e3` | 2026-08-13 | Policy suite: prove the last-admin guard without assuming one admin |
| `6146560` | 2026-08-13 | Warm the palette app-wide: blush ground, oxblood masthead |
| `28c7770` | 2026-08-13 | Shows hub: migration 0021, the carousel screen, and demo data |
| `aa5d45b` | 2026-08-13 | Navigation cleanup and an editorial announcements feed |
| `b51d317` | 2026-08-13 | Shows management: create/edit, roster, results, banners |
| `e1e7e8f` | 2026-08-17 | Navigation: one five-tab bar — Home, Schedule, Barn, Lessons, More |
| `9589266` | 2026-08-18 | Barn ops: supplies, water, blanketing, turnout, maintenance |
| `6bb0d0a` | 2026-08-18 | Barn ops: encode the RLS scoping, and make the notice demoable |

### What changed, by subject

**Palette — oxblood, and the accent is a theme token.** Cream is gone
(`89429b6`). The accent became four tokens split by job — `fill`, `on`,
`tint`, `text` — so a component names `bg-accent text-accent-on` and never a
colour (`87c5b15`). Belle's oxblood replaced the interim Monarch cobalt
(`2237fa7`): fill `#6E1A3D`, on `#FFFFFF`, tint `#F1E9E9`, text `#4A002A`.
Gold `#C2AE6D` is decorative only and deliberately not an accent token. The
ground warmed to blush `#F6EDEF` with an oxblood masthead (`6146560`). Full
record: `design/DESIGN-MASTER.md` §16a–16b.

**Monarch.** The product brand, kept in config as its own object separate from
`barn` — that split is the white-label model (`87c5b15`). Cinzel for the
wordmark only. "Powered by Monarch" on More and, in an `onDeep` tone, on
sign-in (`525f17d`).

**Horses.** 0019 made colour, sex and height real columns and deleted the
regex that mined height out of `notes` (`8fad3c6`). 0020 added training logs to
both horse profiles (`088282c`, `c675ca6`). The feed board is by horse, not by
meal (`89429b6`).

**Calendar** (`6a9f2f1`). Month grid and agenda over lessons, events and care,
no new SQL. Later folded into Schedule as its Month and Agenda views, with
`/calendar` redirecting (`aa5d45b`). `tests/month.test.mjs`, 48 assertions.

**Forms authoring** (`0147710`). Admin builds, edits and issues forms without
touching the database; no migration (`form_templates.schema` is jsonb).

**Shows hub and shows management.** 0021 and the Upcoming / Results / Pinned
hub (`28c7770`); create/edit, roster, results and banners via signed URLs
(`b51d317`). "Results" means *has results*, not *is in the past*.

**Navigation — one five-tab bar** (`e1e7e8f`). Home, Schedule, Barn, Lessons,
More — the same five for every role. The Manage tab is gone; `/manage/*` is
untouched and still admin-gated, because gating is now stated directly in
`ROLE_PATHS` in `lib/nav.ts` instead of being inferred from the tab list —
inferring it would have locked Belle out of every management screen. Shows
moved to `/lessons/shows` (`/shows` 308s). More became Settings, led by Team &
access. The launch screen only shows on a cold boot; tab switches get
skeletons (`aa5d45b`).

**Barn ops** (`9589266`, `6bb0d0a`). 0022 and five screens under the Barn tab:
supplies (Crouse stock and boarder requests, always separated), water troughs,
blanketing, turnout, maintenance. Adding a boarder supply notifies the family
from the server action, not a trigger, so a notification failure cannot roll
back the item. `6bb0d0a` encoded the scoping as 32 policy assertions and
fixed a cleanup that was a silent no-op on the append-only `notifications`.

**Rider age bands** confirmed by Belle: 6–9, 10–12, 13–17, 18–29, 30–50, 51–80,
inclusive, clamping to the nearest band (`088282c`). `tests/age.test.mjs`, 36
assertions.

**Policy suite hardening.** Four assertions that asserted absolute "zero rows"
were rewritten to assert "none of the ones that are mine" — the shape that
breaks the moment real or demo data exists (`87c5b15`, `c675ca6`, `2237fa7`,
`28c7770`). The last-admin section now builds its state inside BEGIN …
ROLLBACK, so it holds with any number of real admins (`55257e3`).

### Deployment

`main` has deployed to Vercel since 2026-08-18. Nothing in the repo configures
the host — there is no `vercel.json` and no `.vercel/` — so the deployment's
settings live in the Vercel dashboard, not here. A merge to `main` is a
production release.

### Not verified in this session

- Anything about the running production deployment (its URL, its env vars,
  whether it was serving while the Supabase project was paused).
- Any layout above 390px. Every UI measurement in the commits above was taken
  at 390 and 320 only. (The desktop shell below is the first thing measured
  wider.)

---

## Learning modules (migration 0023) — Cloudflare Stream (2026-10-19, `phase-2`)

**SQL history, all audited by David.** 0023 draft 1 (Supabase Storage bucket)
approved and applied → the new suite section's positive controls caught a
defect (an INSERT … RETURNING is checked against the SELECT policy, which
re-read the table and could not see the new row) → amendment approved and
applied → David's correction: video goes to **Cloudflare Stream only** →
revision 2 approved and applied. Revision 2 has no bucket; a lesson stores
`video_provider = 'cloudflare_stream'` + `video_id` (32-hex, CHECKed so a
path, URL or token cannot be stored). Its CONVERGE block removed draft 1's
storage policies and helper; the empty `learning` bucket (0 objects) was
removed through the Storage API because SQL deletion is blocked by
`protect_buckets_delete`. `db:verify` now fails if a `learning` bucket or
policy ever reappears.

**App.** `/lessons/learn` (titled by `barn.learning.label`, "CE Academy" for
Crouse — no barn name in a route), module page (publish / unpublish, reorder
through `learning_reorder_lessons` with the whole list), lesson page (one
`VideoPlayer`, notes; empty notes show members nothing and the admin a marked
placeholder "to be written by {owner}"). Feature flag `learning` on for review;
modules are drafts until published.

**Privacy path.** `loadModule` reads on the viewer's own session → RLS
(`learning_audience_allows` / `learning_module_is_readable`) → no row = 404,
no Cloudflare call → only for a returned row does `lib/video.ts` →
`lib/stream.ts` (server-only) mint a 2-hour signed token, and the page renders
the player with it. No route or action accepts a bare video id. `streamPlayback`
refuses a video Stream does not report as `requireSignedURLs`.

**Credentials.** Only `lib/stream.ts` reads them (`check:leak` source rule);
none under `NEXT_PUBLIC_`; `tests/stream.test.mjs` (36) proves no thrown error
or stack carries either value; `check:leak` now loads `.env.local` and found
neither VALUE in any client-served file; a scan of all 1,846 files under
`.next` (server and client) found 0.

**Blocked: the upload.** `scripts/learning-stream-seed.mjs` (tus, 50 MiB
chunks, `requiresignedurls` at creation) got HTTP 403 creating the upload.
The token verifies as an active account token, but every Stream endpoint,
reads included, returns Cloudflare error 10002 — the token has no Stream
permission or the account has no Stream subscription. The empty draft module
that run created was deleted, and the script now uploads BEFORE writing to
the database. Not done until the token is fixed: the upload, the seeded
module, and `scripts/learning-privacy-check.mjs` (control: the admin's real
page plays — manifest, rendition, segment; denied: bare id, tampered token,
signed out, a family on a draft).

Gate: verify green (nav 117, stream 36; leak check clean against the real
values), db:gate 677 / 0 / 0 twice, advisor clean. Measured at 320, 390, 1024,
1440 on /lessons and /lessons/learn (empty state; the dev preview has no
session): clean on every audit item; an unknown module id is a 404 with no
player.

---

## Aesthetics pass — two registers, and the generated-UI tells removed (2026-10-19, `phase-2`)

**No SQL, no migration, no policy, no flag.** Presentation only.

**The kill list, applied tree-wide.** Every elevation shadow is gone (only
the inset press lip on primary buttons remains). No radius above 6px — chip,
sheet and avatar tokens moved to 3px / 6px / 6px, and the last `rounded-lg`,
`rounded-full` and 12px corners were swept. Section labels are the new 11px
uppercase `text-micro` over a full-width hairline, left-aligned. Empty states
are one left-aligned sentence (title in ink, body in muted) — no box, no
centring. Chips are outlined: 1px border in the status colour, transparent
fill, icon kept. Screen titles are Barlow Condensed at 31px on the phone and
20px in the desktop page header, tracking −0.02em.

**One accent.** Oxblood now appears only on primary buttons, the active nav
item (tab bar, sidebar, sub-view tabs, filter chips) and the selected
calendar day. Removed from: card left edges, section headings, neutral chips,
avatars, icon tiles, links, the featured-announcement block, the shows banner
gradient, the calendar's "today", the focus ring (now ink; gold on the
oxblood header), the bell badge (now white/ink). The phone's AppHeader keeps
the oxblood brand plane; on the desktop shell the page header is light and the
only deep plane is the sidebar's brand block.

**Desktop register.** Light page header: title left, primary action right,
1px border, sub-view tabs beneath (`TabPage tabs=`; Schedule uses it).
`wide` bucket = fluid, capped at 80rem with 32px gutters. Sidebar: 11px
group labels, ~32px rows, active = oxblood left border + blush tint.
`components/ui/DataTable.tsx`: 13px, 40px rows, hairlines, whole-row hover,
11px headers, tabular right-aligned numbers, URL-driven sort with
`aria-sort`. Tables now on: timesheets, supplies, team (people + invites),
show roster + results, horses, care due, care history, forms (submissions +
templates), punches. Phone keeps its cards on every one of them.

**Density** is declared per screen (`TabPage density=`): tight on the data
screens, airy on the horse profiles and the show page.

**Found and fixed on the way:** `Field` inputs used `focus:border-accent-deep`,
a token that does not exist — a focused field never changed border; the
horse-document file button was ink on oxblood (~1.2:1); four hard-coded barn
facts in UI strings ("Crouse supply" twice, "Belle" twice) now come from
config or are generic; a skip link was missing.

**Measured this session** (dev-role preview, which renders no data):
320 and 390 — no sideways scroll, max radius 6px, zero elevation shadows,
nothing centred, oxblood only on the brand header / active nav / primary
buttons, no target under 44px except the dev-only role switcher, on /home
/barn /barn/supplies /schedule /schedule?view=month /lessons/shows
/manage/team /manage/forms /manage/timesheets /more. 1024 / 1280 / 1440 —
light page header, 20px title, sidebar the only deep plane, `wide` main =
768 / 1024 / 1120px wide beside the sidebar, no sideways scroll, ink focus
ring, skip link first in the tab order. DataTable measured on synthetic rows
in a temporary page (deleted before commit): rows 40px, headers 11px
uppercase, body 13px, numbers right/tabular, `aria-sort` correct.

**Not measured:** any table with real data (the dev preview reads nothing
under RLS), WebKit, the month-view day cells at 320px (40×52, under 44 wide —
pre-existing; seven columns cannot be 44px at that width).

Gate: verify green (0 errors, 6 baseline warnings; nav 115), db:gate 628 / 0
/ 0 twice, advisor clean across 8 lints.

---

## Desktop shell — one app, two shells (2026-10-18, on `phase-2`, not on `main`)

**No SQL. No new table, policy, function or migration; no feature flag
touched.** Presentation only, to DESIGN-MASTER §14b. Not merged: David reviews
it on a laptop first.

**What it is.** From Tailwind's `lg` breakpoint (1024px) the app swaps the
five-tab bar for a persistent sidebar; below it, nothing changes. Both chromes
are rendered and CSS picks one, so the right shell is on the first paint with
no flash and the hidden one is out of the accessibility tree and tab order.

**Where things are.**

| File | What |
|---|---|
| `lib/nav.ts` | The destination lists that used to live inside the Barn, Lessons and More pages; `visibleEntries()`; `sidebarFor()`, which DERIVES the sidebar from the tabs and those lists through `roleCanAccess`; `currentHref()` (longest match wins, so exactly one link is current). `ROLE_PATHS` and `roleCanAccess` unchanged. |
| `components/Sidebar.tsx` | Draws the model. Decides nothing. |
| `components/layout-buckets.ts` | `reading` (default, the 640px column at every width) / `split` / `wide`. Below `lg` every bucket is byte-identical to the old column. |
| `components/TabPage.tsx` | `layout` and `detail` props. No screen sets them yet. |
| `components/AppHeader.tsx` | Follows the bucket; crest hidden at `lg` (it is in the sidebar masthead); pinned to 74px at `lg` so it lines up with the masthead. |
| `components/AppLoading.tsx` | Skeleton uses the default bucket; cold-load launch screen covers the whole window at `lg`. |
| `components/TabBar.tsx` | `lg:hidden`. |
| `app/(app)/layout.tsx` | Renders the sidebar; `lg:pl-64`. |
| `app/(app)/{barn,lessons,more}/page.tsx` | Read their rows from `lib/nav.ts`. Output unchanged. |
| `app/globals.css` | Focus ring is gold on the deep plane (`data-plane="deep"`); it was an invisible oxblood-on-oxblood ring on the header. |
| `tests/nav.test.mjs` | `npm run test:nav`, wired into `verify`. 115 assertions. |

**The R1 proof** (`test:nav`, 115 passed / 0 failed). For every role, with all
flags on and all off: every rendered link is accepted by `roleCanAccess`; no
destination the gate denies is rendered; no registry entry names a role the
gate refuses; every href has a `page.tsx`; every `/manage` screen is in the
admin sidebar and none is offered to staff or parents; on every page exactly
its own link is current. Two mutations confirmed the test bites: listing
`/manage/team` for every role failed 1 assertion; additionally stripping the
gate out of `sidebarFor` failed 11.

**Measured, this session** (dev server, dev-role preview cookie, no sign-in):

- **320 and 390 — unchanged.** A layout fingerprint (every rendered element's
  rect, in order, outside the sidebar) was taken on the original code and on
  this one: admin on /home /schedule /barn /lessons /more /manage/team
  /barn/water, parent on /home /barn /lessons /more. **22 of 22 identical.**
  No sideways scroll anywhere.
- **768 and 1023** — still the mobile shell: tab bar visible, sidebar not in the
  tab order, content the same centred 640px column.
- **1024, 1280, 1440** — desktop shell: one visible `nav[aria-label=Main]`,
  exactly one `aria-current`, sidebar 256px, content column 640px starting at
  or right of it, header row aligned with the column, sidebar masthead and
  header both 74px, every sidebar row ≥ 44px, no sideways scroll.
- **Keyboard** — Tab reaches the sidebar first, `:focus-visible` ring shows,
  Enter navigates and `aria-current` moves; the sidebar element survives the
  navigation (same DOM node), so it does not re-render between screens.

**Not measured:** WebKit/iPad Safari, an actual laptop screen, the
`split` and `wide` buckets (no screen uses them yet), the subject-header
shape at desktop width (needs a horse record, which the dev preview cannot
read), and the full-window cold-load launch screen at `lg` (written, not
observed).

Gate: verify green (0 errors, 6 baseline warnings; pdf 12, ical 30, invites
27, age 36, month 48, nav 115), db:gate 628 passed / 0 failed / 0 skipped
twice, advisor clean across 8 lints.

---

## Headline

**All five slices are live.** `horses`, `care`, `documents`, `forms` and
`events` are on. The `design-pass` branch is **merged in** (fast-forward, no
conflicts), and the **Team panel** is built on top of it.

**Suite: 567 passed, 0 failed, 0 skipped**, run twice with no re-seed. Advisor
**clean across 8 lints**. Plus `test:pdf` (12), `test:ical` (30) and
`test:invites` (27).

Migrations 0017 (invites) and 0018 (parents hold no flags) were both audited
and applied on 2026-07-31, and `features.invites` is **on**. The invites RLS
section switched itself on as designed — gated on the table existing rather
than on the flag — taking the suite from 533-with-a-skip to 559 with none;
0018's eight assertions bring it to **567**.

The green gate is now one command, and it includes the Advisor:

```bash
npm run db:gate    # seed → test:policies → test:policies (no re-seed) → db:advisor
```

| Slice | Migration | Flag | State |
|---|---|---|---|
| 1 — horses, rider links, feed plans | 0010 | `horses` **on** | Live |
| 2 — care events, due-soon, digest | 0011 | `care` **on** | Live |
| 3 — documents vault (Storage) | 0012 | `documents` **on** | Live |
| 4 — onboarding forms + PDF vault | 0013 | `forms` **on** | Live |
| 5 — events + iCal feed | 0014 | `events` **on** | Live |
| — security lockdown | 0015 | — | Live |
| — design pass (UI only) | — | — | Merged |
| — Team panel (admin UI) | **none needed** | — | Live |
| — at-least-one-admin rule | 0016 | — | Live |
| — invites / provisioning | 0017 | `invites` **on** | Live |
| — parents hold no flags | 0018 | — | Live |

---

## Team panel — the admin UI over the Phase 0 identity tables

**No SQL. Zero new migrations, policies, functions or triggers.**

This slice is a screen over four tables that migration 0001 created and 0003
policed on day one: `profiles`, `families`, `riders`, `levels`. All four
already carry admin-full / staff-read / parent-own-scope policies, and
`profiles` already carries the `profiles_guard_privileged_columns` trigger that
stops a non-admin editing their own role or flags. There was nothing left to
secure, so nothing was added.

The definer-function inventory printed by the suite is **unchanged** — 3
internal, 20 entry points, 9 triggers — which is the mechanical proof that no
SECURITY DEFINER function was introduced.

`/manage/team`, admin only, three sections:

**A — People.** Every profile, sorted admin → staff → parent. Role changes,
permission-flag toggles, name and phone. Three rules the screen has to respect,
and how:

- **`family_id` must be null unless the role is `parent`.** Confirmed against
  the live database rather than read off the DDL: `update profiles set
  role='staff'` on a parent **is refused** by
  `profiles_family_only_for_parents`, and the same update **with `family_id =
  null` in the same statement succeeds**. So `updatePersonRole()` clears the
  family in the same statement — not as tidiness, but because the two-statement
  version cannot work. The sheet warns before you submit, and a rejection comes
  back as a sentence ("Only parents belong to a family…") rather than a raw
  constraint name.
- **An admin implicitly holds all three flags** (`has_permission()` returns
  true for admin without reading the columns), so an admin row shows
  "All permissions included with admin" instead of three unticked boxes that
  would imply the opposite. The toggles render for staff, which is where they
  are the real lever. Parents get no flag row at all.
- **The last admin cannot be demoted.** Guarded in two places — see migration
  0016 below. The action's check exists for the *message*; the trigger is the
  guarantee.

No delete-person, by design.

**B — Families & riders.** Families (name, notes, rider count) and their riders
(level, active, photo, notes). Neither has a login, so both are created freely.

**There is no age column and there must never be one.** Age is derived from
`dob` at read time (`ageFromDob()` / `ageGroupFor()` in `lib/dates.ts`) — a
stored age is wrong within a year of being typed. The derivation compares
`YYYY-MM-DD` strings rather than subtracting milliseconds, which gets DST and
leap-day birthdays right for free. Verified end to end: a rider born
2013-09-15, read on 2026-07-31 (before the birthday), renders age 12 → bracket
"11–13".

**The bracket boundaries are a PLACEHOLDER** in `config/barn.ts`
(`riderAgeGroups`), flagged on-screen and below. They are common show
divisions, not Belle's.

**C — Levels.** Add, rename, reorder. Reorder rewrites the whole list's `sort`
values rather than swapping two numbers: `sort` defaults to 0 and nothing
enforces uniqueness, so two levels can hold the same value and swapping equal
numbers moves nothing while looking like it worked.

Measured at **390px and 320px**: no overflow, no target under 44px, no AA
contrast failure — including inside all 30 bottom sheets, which had to be
force-opened to measure because a closed `<dialog>` is `display:none`. **Zero
emoji** in the rendered page.

---

## Invites / provisioning — LIVE

Migration 0017 audited and applied 2026-07-31, `_ALL.generated.sql`
regenerated, `features.invites` on, advisor clean, suite green including the
invites section, and **both live checks passed** (see below).

**The shape, and why it is forced.** `profiles.user_id` is NOT NULL and
references `auth.users`, so a profile cannot exist before its login does. But
the barn owner has to decide the role, the family and the flags *before* the
person has an account. Those decisions therefore need somewhere to live in the
meantime — that is the whole reason `invites` exists. The profile is created at
the moment of claim, from the invite row.

**The token is a bearer credential**, the same class of thing as
`ical_tokens.token`: holding it is the entire authorisation to create an account
with the role written on it. Same guard shape, same reasoning — the client can
never choose it (`invites_token_guard` mints it on insert AND on regeneration),
and staff cannot even *read* the table, because a readable token is an account
someone else can create.

**What the claim route does**, in order, and why each step is where it is:

1. **Load by token, pending only.** Expired / revoked / used / malformed /
   nonexistent all return null and all produce one identical sentence. Naming
   the reason would confirm a guessed token was real, and "already used" would
   confirm there is an account to go after.
2. **Claim atomically.** A conditional `update … where accepted_at is null and
   revoked_at is null and expires_at > now()`. That single statement IS the
   lock: two simultaneous submits race on it and exactly one matches. The claim
   is **released** if account creation then fails, so a mistyped password does
   not burn the invite.
3. **Create the auth user** with `email_confirm: true` — the invite link is the
   verification, an admin handed it to someone they know. A duplicate email is
   detected by `createUser` itself rather than by pre-scanning the user list:
   the scan would be a paginated read of every user on every claim and would
   *still* be a race. Duplicates are **refused, never linked** — linking would
   let anyone holding a link escalate an account they do not own.
4. **Create the profile from the INVITE.** Every value comes from the invite
   row. The action never reads `role`, `family_id` or the flags from
   `formData`, so an invitee posting `role=admin` is not rejected — they are
   simply not consulted. If the profile insert fails, the auth user is
   **deleted** as well: a login with no profile is a person who can sign in,
   reach nothing but `/account-pending`, and never retry.
5. **Sign in** through the cookie-bound client, not the admin one.

⚠ Like the iCal feed, this route runs **unauthenticated with the service role**,
so RLS protects nothing there and the checks above *are* the boundary. Both the
route and `lib/invites-server.ts` say so at the top.

**Expiry is 14 days**, as `INVITE_LIFETIME_DAYS` in `lib/invites.ts` — not in
`config/barn.ts`, because it is a product rule rather than a barn fact; a second
barn should inherit it, not be asked. The column is NOT NULL with **no default**
so the rule cannot quietly live in two places.

**Status is derived, never stored** — "expired" is the one status that arrives
on its own, with no write to trigger an update.

### A real finding this turned up, verified not assumed

`public.has_permission()` short-circuits to true for admin and otherwise reads
the flag column **without checking that the role is staff**. So a *parent* row
carrying `manage_horses = true` genuinely holds barn-wide write permission.

Confirmed against the live database, control first: with the flag off the
parent's insert into `horses` was refused; with it on, **the insert landed**.
(The first attempt at this probe read back with `.select()` and appeared to
disprove it — the read-back fails the SELECT policy for a barn-owned horse, so
it was a false negative. Worth recording, because the same trap will catch the
next person.)

Nothing exploits this today: the Team panel never sets a flag on a parent, and
migration 0017's `invites_flags_only_for_staff` CHECK now refuses the
combination on the one path that creates a profile from stored values.
**But `profiles` itself still has no equivalent guard.** Listed under WHAT NEEDS
DAVID as its own small migration, deliberately not folded into this slice.

### Tests

`tests/invites.test.mjs` — **27 assertions, no database**: status precedence
(accepted beats revoked beats expired; accepted survives expiry), the expiry
boundary in both directions, flag normalisation per role, the share message, and
a check that the invalid-token string contains none of *expire / revoke / used /
already / exist / accept*.

The RLS suite's `invites` section (**29 assertions, now running**) covers what
the database guarantees: a client-chosen token is overwritten on insert and on
regenerate, `created_by` is pinned, the three CHECKs refuse an incoherent invite,
the claim predicate matches exactly one pending row and **zero** on a second
attempt, and staff / parent / anon cannot read, create, revoke or delete.

It is tested through the **admin session, not the service role** — this suite's
standing rule is that it never uses the service key, because a test that
bypasses RLS proves nothing about RLS. The claim predicate is identical either
way.

**One thing the suite got wrong, and the suite caught it.** The revoked-invite
deny test originally created its fixture already-revoked in a single INSERT and
failed — because `invites_token_guard` forces `accepted_at` and `revoked_at` to
null on insert, so an invite cannot be *born* revoked. The trigger was right and
the test was wrong. The fixture now becomes revoked by UPDATE (which the guard
leaves alone, so revoking still works), a control asserts the fixture really
reached that state before the deny is trusted, and the guard's born-pending rule
is now asserted directly instead of left implicit.

### The two live checks the suite cannot reach — both passed

Run against the dev server on 2026-07-31 with real invites created through an
admin session, then cleaned up.

**(a) A tampered claim gets the INVITED role, not the requested one.** A staff
invite (`manage_horses` on) was opened and the form was given extra fields
before submitting: `role=admin`, `manage_shows=on`, `manage_schedule=on`,
`manage_horses=on`, `full_name=Tampered Name`,
`family_id=00000000-0000-0000-0000-000000000000`. The created profile:

| sent by the tampered client | stored |
|---|---|
| `role=admin` | **staff** — the invited role |
| `manage_shows=on`, `manage_schedule=on` | **false, false** |
| `family_id=0000…` | **null** |
| `full_name=Tampered Name` | **LIVECHECK Tamper Probe** — the invite's |
| *(not sent)* | `manage_horses=true`, from the invite |

Every injected field was ignored. Not rejected — never read.

**(b) An email that already has an account is refused, not linked.** Claiming a
second invite with `phase0.admin@example.com` returned *"That email already has
an account here — contact the barn."* Verified afterwards: no second auth user,
no second profile, the admin fixture's profile unchanged, its original password
still working, and the password the claim tried to set rejected. The invite's
`accepted_at` went back to **null** — the failed attempt released the claim
rather than burning it, which is the behaviour the route is written for.

### A real bug these checks found

`/invite` was **not** in `PUBLIC_PATHS` in `lib/supabase/middleware.ts`, so the
middleware redirected the signed-out recipient to `/sign-in` — making the entire
flow unreachable for exactly the person it exists for. Nothing in the RLS suite
could have caught it: it is middleware, not a policy. Fixed, with a note on that
list that anything added to it is reachable by the internet with no session.

---

## Migration 0018 — a parent row can never carry a permission flag

The `profiles`-table mirror of `invites_flags_only_for_staff`, and the
structural close on the `has_permission()` quirk written up above.

`has_permission()` short-circuits to true for admin and otherwise reads the
flag column **without checking that the role is staff**, so a parent carrying
`manage_horses` genuinely holds barn-wide write access. 0017 closed the one
path that creates a profile from stored values; **0018 closes the data**. The
unsafe combination can no longer exist, so the quirk has nothing to act on —
which is better than a rule the app has to keep remembering.

```sql
alter table public.profiles
  add constraint profiles_flags_only_for_staff check (
    role <> 'parent'
    or (manage_shows = false and manage_schedule = false and manage_horses = false)
  );
```

**Admin is deliberately unconstrained.** It holds every permission implicitly,
so whatever its flag columns say is never read. Constraining them would forbid
a harmless state and break the ordinary staff → admin promotion, which does not
clear them. Only the one genuinely unsafe combination is forbidden.

**Checked before applying, not after.** A pre-flight query looked for existing
parent rows carrying a flag — there were none, across all four fixture profiles
— so the `ADD` could not fail opaquely.

**It changed an app path, which is the point.** Demoting a flagged staff member
to parent would previously have left the flags behind on a row where they now
grant real access. The constraint refuses that, so `updatePersonRole()` now
clears the flags **in the same statement** as the role change — exactly as it
already clears `family_id` on the way up, and for exactly the same reason: a
second UPDATE would arrive after the row was already a parent carrying flags.
A rejection surfaces as *"Parents hold no permissions. Untick what this person
manages before making them a parent."*

**Eight assertions, positive control first:**

| | |
|---|---|
| **control** | **a STAFF profile CAN be given `manage_horses`** — proves the constraint is not a blanket refusal of every flag |
| control | and it really stored |
| deny | an admin CANNOT give a PARENT `manage_horses` |
| deny | …with errcode **23514** |
| deny | and the parent's flag is still false |
| deny | demoting a FLAGGED staff member to parent is refused — the flags cannot linger |
| **control** | **demoting WITH the flags cleared in the same statement succeeds** — the hand-over path stays open |
| restore | fixtures back to staff-with-no-flags and a clean parent |

---

## Migration 0016 — "at least one admin" is now a database rule

`20260731000100_at_least_one_admin.sql`. An AFTER UPDATE OR DELETE trigger on
`profiles` that refuses any change leaving zero admins, for **everyone**,
service-role included. The app's check was a read-then-write and could not see
a race; this is the one place a race cannot pass.

**Why the advisory lock and not just a count.** Under READ COMMITTED (Supabase's
default) two concurrent transactions each still see the *other* admin in place,
so both counts return 1 and both demotions commit. `pg_advisory_xact_lock`
serialises them, and because a statement issued after the lock takes a fresh
snapshot, the second transaction sees the first one's committed demotion and
raises.

**One line was added to the SQL as drafted, and it was not optional.**

```sql
revoke all on function public.enforce_at_least_one_admin() from public, anon, authenticated;
```

Migration 0015 swept every SECURITY DEFINER function in `public` and revoked
EXECUTE from all three roles — but a sweep only covers what existed when it ran.
Postgres grants EXECUTE to PUBLIC on every *new* function and Supabase layers
its own default grants to `anon` and `authenticated` on top, so this function
would have been born open. That is not a theory: `db:advisor` lint
`0028_anon_security_definer_function_executable` tests
`has_function_privilege('anon', p.oid, 'EXECUTE')` against every `prosecdef`
function in `public`, so **without that line the green gate would have gone
red.** Confirmed empirically — an identical definer function created without a
revoke came out `anon`-executable. A trigger function needs no grant to fire, so
nothing is granted back.

**What the tests assert** (`tests/policies.test.mjs`, new standing-guard
section, 10 assertions), positive control before every deny:

| | |
|---|---|
| control | the barn starts with exactly one admin |
| control | admin can promote the staff fixture to admin |
| control | there are now two admins |
| **control** | **demoting one of two admins SUCCEEDS** — proves the trigger discriminates rather than refusing every demotion |
| control | one admin is left |
| deny | demoting the LAST admin is refused |
| deny | …with errcode **23514**, not an incidental failure |
| deny | deleting the LAST admin is refused |
| deny | …with 23514 too |
| restore | fixtures are back to one admin, staff is staff |

The legitimate hand-over (promote a successor, then step down) is **not**
exercised in the suite, deliberately: it would demote the admin fixture itself,
and every restore statement afterwards runs on that same session, which by then
is no longer admin — `profiles_guard_privileged_columns` would refuse to put it
back and the fixtures would be left broken for the next run. It is the same fact
as the fourth control above, and it *was* verified directly against the database
during the build.

The definer-inventory guard needed no change and stayed green: it picked the new
function up automatically and now reports **10 trigger functions skipped** (was
9), plus one more auto-generated "anon CANNOT execute" assertion. That is the
whole of the 521 → 532 jump: 10 new + 1 automatic.

---

## The Advisor found something an eyeball pass had missed for three phases

`npm run db:advisor` runs Supabase's own Security Advisor lints (the SQL from
github.com/supabase/splinter, copied verbatim) against the live schema, so the
check is part of the gate rather than something to remember. On its first run it
reported **26 findings** against lint 0028: **every** SECURITY DEFINER function
in `public` was EXECUTE-able by `anon`.

Nobody wrote that. Postgres grants EXECUTE to PUBLIC by default and Supabase
ships a *separate* default-privileges grant to `anon` and `authenticated` on
top — so every function not explicitly closed was open. Same mechanism as the
`backfill_book_rider` incident in Phase 1; we had only ever closed the functions
classified as internal.

**All 26 were probed before deciding anything.** Nothing was exploitable: the
nine trigger functions are unreachable over PostgREST, the admin entry points
raise on their own role checks (`respond_to_backfill_offer` was called against a
**real sent offer** — refused, status unchanged), `eligible_backfill_riders`
gates on `current_role()` inside the query and returned empty for a real
instance, and the policy helpers return null/false for a caller with no
identity. The one real leak was `instance_taken_seats`, which handed a seat
count to anyone who knew a lesson's uuid.

**Fixed rather than allowlisted** (migration 0015). It sweeps `pg_proc`, revokes
from `public, anon, authenticated`, then grants back to `authenticated` by name
— so the default for a function added in a later phase is now **closed**.
Forgetting to close something used to be silent; forgetting to open something is
now a loud, immediate failure.

Guarded three ways so it cannot drift back:
1. the policy suite asserts behaviourally that **no** definer function in
   `public` is reachable signed-out — data-driven from the migrations, so future
   functions are covered without anyone writing a new test;
2. `db:advisor` runs in the green gate;
3. `CLAUDE.md` documents the gate as seed → test → test → advisor.

**What the Advisor does not cover:** auth-config advisors — leaked-password
protection, OTP expiry, MFA options, Postgres version patches. Those live in the
Auth service, not the database, and cannot be seen over a Postgres connection.
**Still worth a look at Dashboard → Advisors before any launch.**

Every migration is applied to the live Supabase project and every slice is
committed separately on `phase-2`:

```
3b79783  slice 5 — barn events and the iCal subscription feed
f9c6eae  slice 4 — onboarding forms, e-signature and the PDF vault
d15fb5f  slice 3 — the documents vault (private Storage bucket)
6e12f20  slice 2 — care events, due-soon and the admin digest
fcaad13  slice 1 — horses, rider links and feed plans
```

**`main` was not touched. Nothing is deployed. No deferred work was attempted**
(QuickBooks, Resend/email, SMS/push, the Academy, the boarder persona), and the
shows phase was not started.

---

## WHAT NEEDS DAVID

1. **Confirm the rider age brackets** (Team panel, section B). `config/barn.ts`
   → `riderAgeGroups` currently reads **10 & under / 11–13 / 14–17 / Adult**.
   Those are common show divisions, **not Belle's** — they are a placeholder,
   marked as one in the config and on the screen itself. Different disciplines
   cut them differently and this is the sort of detail a parent notices
   immediately. One line to change once she confirms.

1. **A painted-pixel pass on the newly-live surfaces.** Their server output is
   verified — content, scoping, read-only vs editable, signed vs unsigned — and
   the admin horse page, the events calendar and the form fill/sign screen were
   measured at 390px with no overflow and every target ≥44px. But the Browser
   pane stopped compositing partway through, so **these are not measured at
   320px**: `/manage/forms`, `/more` (the subscribe block), and the documents
   list on `/more/horses/[id]` as a parent. The long unbroken strings on those
   screens — the calendar URL and document filenames — carry `break-all` and
   `break-words`, but that is reasoning, not a measurement. Worth one look on a
   real phone.
2. **Check Dashboard → Advisors** for the auth-config lints `db:advisor` cannot
   see (see above).
3. **Decide on the onboarding soft gate** (slice 4). SPEC §5 wants parents
   blocked from the app until required forms are signed. It is deliberately NOT
   wired up — the seam is `onboardingOutstanding()` in `lib/forms.ts`. Locking a
   paying family out of their lesson schedule over an unsigned waiver is a
   support call, so it should be a deliberate choice.
4. **Decide the care digest's cron semantics** (slice 2). Idempotency is per
   care item *forever*, so a weekly cron on `enqueue_care_due_digest()` would go
   quiet after the first week. Fine as a button; needs a week-scoped key as a job.
5. **Form templates are created in SQL for now.** There is no admin authoring UI
   for the `schema` jsonb — the dashboard lists templates and shows who has
   signed, but new templates are seeded directly. Worth knowing before Belle asks.
6. **Confirm the remaining `config/barn.ts` placeholders** — the geofence is
   still `null`, so clock-in flags nothing.
7. **Deployment is still unaddressed**, and the iCal feed is the first thing that
   genuinely needs a stable public host: a subscription URL that changes breaks
   every calendar that has it.

---

## Slices 3–5, in brief

### Slice 3 — documents vault (`documents` flag ON)

A **private** `documents` bucket, created with `public = false` and re-asserted
private on every re-run, so re-applying the migration is also the fix if anyone
flips it in the dashboard. Table RLS says nothing about Storage, so the rules
are four policies on `storage.objects`, each pinned to `bucket_id = 'documents'`
— a policy that forgot the bucket would widen access to every other bucket.

Visibility mirrors **care**, not horses: the owning family reads its own horse's
folder and its own family folder; a family whose rider merely rides the horse
gets nothing. Families never write — a document a family can add is a document
the barn did not verify.

The path convention (`horse_<uuid>/`, `family_<uuid>/`) **is** the boundary, so
it is parsed in exactly one place and built in exactly one place. Filenames are
sanitised before they become paths: a name containing `../` would otherwise
escape its horse's folder, which is a privilege escalation dressed as a
filename. The uuid is regex-checked before it is cast, because a malformed path
raising inside a policy turns a "no" into a failed query.

**The bucket's privateness is asserted behaviourally** — the public URL for a
real uploaded object, fetched with no session, must not serve the file.
`listBuckets()` returns nothing useful over an anon-key session, and a flag is
the wrong thing to test anyway. `db:verify` now covers Storage as well.

### Slice 4 — onboarding forms, e-signature, PDF vault (`forms` flag ON)

Everything here exists to make a signature mean something: identity columns are
immutable, `status` may only go pending → complete **with** a signature, the
signing timestamp is set by the database, a signed form cannot be edited by the
family, and a CHECK constraint refuses a signature-less "complete" row even from
the service role. Row policy decides which rows; the trigger decides which
changes. Staff see nothing on either table.

Signing runs on the parent's own session so the policy and trigger decide it.
The **PDF write runs as the service role** — families deliberately have no write
access to the vault — but only *after* the database accepts the signature, so
the privileged step is gated by the unprivileged one. If the PDF fails the
signature still stands: the row is the record.

**The PDF is hand-written** (`lib/pdf.ts`, ~150 lines) rather than pulled from a
library, because the only thing this app renders is labelled text and a
signature block, and a dependency in the legal-vault path has to be audited for
as long as the vault matters. `tests/pdf.test.mjs` covers what a reader rejects
on: xref offsets pointing at their objects, stream lengths in **bytes** not
characters, escaping, latin1 encoding, and pagination.

### The sign → PDF → vault path, exercised end to end

Signed a fixture waiver through the running app as a parent. The database
recorded the signature with a server-set `signed_at`; the server action rendered
the PDF and wrote it to `family_<uuid>/forms/…` in the private bucket as the
service role; the row's `document_path` was filled in. Downloaded it back:
**1,249 bytes, `%PDF-1.4` header, signature block present.** Fixture reset
afterwards so the suite stays green.

The submit was programmatic rather than a hit-tested tap — the pane was not
compositing — so this proves the **server** path, not that the button is
tappable. The button was separately confirmed to render at ≥44px and not be
overlapped.

### Slice 5 — events + iCal (`events` flag ON)

Staff-only events never reach a family. The calendar **token is a bearer
credential**, so it is readable only by its owner — not by staff, and **not by
admin**: a token an employee can read is an employee who can subscribe to a
family's schedule forever, and revoking their account would not revoke it. A
trigger forces the token to a server-generated uuid on insert and rotation.

The feed route runs with the service role and no session, so **RLS protects
nothing there and the scoping in the handler is the boundary** — stated at the
top of the file, with every query re-stating the rule its policy would have
applied. Unknown and malformed tokens both get 404.

Lessons are stored as barn-local date + wall clock and converted to UTC for the
feed, with a **two-pass** correction because a single pass lands an hour out on
the two DST boundary days. `tests/ical.test.mjs` covers that plus CRLF endings,
75-**octet** folding measured in bytes, and escaping.

Verified behaviourally: the feed returns **404, not a sign-in redirect**, so the
`/api/ical` middleware exemption works and the flag really does gate it.

---

## Decisions and assumptions worth challenging

- **`has_permission('manage_horses')` gates care corrections**, so a senior
  trainer granted the flag can edit care records. Default staff cannot.
- **`manage_schedule` gates events**, since it is the same calendar as lessons.
- **The care due-soon screen shows overdue items; the digest now does too**
  (amended after review — the lower bound was removed).
- **The 30-day care window lives in two places**, SQL and `lib/care.ts`, each
  pointing at the other. Not in `config/barn.ts`, which is for barn *facts*.
- **`ensure_family_onboarding()` is admin-triggered**, not automatic on family
  creation. Re-run it after adding a template; it is idempotent.
- **Two new test suites were added to `npm run verify`** (`test:pdf`,
  `test:ical`). `lib/pdf.ts` and `lib/ical.ts` are deliberately not
  `server-only` — they are pure functions, and that is what makes them testable
  outside the bundler.
- **`/api/ical` is now a public path in the middleware.** It has to be; the
  token authenticates the request.

---

## Slice 1 — horses, horse_riders, feed_plans

Migration `supabase/migrations/20260728000600_horses.sql` (0010).

### The problem it solves

Horse visibility is not a row rule, it is a **column** rule, and RLS is
row-level only:

| Who | Sees |
|---|---|
| admin / staff | every horse, in full |
| owning family | their own horse in full — breed, dob, notes, feed chart |
| riding family | **basics only** — name, barn name, photo |
| unrelated family | nothing |

A single SELECT policy cannot say "these rows, but only these columns". If the
riding family were added to the policy, `select *` would hand them everything,
and the only thing between them and another family's horse's records would be
the app remembering to ask for fewer columns. App-side column lists are not a
security boundary — the anon key lets anyone write their own query.

### How the boundary is drawn

The base-table policy **stops at the owner**. The riding family is deliberately
absent from it. Their only route is `public.horses_basics()`, a SECURITY
DEFINER function whose return type is `(id, name, barn_name, photo_url)` —
breed, dob and notes are not columns it can produce, so no query yields them.
**The projection is the boundary, and the database enforces it.**

**Function, not view.** SPEC §6 suggests a view. A view over an RLS-protected
table has to run as its owner to return rows the caller cannot see, which is
exactly the shape Supabase's Security Advisor lints as `security_definer_view`.
A definer function with `search_path = ''` is the same privilege boundary, is
the pattern already used throughout this schema, and the Advisor has no lint
against it. Same guarantee, clean Advisor — confirmed clean in the dashboard.

### Other decisions worth knowing

- **Writes gate on `has_permission('manage_horses')`, not `role = 'admin'`.**
  SPEC §4 makes it a grantable flag so a senior trainer can run the feed board
  without becoming an admin. Staff hold it false by default, so staff cannot
  write — asserted from both directions.
- **One *active* feed plan per horse per meal** (partial unique index). Two
  active `am` rows would print a horse twice on the morning board with
  conflicting instructions, which is how a horse gets fed twice or not at all.
  Replacing a plan retires the old one rather than deleting it, so a feed change
  stays legible afterwards.
- **Feed access follows ownership, not riding.** A boarder paying for feed is
  entitled to the chart; a family whose child merely rides the horse is not.
- **`horses_basics()` excludes horses the family owns** (they read those in full
  from the table) **and inactive horses**. The parent's two lists are disjoint.
- **No guard trigger.** CLAUDE.md requires one where a role may touch a row but
  only some columns or some state transitions. Here writes are all-or-nothing
  per role, so the row policy is the whole rule. The absence is a decision.
- **`owner_family_id` is `on delete set null`** — deleting a family turns its
  horse into a barn horse rather than deleting the horse.
- **Grants.** `family_owns_horse()` and `family_rides_horse()` are policy
  helpers, so they must stay callable by `authenticated` (a policy expression is
  evaluated as the querying user) — they are in the suite's `EXPOSED_BY_DESIGN`,
  like `family_owns_rider()` before them. Both answer only about the caller's
  own family; there is no family argument to pass. `horses_basics()` is revoked
  from `public, anon` and granted to `authenticated`, so the standing guard
  classifies it as an entry point and proves it stays reachable.

---

## Slice 2 — care events

Migration `supabase/migrations/20260728000700_care_events.sql` (0011).
`care` flag **on**, after David's audit.

Per-horse vaccines, Coggins, dental, worming, farrier, vet, medication and
wounds, with what falls due next.

### The rules, and why they are stricter than horses

**There is no basics tier.** A family whose rider merely rides a horse sees
**zero** care rows — not a redacted view, not names-only. Horse visibility
needed a projection function because "some columns" is not expressible as a row
policy; care needs none, because the answer is not "fewer columns", it is "no
rows". The parent branch of the SELECT policy is `family_owns_horse()` and the
policy carries a comment saying it must never become `family_rides_horse()` —
that one-word change is the whole failure mode.

**Staff insert, and only insert.** No UPDATE and no DELETE policy reachable by
a plain staff member, the same append-only discipline as `punches`: a care log
the person who wrote it can quietly rewrite is not a medical record. `logged_by`
is pinned to the caller by a BEFORE INSERT trigger, so attribution cannot be
spoofed.

**`performed_at` is deliberately NOT pinned to now()**, unlike
`punches.punched_at`. A punch is an assertion about the present and a
client-supplied time is a way to invent paid hours; a care event is routinely
written up days after the vet came, so a past date is the normal case.

### Decisions on the record

- **Update/delete gate on `has_permission('manage_horses')`**, so a senior
  trainer granted the flag can correct records without being made an admin.
  Default staff cannot. "Corrections are admin-only" and this are the same
  thing only while nobody holds the flag.
- **The digest includes overdue care** (amended after review — the original
  had a `due_next >= current_date` lower bound). An item that lapses is the one
  most worth a reminder; excluding the past would have meant the digest went
  quiet exactly when the care became overdue. Screen and digest now agree on
  what counts as outstanding.
- **Idempotency is per care item forever**, matching `enqueue_lesson_reminders`.
  Right for an admin-triggered button, **wrong for the weekly digest SPEC §8
  describes** — a weekly cron on this function goes quiet after the first week.
  Flagged in the migration; the fix is probably to scope the key to the week.
- **The 30-day window lives in two places** — the SQL digest and
  `CARE_DUE_SOON_DAYS` in `lib/care.ts`, each pointing at the other. It is not
  in `config/barn.ts` because that file is for barn-specific *facts*, not
  product rules a clone would keep. The digest measures from Postgres
  `current_date` (UTC) and the screen from the barn's today, so the two can
  disagree about an item exactly on the boundary for a few hours each evening.

### What the tests prove

- **Double control on the sharpest denial:** the riding family provably reaches
  the horse through `horses_basics()`, and an admin provably reads care events
  on that same horse — only then does "they see zero care rows" mean the care
  boundary held rather than the horse being invisible or the table empty.
  Checked by direct id fetch as well as filtered list.
- Both families, from both logins: each reads its own, neither reads the other's.
- **Staff append-only:** staff read the row (control), cannot update it, and the
  description is unchanged when admin re-reads; cannot delete it, and the row
  survives. Admin performs all four operations as the control.
- **`logged_by` is forced** — a staff insert claiming the admin's profile is
  recorded as the staff profile.
- **Two different refusals, told apart:** anon is blocked at the door by the
  grant; staff passes the grant and is refused by the function on role.
- **Overdue care reaches the digest**, with a control asserting the fixture's
  due date really is in the past.

### Verified in the browser (390px and 320px)

Admin due-soon shows `Overdue (1)` above `Coming up (2)`, each linking to the
horse; care history and the log form on the admin horse page with the overdue
chip and "Logged by" attribution; staff get the same log form from
`/more/horses/[id]`; the owning parent gets **read-only** history plus "Coming
up", with **no log form and no "logged by" line** (which employee wrote it up is
a barn detail). No horizontal scroll at either width, no console errors, every
touch target ≥44px.

---

## Two gaps closed in slice 1's commit

**1. `db:verify` was quietly blind.** `EXPECTED_TABLES` had been the Phase 0
five since Phase 0, so the verifier printed "Schema matches the migrations.
Nothing to fix." while never once checking whether RLS was on for
`announcements`, `tasks`, `lesson_*`, `backfill_offers`, `punches`,
`pay_periods` or `timesheet_approvals`. A verifier silent about most of the
schema is worse than none, because it reports confidence it has not earned.

It now lists **all 18 tables**, and a table that exists in `public` but is not
listed is a **failure**, not a footnote — so the same drift cannot recur. The
function check also sweeps **every** SECURITY DEFINER function for a pinned
search_path, not just a hand-written list (26 of 26 pinned).

**2. Cross-family denial was one-directional.** There was one parent login, so
"this family cannot see the other's data" was only ever checked from the side
that had a session; a policy leaking the other way would have passed. There is
now a **second parent fixture** (`phase0.parent2@example.com`, the control
family), and the suite checks the mirror image: they own two horses in full,
get the barn horse as basics, and see **nothing** of the first family's horse,
feed chart or rider links — with a positive control on each that they really do
reach their own equivalent.

---

## What the suite proves

53 + 13 = **66 new assertions** (281 → 347). Every deny has its allow first:

- **Control:** all four fixture horses carry non-null breed/dob/notes, and
  admin, staff *and* the owning parent each read them. "The riding family cannot
  see the breed" is meaningless against a null column or one nobody can read.
- **Positive control for the basics tier:** the parent provably reaches the
  ridden horse through `horses_basics()` with real values — so "cannot reach
  breed" is not "cannot reach the horse".
- **The realistic bypass:** embedding `horses(breed, notes)` through
  `horse_riders`, a table the parent *can* read. Returns null.
- **The projection will not even name the column:**
  `rpc("horses_basics").select("id, breed")` errors.
- A parent can **see** the horse they own and still cannot edit or delete it —
  re-read afterwards confirms the row survived unchanged.
- Both families' rider links are scoped by **rider**, not horse: both have a
  rider on the barn horse, so "which horse" no longer distinguishes them.
- anon sees nothing and cannot call `horses_basics()`.
- Admin can create, edit, assign and feed — the control proving the write
  policies are not simply broken.

---

## UI

| Surface | Route | Who |
|---|---|---|
| Horse directory + create | `/manage/horses` | admin |
| Edit, assign riders, feed charts | `/manage/horses/[id]` | admin |
| Full directory | `/more/horses` | staff (admin links through to Manage) |
| Horse record | `/more/horses/[id]` | staff, owning family |
| Daily feed board | `/tasks/feed` | staff |
| Owned horses full + ridden horses as basics | `/more/horses` | parent |

Routes sit under existing tabs, so `roleCanAccess` and the tab bar are
unchanged. Basics rows render through a separate `HorseBasicsCard` with its own
type: no template can reach for `notes` on a row that will never carry one, and
those cards deliberately **do not link anywhere** — there is no further detail
that family is entitled to.

### Verified in the browser (390px and 320px, all three roles)

- Admin directory lists four horses with owner labels; the edit page carries
  details, riders, feed chart and retired-plan history.
- Staff feed board: Morning 3 horses, Lunch nothing scheduled, Evening 1 —
  special instructions on a gold surface carrying ink text (`#2B2B2B`).
- Parent sees "Your horses" (linked, with breed) and "Horses your rider rides"
  (unlinked basics). Rendered DOM contains **no** breed, dob or notes from any
  horse the family does not own.
- Typing the URL of a horse they only ride returns **404**; a parent hitting
  `/manage/horses` lands on `/home`.
- **No horizontal scroll at 390px or 320px on any surface. No console errors.**
  Every touch target ≥44px (the only exceptions are the pre-existing dev-only
  role-switcher buttons, which never ship).

**Not verified end-to-end:** the admin *write* flows (assign rider, save feed
chart) were not driven through the forms — the Browser pane was not displayed
in this session, so real hit-tested clicks and screenshots were unavailable.
The underlying policies and server actions are covered at the database level by
the suite, but the form round-trip has not been exercised in a browser.

---

## Fixtures

`npm run db:seed` now also creates four horses — one per visibility tier —
four rider links and four feed plans, all named `Phase 2 Fixture …`, plus the
second parent. breed/dob/notes are populated on **all four horses** on purpose:
they are the positive control the column-projection tests depend on.

**`npm run demo:seed` has no horse data yet.** A walkthrough with the flag on
shows the fixture horses only. Worth adding before showing Belle.

---

## Exact next steps

**Needs David:**

1. **Decide whether demo data should include horses** before any walkthrough.
2. **Deployment is still unaddressed.** Nothing is deployed, no host is
   configured, and `main` still holds the Phase 0 state. `phase-1` and
   `phase-2` both need reviewing and merging when you are happy.
3. **Confirm the remaining `config/barn.ts` placeholders** — the barn
   geolocation is still `null`, so the clock-in geofence flags nothing.

**The slice that follows the Team panel:** inviting and provisioning logins —
creating an auth user for a new parent or staff member and linking it to a
profile. Deliberately NOT in the Team panel, because it touches auth rather
than these four tables, and creating users is the one thing here that cannot be
done under the caller's own session.

**Ready to build next (Phase 2, remaining slices):**
care events with due-soon surfacing and the weekly digest · horse documents in
Storage with bucket policies · onboarding form templates, submissions, the
checklist gate and PDF vault · events and iCal feeds · then Belle's additions
(turnout, supply tracking, training logs, boarder portal, the Academy).

**Deferred, needs David's accounts — not attempted:**
QuickBooks/Intuit OAuth and TimeActivity sync · Resend email (in-app
notifications only) · SMS and push · the Academy · the boarder persona.

**Not started, deliberately:** the shows phase, which is being re-scoped into
the show-team hub.

---

## Commands

```
npm run dev              # local dev
npm run verify           # typecheck, lint, build, leak check, PDF + iCal tests
npm run db:verify        # introspect the live schema, incl. Storage
npm run db:apply -- <f>  # apply a migration
npm run db:seed          # test fixtures
npm run db:gate          # THE GREEN GATE: seed → policies → policies → advisor
npm run db:advisor       # Supabase security lints (splinter), DB-level only
npm run test:policies    # the 567-assertion RLS suite
npm run test:pdf         # PDF structure (12)
npm run test:ical        # feed format, DST conversion, feed scoping (30)
npm run test:invites     # invite status, expiry, flag rules, the one bad-token message (27)
npm run demo:seed        # walkthrough data  (-- --clean to remove)
```

Fixture logins are `phase0.admin@`, `phase0.staff@`, `phase0.parent@` and
`phase0.parent2@example.com`; the shared password is printed by `db:seed` and
written to the gitignored `supabase/seed/seed-output.json`.
