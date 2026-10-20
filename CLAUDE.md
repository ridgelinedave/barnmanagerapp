# Monarch Barn Management Software — operating file

Read this before writing anything. These are conventions the build has already
paid for; several exist because the alternative shipped a bug here.

**Anchor files:** [`SPEC.md`](SPEC.md) (full product spec) ·
[`design/DESIGN-MASTER.md`](design/DESIGN-MASTER.md) (the design source of truth) ·
[`PHASE-2-PROGRESS.md`](PHASE-2-PROGRESS.md) (the Phase 2 build record, through `6bb0d0a` — check `git log` for anything later) ·
[`PHASE-1-PROGRESS.md`](PHASE-1-PROGRESS.md) (the phase before) ·
[`config/barn.ts`](config/barn.ts) (every barn-specific value) ·
[`tests/policies.test.mjs`](tests/policies.test.mjs) (the security contract)

---

## The project

**The product is Monarch Barn Management Software.** Crouse Equestrian is a
white-labelled client of Monarch — the first barn on it — not the product.
Inside the barn's app the barn leads: Crouse's crest, name and accent, with a
small "Powered by Monarch" mark at the edges (`design/DESIGN-MASTER.md` §16c).
Never put the barn's name on a product surface (a table, a route, a component
name), and never put Monarch's name where the barn's belongs.

A PWA that runs a barn: announcements, tasks, lesson scheduling with
cancellation backfill, staff time clock, horses, shows, barn ops, and later
learning modules and invoices. Next.js (App Router) + TypeScript + Tailwind on
Supabase.

**Standalone for Crouse, duplicatable by design.** One barn, one deployment, one
Supabase project — but every barn-specific value lives in `/config/barn.ts`, so
cloning is a new project plus a new config file. That only stays true if nobody
hard-codes a barn fact anywhere else.

---

## Branches and deployment

- Work on **feature branches** (`phase-2`, etc.).
- **`main` is the deploy trunk.** Vercel builds and deploys it automatically
  from GitHub (`ridgelinedave/barnmanagerapp`, private). A merge to `main` is a
  production release and needs David's explicit go-ahead every time — not as a
  formality, but because the barn is using it.
- The iCal subscription URL is public and stable. Changing the host breaks
  every calendar that has subscribed.

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

**A guard trigger that early-returns on `auth.uid() is null` does NOT bind the
service role.** RLS is bypassed by the service role; triggers are not — a
trigger fires for everyone, so a guard only spares the service role when it
chooses to. Guards that skip a null caller (`riders_guard_profile_link`,
`lesson_riders_guard_parent_updates`, ...) do so on purpose, for `db:seed` and
migration backfills — which means **any server-side path that writes a guarded
column is UNGUARDED and must validate its own caller.** Contrast
`enforce_at_least_one_admin` (0016), which refuses for everyone. Never justify
the early return as "service-role calls already bypass RLS": that is true of
RLS and false of triggers.

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

### Video

**Learning video lives in Cloudflare Stream, never in Supabase Storage.** A
lesson stores `video_provider` + `video_id` (the Stream uid), never a path or a
URL. Every video is uploaded with signed URLs required; a playback token is
minted server-side (`lib/stream.ts`, `server-only`) only for a lesson row the
viewer's own RLS session returned — never from a route that takes a bare id.
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_STREAM_TOKEN` are server-only: never
`NEXT_PUBLIC_`, never logged, never in an error. `check:leak` and
`test:stream` enforce it; `db:verify` fails if a `learning` bucket appears.

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

**Copy: kill the chatter (standing rule, DESIGN-MASTER §0).** This is a real
tool, not a tutorial. Four rules, enforced on every screen, both shells:

1. **A screen has a title. It does not have a subtitle.** No descriptive line
   under a screen title, section heading or list-row title — delete it, don't
   shorten it. Nothing of the shape "<time framing>, by <thing>", nothing that
   restates what the screen obviously is.
2. **Headings are nouns, not sentences.** Feed board · Task list · Clock-ins and
   timesheets · Supplies · Horses · Turnout · Blanketing · Maintenance · Water.
   No time-of-day framing, no "by horse", no gerunds, no personality.
3. **Helper text survives only if it carries information the control cannot.**
   A constraint, a consequence or a rule stays ("Ignored for a private lesson,
   which is always one." · "Internal. Parents never see it."). An explanation
   of what a screen or field is for goes.
4. **Empty states are one short factual line, or nothing.** "No horses yet." ·
   "Nothing due this week." Not an invitation, not encouragement, not a dash
   and a suggestion. If the add button is on screen, don't mention it.

**No menu screens (standing rule).** A landing page whose only content is links
to other pages is a wasted screen. If a tab has three or fewer destinations for
a role, they are a segmented control (`SubTabs`, via `TabPage`'s `tabs`) at the
top of the tab, and the tab opens on the first one — not cards on a menu
screen. Old routes keep working (redirect, never 404). Count taps: the thing a
tab exists for should be no more than two taps from the tab. Lessons follows
this (`lessonSegments` in lib/nav.ts). Audit 2026-10-20: Lessons passes (two
taps from the Lessons tab to a playing video: the Academy segment, then the
lesson). More passes — it carries the account card and the calendar
subscription, not only links. Barn passes since 2026-10-20: too many
destinations for a segmented control (admin 13, staff 8, client 4), so the
landing page carries the day itself — the feed board now, care due this
week, open maintenance (a client: supplies the barn needs from them) — with
every other screen in the collapsible groups beneath. A new screen in Barn
adds a summary there only if it is something people open the tab to check.

**Three faces, each with one job (2026-10-19).** `font-display` is MARCELLUS
(screen titles, section headings, and proper nouns — module, horse, rider and
show names; weight 400 only, never bold). `font-condensed` is Barlow Condensed
(small-caps labels, table headers, chips, numbers, metadata, button labels —
scaffolding). `font-sans` is Barlow (body copy and inputs). A list is
EDITORIAL ROWS on the ground (`ListRow` / `ROW` + `RowList`: rule between rows,
name in Marcellus, small muted chevron, a circular photo `Avatar` for a horse or
person, no icon chip, no card). Separators on the ground use `border-rule`
(brand.rule); `line` is for inside white surfaces. A control that is not a
<Button> borrows `buttonClass()` so it never looks like a card. The time clock
is mounted only through `TimeClock` (state from `loadClockState`).

**"Time clock" is a MONARCH name, not a barn's (2026-10-20).** The staff
screen, its nav row and its page metadata say "Time clock", never "Clock"; the
admin review screen stays "Clock-ins and timesheets". It is the same for every
barn, so it lives in code, not `config/barn.ts`. `TimeClock` is mounted in
exactly three places — staff Home (top card), /more/timesheet (top), /clock —
and never for admin, who does not punch.

**"Client", never "parent", on every screen (2026-10-20).** A CLIENT is a
`families` row — the account that pays; a RIDER takes lessons and may be
linked to a login (`riders.profile_id`, migration 0026); a HORSE is optionally
owned by a client. Boarder, lesson family and adult amateur are DERIVED from
what a client has, never stored. The database keeps the role value `parent`
and the table name `families` — renaming them means rewriting ~40 policies
and functions against a live barn — so `role === "parent"` in code is correct,
and only user-facing strings say "client".

**Delete has one pattern: `ConfirmDelete` (2026-10-20).** An inline second
step, Keep first and focused, the destructive answer a danger ghost — never
`window.confirm()`. Operations deletes go through one whitelisted server action
(`app/(app)/barn/delete-actions.ts`) gated on `has_permission('manage_horses')`.

**Two shells, one app** (see `design/DESIGN-MASTER.md` §14b, decided
2026-10-18). Same routes, same server components, same data functions; a
breakpoint picks the chrome and the column count. Divergence belongs in layout
components — never in duplicated pages, and never in a second copy of a
permission check.

**The mobile shell keeps every rule it has earned.** One-handed, 320-390px,
44px minimum touch targets, no horizontal scroll at 320px, one decision per
screen, cards rather than tables. None of these are preferences; each came from
a real failure on a real phone.

**The desktop shell is a different organism, not a stretched phone.** A
persistent sidebar (no five-destination limit, so `/manage/*` is exposed
directly rather than buried under More), a top bar, and content laid out as a
reading column, a two-pane master-detail, or a **wide data table** — tables are
correct and wanted here. Bottom sheets become modals or drawers. Hover,
`focus-visible` and keyboard navigation are required, not optional.

**So "cards, never tables" is a MOBILE rule, not a global one.** A table on the
desktop shell is right; a table on the mobile shell is still wrong.

**Where it lives.** The shell switches at Tailwind's `lg` (1024px), in CSS, in
`app/(app)/layout.tsx`. A screen picks its desktop width with one prop,
`<TabPage layout="reading" | "split" | "wide">`; the default is `reading`, which
is the 640px column at every width (`components/layout-buckets.ts`). Every
landing-page row and every sidebar link comes from the destination lists in
`lib/nav.ts` — add or move a screen there, never in a page or in
`components/Sidebar.tsx`, and `npm run test:nav` proves the sidebar still
agrees with `roleCanAccess`.

**Measurement.** Every layout claim in this repo to date was measured at 390px
and 320px only. Any desktop layout not yet measured must be described as
unverified.

**Colour.** Belle's oxblood is the accent and the entire white-label mechanism,
in four tokens (`fill` / `on` / `tint` / `text`) — see `config/barn.ts`. Gold is
decorative only: `#C2AE6D` is 2.19:1 as text and 2.19:1 carrying white, so it is
never a text colour and never an accent token. There is no cream and no cobalt
in this app. Accessibility outranks the design system.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run verify` | typecheck → lint → build → service-key leak check |
| `npm run db:apply -- <file>` | Apply a migration over the pooler |
| `npm run db:verify` | Introspect the live schema (RLS, policies, grants) |
| `npm run db:seed` | Test fixtures — resets the fixtures' ledger rows and generated notifications, never anyone else's |
| `npm run test:policies` | The RLS suite (838 assertions) |
| `npm run db:gate` | The green gate: seed → test:policies → test:policies (no re-seed) → db:advisor |
| `npm run db:advisor` | Supabase Security Advisor lints (splinter) against the live schema |
| `npm run test:pdf` | Signed-form PDF rendering tests |
| `npm run test:ical` | iCal feed tests |
| `npm run test:invites` | Invite token and claim tests |
| `npm run test:nav` | The sidebar and the navigation gate agree, for every role (in `verify`) |
| `npm run test:stream` | Cloudflare Stream core: credentials never reach an error, ids are checked (in `verify`) |
| `node --env-file=.env.local scripts/learning-stream-seed.mjs` | Upload the launch learning videos to Stream (private, tus) and seed their module as a draft |
| `node --env-file=.env.local scripts/learning-privacy-check.mjs` | Behavioural proof that learning video is private — run against a dev server |
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

**Time keeping and payroll.** The barn owner has asked for both. Time keeping
exists: punches → pairing → pay periods → approval → CSV export in QuickBooks
TimeActivity shape, with `timesheet_approvals.external_ref` as the sync seam.
Payroll itself is explicitly out of scope and will always be an export to a
payroll provider, never computed in this app.
