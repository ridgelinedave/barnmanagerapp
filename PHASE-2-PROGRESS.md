# Phase 2 — progress report

**Branch:** `phase-2` · branched from `phase-1-complete` (`54cdd11`)
**`main` untouched** at `840dc18` (verified Phase 0 state)
**Date:** 2026-07-29, updated 2026-07-31 (design pass merged, Team panel added)
**Nothing is deployed.** All of this runs locally against the live Supabase project.

---

## Headline

**All five slices are live.** `horses`, `care`, `documents`, `forms` and
`events` are on. The `design-pass` branch is **merged in** (fast-forward, no
conflicts), and the **Team panel** is built on top of it.

**Suite: 532 passed, 0 failed, 0 skipped**, run twice with no re-seed. Advisor
**clean across 8 lints**. Plus `test:pdf` (12) and `test:ical` (30).

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

0. **Confirm the rider age brackets** (Team panel, section B). `config/barn.ts`
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
npm run test:policies    # the 532-assertion RLS suite
npm run test:pdf         # PDF structure (12)
npm run test:ical        # feed format, DST conversion, feed scoping (30)
npm run demo:seed        # walkthrough data  (-- --clean to remove)
```

Fixture logins are `phase0.admin@`, `phase0.staff@`, `phase0.parent@` and
`phase0.parent2@example.com`; the shared password is printed by `db:seed` and
written to the gitignored `supabase/seed/seed-output.json`.
