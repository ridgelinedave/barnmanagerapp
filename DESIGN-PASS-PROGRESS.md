# Design pass — progress report

**Branch:** `design-pass` · branched from `phase-2` (`1daed6b`)
**`main` untouched** at `840dc18`. **Not merged. Nothing deployed.**
**Date:** 2026-07-30

**UI only.** No migration, RLS policy, SECURITY DEFINER function, server
action, query or feature flag was touched on this branch. Verified, not
asserted:

```
git diff --stat phase-2..design-pass -- supabase/ lib/guard.ts   # empty
git diff phase-2..design-pass -- config/barn.ts                  # brand block only,
                                                                 # no flag lines
```

---

## Gate

```
npm run verify        0 errors, 6 warnings (all pre-existing _prev/_formData)
                      build compiled · service-key leak check passed
                      test:pdf 12/12 · test:ical 30/30
npm run test:policies 521 passed, 0 failed, 0 skipped  (run twice, no re-seed)
npm run db:advisor    clean across 8 lints
```

---

## What the pass was for

The incumbent (screenshots in `competitor research/barn ops/`) is the floor,
not the target. Its specific weaknesses, and what this branch does instead:

| Incumbent | Here |
|---|---|
| A horse filed behind 8 tabs — About / Feeding / Turnout / Health / Weight / Hoof / Training / FlyOps — most opening on "no record" | One scroll. A section with nothing in it does not render at all. |
| Ops-and-records shaped: the barn's filing cabinet, shown to parents | Parent Home opens on *the barn's morning* and the next lesson |
| Generic — the same grey app with a different logo on it | Charcoal chrome, Crouse gold, cream ground, Barlow Condensed |
| No show team anywhere | `/shows` is scaffolded and drops onto these components |

---

## Phase A — the system (`10013ff`, `4d4ea67`)

**Tokens.** `config/barn.ts` is the single source; `app/layout.tsx` emits 13
CSS custom properties; `app/globals.css` maps them into a Tailwind v4 `@theme
inline` layer (`--color-*`, `--radius-*`, `--shadow-*`, `--text-*`). **A clone
re-skins by editing one config file.** Every palette value was measured, and
the ratio is recorded in a comment beside it:

| Token | Value | Measured |
|---|---|---|
| `charcoal` | `#1C1B18` | 17.22:1 carrying white · 9.26:1 carrying gold |
| `forest` | `#2F4A34` | 8.68:1 as text on cream · 9.77:1 as a surface carrying white |
| `danger` | `#9B2C1F` | 6.73:1 |
| `muted` | `#5B564C` | 6.48:1 — a solid colour, not an opacity of ink |

`muted` is deliberately a real colour rather than `text-ink/60`. Opacity-muted
text is the single most common AA failure in generated UI, because its actual
ratio depends on whatever it happens to be sitting on.

**Type.** Barlow Condensed (display) + Barlow (body), self-hosted via
`next/font`. Both SIL OFL — no licence to buy. A condensed display face against
its own upright text face is a real contrast axis, and Condensed earns its keep
on a 320px screen where a horse's name has to fit on one line.

**Components** (`components/ui/`): `Icon`, `Button`, `Card`, `Board`, `Sunk`,
`SectionHeader`, `Chip`, `ChipRow`, `EmptyState`, `Callout`, `FactList`,
`ListRow`, `Avatar`, `InlineRow`, `Field`, `Input`, `Textarea`, `Select`,
`CheckRow`, `FormFeedback`, `Sheet`, `SheetTrigger`. Shell: `AppHeader`,
`TabBar`, `TabPage`.

`Sheet` is a native `<dialog>` on purpose — it escapes the stacking context, so
a bottom sheet cannot be clipped by an ancestor's `overflow`.

Applied to three flagship screens: parent Home, the horse profile, admin
Schedule.

---

## Phase B — every remaining surface

Seven commits, one per area, each reviewable on its own.

| Commit | Area |
|---|---|
| `e4634c3` | Shell — Manage, More, sign-in, stubs, install prompt |
| `467e41f` | Announcements (card, compose, edit) |
| `68862b5` | Tasks (card, admin, both list pages) |
| `76b01de` | Lessons (parent card, backfill offer, lesson card, template wizard, fill-slot) |
| `ee016cc` | Clock, timesheets, notifications |
| `e602438` | Care, documents, horses, feed board |
| `4e3dc66` | Forms and events |
| `5cd7007` | account-pending and the launch screen |

**Every screen in the app is now on the system.** Full route list, all
restyled: `/home` `/schedule` `/lessons` `/tasks` `/tasks/feed` `/clock`
`/notifications` `/shows` `/more` `/more/horses` `/more/horses/[id]`
`/more/forms` `/more/forms/[id]` `/more/timesheet` `/manage`
`/manage/announcements` `/manage/announcements/new` `/manage/announcements/[id]`
`/manage/tasks` `/manage/lesson-templates` `/manage/timesheets` `/manage/care`
`/manage/horses` `/manage/horses/[id]` `/manage/forms` `/manage/events`
`/sign-in` `/account-pending`.

A closing sweep of `app/` and `components/` for leftover ad-hoc styling
(`brand-ink/`, `bg-red-N`, `bg-green-N`, `rounded-2xl`, `rounded-xl`) returned
two hits, both since fixed. There is no ad-hoc styling left in the tree.

### Standards held throughout

- **Warm empty states, never a bare "No data."** Every empty box says what
  would fill it and who fills it. Finishing today's list gets a different
  message from never having had one.
- **Status chips always carry an icon.** Several places conveyed state by
  colour alone and now do not: the pinned announcement (gold border only → a
  Pinned chip), the unread notification (gold border only → an unread chip),
  punch direction (stays a *word*, not a colour — it is a pay record).
- **Cards never nest.** Where a form used to sit in a bordered box inside a
  card, it now sits in a `Sunk` tile: `FillSlotForm`, the timesheet correction
  form, the care log.
- **Sheets for occasional actions.** A one-off task, a new recurring template,
  the weekly wizard, a pay period, edit-horse, set-a-meal, log-care, add-event
  all open in a bottom sheet instead of being parked permanently at the bottom
  of the screen pushing the actual content off the top.
- **One-scroll layouts.** A section with nothing in it does not render.

### The bell went gold

Unread mail is not an error. Red in this system means *something is wrong*, and
spending it on "you have messages" leaves nothing louder for the things that
actually are wrong.

---

## Measurement

The Browser pane never composites the `(app)` route group — the shell streams
but the Suspense boundary does not resolve in the pane, so screenshots of those
routes are not available. Measured instead by mounting the real server-rendered
`<main>` into a live document and reading it against the real stylesheet, under
three real sessions (admin, staff, parent) so role-gated routes were reachable.
**These are measurements, not screenshots.** Chrome was separately confirmed
live: header and tab bar both compute `rgb(28, 27, 24)`, body Barlow, headings
Barlow Condensed.

**At 390px and 320px, on every route above: zero elements wider than the
viewport, zero targets under 44px, zero AA contrast failures.**

Two things the measurement caught that eyeballing had not:

- The `Board` action link ("All lessons") was a **19px** hit area. Now 44px via
  padding plus a negative margin, so the target grows without inflating the bar.
- The horse's date of birth rendered **"Wed, Apr 1"** — the year dropped by
  `formatBarnDayLabel`, which is built for *this week* and so omits it. A
  birthday is the one date where the year is the point. Now a year-inclusive
  formatter. **This was a real content bug, display-layer, and is fixed.**

One apparent finding was a false positive worth recording: `/manage/announcements/new`
reports four 20px controls. They are the radio and checkbox *boxes*; each is
wrapped in a `<label>` measuring 48–88px, which is the actual hit target. The
control is fine; the naive probe does not understand label-wrapped inputs.

---

## Bugs caught in my own edits (fixed before commit, listed for the record)

- Replacing `<form action={correctAction}>` with `<Sunk>` in `TimesheetAdmin`
  would have removed the form element and **broken correction submission.** The
  form is now nested inside the tile.
- `StubScreen` changing from `children` to a `detail` string broke
  `home/page.tsx`. All thirteen call sites updated.
- `FormFill` has its own internal `Field` component; importing the system's
  `Field` collided with it. The local one is now `SchemaField`.

---

## What needs David

1. **The PWA splash is one shade off the chrome.** `barn.pwa.launchBackground`
   is `#2B2B2B`; the chrome is now `#1C1B18`. That value is **baked into the
   already-generated splash PNGs**, so changing the config alone would make the
   mismatch worse, not better. Fixing it means changing the config *and*
   re-running `scripts/generate-brand-assets.mjs`. Held back because it touches
   generated binary assets, which felt outside a UI-only pass. **One command
   when you want it.**

2. **Two subjective calls, flagged not auto-resolved.** (a) The gold `#dabc51`
   is the brand gold as committed — it carries 9.26:1 on charcoal and is used as
   a surface behind charcoal text, never as text on cream, where it would fail.
   Worth your eye on whether it reads as *Crouse* gold on a real phone in real
   light. (b) Emoji appear as decorative section marks in empty states only —
   `aria-hidden`, never in navigation, never carrying meaning. That is a
   deliberate departure from the icon-set standard, on the grounds that the app
   is warm rather than corporate. Easy to strip if you disagree.

3. **Forms has no authoring screen.** Templates are seeded straight into the
   database. The empty state now says so honestly rather than implying a button
   exists. Real work, not a design item.

4. **Merge is yours.** `design-pass` is 10 commits ahead of `phase-2` and has
   not been merged anywhere. No flag was flipped.

---

## Left alone, deliberately

- `components/DevRoleSwitcher.tsx` keeps its amber dev styling. It is a
  development-only control that is hard-disabled in production builds, and
  making it look like part of the app is the opposite of what it is for.
- `/shows` remains a stub. Phase 3. It is on `StubScreen` so it will inherit
  the system when it gets built.
- The six `verify` warnings (`_prev`, `_formData`) predate this branch and are
  server-action signature parameters, not design.
