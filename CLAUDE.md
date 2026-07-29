# Crouse Barn App — operating file

Read this before writing anything. These are conventions the build has already
paid for; several exist because the alternative shipped a bug here.

**Anchor files:** [`SPEC.md`](SPEC.md) (full product spec) ·
[`PHASE-2-PROGRESS.md`](PHASE-2-PROGRESS.md) (where things stand) ·
[`PHASE-1-PROGRESS.md`](PHASE-1-PROGRESS.md) (the phase before) ·
[`config/barn.ts`](config/barn.ts) (every barn-specific value) ·
[`tests/policies.test.mjs`](tests/policies.test.mjs) (the security contract)

---

## The project

A mobile-first PWA that runs a single dressage barn: announcements, tasks,
lesson scheduling with cancellation backfill, staff time clock, and later horses,
shows and invoices. Next.js (App Router) + TypeScript + Tailwind on Supabase.

**Standalone for Crouse, duplicatable by design.** One barn, one deployment, one
Supabase project — but every barn-specific value lives in `/config/barn.ts`, so
cloning is a new project plus a new config file. That only stays true if nobody
hard-codes a barn fact anywhere else.

---

## Branches and deployment

- Work on **feature branches** (`phase-1`, etc.).
- **`main` is the verified rollback point.** Never merge to it or deploy without
  David's explicit go-ahead.
- **Nothing is deployed.** There is no host configured. Do not set one up.

---

## Non-negotiable standards

### Security

**RLS on every table, in the same migration that creates it.** No exceptions,
including lookup tables. Default deny: policies are `to authenticated` only, so
signed-out access is nothing. Adding the table in one migration and the policies
in another leaves a window where the table is readable.

**Role and permission checks go through the SECURITY DEFINER helpers** —
`public."current_role"()`, `current_family()`, `current_profile()`,
`has_permission()` — never by querying `profiles` inside a policy, which
recurses. Every SECURITY DEFINER function sets `search_path = ''` and fully
qualifies its identifiers; a mutable search path on a definer function is a
privilege-escalation vector.

> `CURRENT_ROLE` is a reserved SQL keyword, hence the quoting.

**Row policy + guard trigger, for any constrained write.** RLS is row-level
only. When a role may touch a row but only *some columns* or only *some state
transitions*, the policy decides which rows and a `BEFORE` trigger decides the
rest. Without the second half, "a parent may edit their own profile" also means
"a parent may make themselves an admin". Live examples: `profiles`, `tasks`,
`lesson_riders`, `punches`.

**Three-role revoke on every internal function.**

```sql
revoke all on function public.my_helper(uuid) from public, anon, authenticated;
```

`revoke ... from public` **is not sufficient on Supabase** — it ships a separate
default-privileges grant to `anon` and `authenticated` that survives it. This
shipped once: `backfill_book_rider` was callable by any parent over PostgREST,
one HTTP call to seat any rider in any lesson. PostgREST publishes *every*
function in `public` as an RPC endpoint.

A function that should be callable is granted to `authenticated` and gates on
role internally. Anything else is either revoked or added to
`EXPOSED_BY_DESIGN` in the test suite. **The standing guard test enforces this**
— a new function that is neither classified nor allowlisted fails the suite.
That is deliberate: the default must not be "exposed".

**Append-only ledgers for auditable data.** Where a record decides money or
liability, there is no UPDATE or DELETE policy for *anyone*, admin included; a
correction is a new adjusting row referencing the original, and the original
stays. See `punches`. Adding an update path later silently turns an audit trail
into a spreadsheet.

### Testing

**A positive control before every deny test.** Prove the thing being attacked
exists and is reachable *first*, then prove it is refused, then re-read it to
confirm it is unchanged. This suite has shipped three vacuous assertions — a
null `author`, a null `template_id`, and a `punched_at` nobody could set — each
passing while testing nothing. A deny test that cannot tell "blocked" from "not
there" is worthless.

**Order-independence.** Assertions measure deltas or filter to a fixture type,
never absolute counts of things a previous run may have created. The suite must
pass twice in a row with no re-seed.

**The green gate.** After every applied migration:

```bash
npm run db:gate    # seed → test:policies → test:policies (no re-seed) → db:advisor
```

Both suite runs must be **0 failed, 0 skipped**, and the advisor must report
**no findings**. A skipped section is not a pass — it is reported as a skip
precisely so it cannot be mistaken for one. **Stop on red.** Do not build on a
failing state; fix it or revert the slice.

`db:advisor` runs Supabase's own Security Advisor lints (from
github.com/supabase/splinter) against the live schema, so "did you check the
Advisor?" is answered by the gate rather than by memory. It covers DB-level
lints only — the auth-config ones (leaked-password protection, OTP expiry, MFA,
Postgres version) are not visible over a Postgres connection and still need a
look at Dashboard → Advisors before a launch.

> This exists because the Advisor caught something an eyeball pass had missed
> for three phases: **every** SECURITY DEFINER function was EXECUTE-able by
> `anon`, because Postgres grants to PUBLIC by default and Supabase adds a
> separate grant to `anon` and `authenticated` on top. Migration 0015 closed the
> default; the suite now asserts behaviourally that no definer function is
> reachable signed-out.

### Migrations

Applied with `npm run db:apply -- <file>` over `SUPABASE_DB_URL` (the Supabase
**session pooler** — the direct `db.<ref>.supabase.co` host is IPv6-only and
will not resolve on an IPv4 network).

**Every migration must be idempotent** and safe to re-run: `create table if not
exists`, `create or replace function`, and `drop policy if exists` before every
`create policy` (Postgres has no `create policy if not exists`). Migrations get
re-applied after amendments; a file that fails the second time leaves the schema
half-changed.

### Editing files

**Never rewrite source files through PowerShell.** `Get-Content`/`Set-Content`
round-trip through the ANSI codepage: it adds a BOM and double-encodes
em-dashes, which breaks the file. Use the Edit tool. (This happened here — a
regex renumber through PowerShell corrupted the test suite and had to be
restored from git.)

### Config

**Barn-specific values live only in `/config/barn.ts`.** Never hard-code colours,
timezone, geofence coordinates, cancellation cutoffs, lesson durations or
capacities — not in components, not in SQL. A migration containing coordinates
gives a clone a second place to change and a silent way to get it wrong. Where a
rule needs a config value, the app applies it and the database records the fact.

Anything marked PROVISIONAL or PLACEHOLDER is unconfirmed. **Never invent a
client fact** — leave the placeholder and flag it.

### Feature flags

A slice's flag stays `false` until it is green *and* audited. Shipping a flag
early means shipping a half-finished story to families — cancellation without
backfill was held back for exactly this reason.

### UI

Mobile-first, one-handed, 380px viewport. **Cards, never tables.** 44px minimum
touch targets. No horizontal scroll at 320px. One decision per screen. Gold is a
*surface* colour carrying ink text; `goldDeep` is the *text* colour — the light
gold fails contrast on white and cream, and accessibility outranks the design
system.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run verify` | typecheck → lint → build → service-key leak check |
| `npm run db:apply -- <file>` | Apply a migration over the pooler |
| `npm run db:verify` | Introspect the live schema (RLS, policies, grants) |
| `npm run db:seed` | Test fixtures — resets ledgers and generated notifications |
| `npm run test:policies` | The RLS suite (281 assertions) |
| `npm run demo:seed` | Walkthrough data (`-- --clean` to remove) |
| `npm run brand:assets` | Regenerate icons and splash from the real logo |

`db:seed` owns the three fixture users and everything the suite asserts against.
`demo:seed` is separate, prefixes everything `[demo]`, and must never touch
fixture rows — the suite's expectations are exact.

---

## Deferred — do not attempt

QuickBooks/Intuit OAuth and TimeActivity sync · Resend email (in-app
notifications only) · SMS and push · the Academy · the boarder persona.

These need David's accounts and decisions. Seams exist where they will attach
(`timesheet_approvals.external_ref`, the notification fan-out); leave TODOs
rather than stubs that look finished.
