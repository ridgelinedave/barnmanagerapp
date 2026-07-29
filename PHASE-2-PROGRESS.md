# Phase 2 — progress report

**Branch:** `phase-2` · branched from `phase-1-complete` (`54cdd11`)
**`main` untouched** at `840dc18` (verified Phase 0 state)
**Date:** 2026-07-28
**Nothing is deployed.** All of this runs locally against the live Supabase project.

---

## Headline

**Slice 1 — horse records + feed plans — is complete, applied, audited and live
behind its flag.** `horses` is **on**. Security Advisor is clean (checked by
David after the SQL review).

**Suite: 347 passed, 0 failed, 0 skipped**, run twice with no re-seed between,
after every applied migration.

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

## Two gaps closed in the same commit

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

**Ready to build next (Phase 2, remaining slices):**
care events with due-soon surfacing and the weekly digest · horse documents in
Storage with bucket policies · onboarding form templates, submissions, the
checklist gate and PDF vault · events and iCal feeds · then Belle's additions
(turnout, supply tracking, training logs, boarder portal, the Academy).

**Deferred, needs David's accounts — not attempted:**
QuickBooks/Intuit OAuth and TimeActivity sync · Resend email (in-app
notifications only) · SMS and push · the Academy · the boarder persona.
