# Phase 1 — progress report

**Branch:** `phase-1` · **`main` untouched** at `840dc18` (verified Phase 0 state)
**Date:** 2026-07-28, unattended session
**Nothing is deployed.** All of this runs locally against the live Supabase project.

---

## Headline

Phase 1 is **complete through slice 4**. Announcements, tasks and the full
schedule → cancel → backfill story are live behind their flags. Clock-in and
timesheets are **built, applied and green, but the flag is OFF** pending David's
audit of the SQL — that was the instruction and it has been followed exactly.

**Suite: 277 passed, 0 failed, 0 skipped**, run twice with no re-seed between
after every applied migration, including with demo data present.

---

## What shipped this session

| Unit | Commit | State |
|---|---|---|
| Phase A — offer card keeps its outcome | `fc6a782` | Shipped |
| Slice 4 — clock-in & timesheets | `c1c0e03` | Built, applied, green. **Flag off.** |
| Phase C — launch screen + crest icons | `132ecf6` | Shipped |
| Phase C — demo seed | `5792882` | Shipped |

### Feature flags

| Flag | State | Why |
|---|---|---|
| `announcements` | **on** | Slice 1, green |
| `tasks` | **on** | Slice 2, green |
| `lessons` | **on** | Slices 3a + 3b, green |
| `clockIn` | **off** | Slice 4 is green, but David audits the SQL before it goes on |
| `horses`, `shows`, `invoices`, `shop` | off | Phases 2–3 |

---

## The database connection

`SUPABASE_DB_URL` now uses the **Session pooler** (`aws-0-ca-central-1`), and it
**connects**. The earlier direct host was IPv6-only on an IPv4-only network.

That unblocked two things: `npm run db:verify` (catalog introspection — RLS
actually enabled per table, policy role scoping, pinned search paths, column
grants), and a new `npm run db:apply`, which applied migration 0009 without a
manual paste. `db:apply` sends each file as one statement batch rather than
splitting on semicolons — the migrations are full of dollar-quoted function
bodies, and naive splitting tears them in half.

Current schema: **58 policies**, 6 trigger functions, all SECURITY DEFINER
helpers with pinned search paths. `db:verify` reports clean.

---

## Slice 4 — what to audit

The migration is `supabase/migrations/20260728000500_timeclock.sql`.

**The property worth checking first: `punches` has no UPDATE policy and no
DELETE policy, for any role — including admin.** This is the table that decides
what people get paid. If an admin can quietly rewrite it, it is worth nothing
the day someone disputes their hours six weeks later. A correction is an
INSERT of an adjusting row pointing at the original; the original stays and
stays visible in the UI beside its correction. A CHECK constraint forces an
adjustment to name what it corrects and carry a note.

The tests assert this from both directions, including `even an ADMIN cannot
edit a punch`, then re-read the row to confirm it survived unchanged.

Other decisions worth a look:

- **Geofence stays in the app**, driven by `barn.geofence`. No coordinates in
  SQL — a clone changes one config file, not a migration. With the geofence
  still at its null placeholder, nothing is flagged as out of range, because
  there is no range yet.
- **GPS never blocks a punch.** A denial, timeout or dismissed prompt records
  the punch without coordinates and flags it. An unrecorded shift is a worse
  failure than a flagged one, and refusing the punch teaches people to work
  around the app.
- **Pairing is conservative.** An unmatched `in` contributes **zero** minutes
  and is flagged, rather than being closed at midnight or at the next in-punch.
  Guessing would put invented hours on a payslip.
- **CSV export** is one row per employee per day, the shape QBO TimeActivity
  expects. **The exact column set needs confirming against Belle's QuickBooks** —
  it varies by account and hers has not been inspected. This is flagged in the
  route and on the admin screen rather than presented as import-ready.
- `timesheet_approvals.external_ref` is the QBO seam: storing returned
  TimeActivity ids is what makes a re-sync update rather than duplicate.
  Nothing writes it yet.

**To turn it on:** audit the SQL, then flip `clockIn: false → true` in
`config/barn.ts`. No further migration is needed — 0009 is already applied.

---

## Notable finding from the previous session, now guarded

Slice 3b shipped with `backfill_book_rider` **callable by any parent over
PostgREST** — one HTTP call to seat any rider in any lesson, skipping offers,
eligibility and the seat race entirely. The revoke was written but did nothing:
on Supabase, `revoke ... from public` leaves the separate default-privileges
grant to `anon` and `authenticated` intact.

There is now a **standing, data-driven guard** in the suite. It parses the
migrations, classifies every function as internal / entry point / exposed by
design, and proves it behaviourally over RPC. A function added in a later
migration that is neither revoked nor allowlisted **fails the suite** — the
default is no longer "exposed". It is verified to fail: planting an
unclassified helper turns it red.

Anything added in Phase 2 needs the three-role revoke (`public, anon,
authenticated`) or an explicit entry in `EXPOSED_BY_DESIGN`.

---

## Demo data

`npm run demo:seed` — four families and riders, three announcements, four task
templates with today's list part-completed, two weeks of lessons with riders
booked, and one open backfill offer. Everything is prefixed `[demo]` and
removable with `npm run demo:seed -- --clean`.

It is **completely separate from `db:seed`** and never touches the fixture rows,
because the suite's expectations are exact ("parent sees exactly 1 rider") and
one stray demo rider on the fixture family would turn it red for a reason that
has nothing to do with a policy. Verified: suite is 277/0 with demo data
present, after teardown, and after a re-seed.

**The demo data is currently in place**, so the app looks populated for a
walkthrough.

---

## Nothing was stopped on

Every unit reached green and was committed separately. No half-tested state was
built on. The one bug found mid-session — a teardown in the demo seed that would
have deleted **every** lesson template rather than only demo ones — was caught
and fixed before the script was ever run.

---

## Exact next steps

**Needs David:**

1. **Audit `20260728000500_timeclock.sql`**, then flip `clockIn` on. Nothing
   else is required; the migration is applied and green.
2. **Confirm the CSV column layout** against the real QuickBooks account before
   anyone relies on a straight import.
3. **Decide on deployment.** Nothing is deployed and no host is configured.
   `main` still holds the Phase 0 state — `phase-1` needs reviewing and merging
   when you are happy with it.
4. **Confirm the remaining placeholders** in `config/barn.ts`: the barn
   geolocation is still `null`, so the clock-in geofence flags nothing.

**Deferred, needs David's accounts — not attempted:**
QuickBooks/Intuit OAuth and TimeActivity sync · Resend email (in-app
notifications only) · SMS and push · the Academy · the boarder persona.

**Ready to build next (Phase 2, per `SPEC.md`):**
horse profiles and ownership · feed plans and the staff feed list · care events
with due-soon surfacing · horse documents in Storage · onboarding form templates
and submissions · events and iCal feeds.

---

## Commands

```
npm run dev              # local dev
npm run verify           # typecheck, lint, build, service-key leak check
npm run db:verify        # introspect the live schema over the pooler
npm run db:apply -- <f>  # apply a migration
npm run db:seed          # test fixtures (resets the ledger and notifications)
npm run test:policies    # the 277-assertion RLS suite
npm run demo:seed        # walkthrough data  (-- --clean to remove)
npm run brand:assets     # regenerate icons and splash from the real logo
```
