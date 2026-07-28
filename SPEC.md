# Barn Manager App — Build Specification

A hyper-personalized barn management PWA for a single dressage barn (Crouse Equestrian),
built to be clone-able for future referral barns. Owner/admin is "Belle." Solo developer,
built with Claude Code. This file is the source of truth for architecture, data model,
security, and phasing.

---

## 1. Project Overview

**What it is:** A mobile-first progressive web app (PWA) that runs the barn: staff
clock-in synced to QuickBooks Online, lesson scheduling with cancellation backfill,
task assignment, horse care records, show management with interest polling, family
onboarding forms, announcements, FAQ/resources, invoice surfacing with online payment,
and a lightweight shop.

**What it is not:** Not a SaaS product (yet). One barn, one deployment. But all
barn-specific values live in a single config file so the skeleton can be cloned
for a second barn in a weekend.

**Primary user contexts:**
- Belle (owner/admin): manages EVERYTHING from her phone. No desktop-required workflows.
- 4 staff: clock in/out, view shifts, complete tasks, log feeds/meds.
- Parents: hold the accounts. View schedules, respond to show interest, pay invoices,
  complete onboarding forms, read announcements/FAQ, buy from shop.
- Riders (minors): profiles attached to parent accounts. NO logins of their own in v1.

**Scale:** ~4 staff, small number of families (est. 15–40). Everything fits free tiers.

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14+ (App Router) | Server components + API routes for integrations |
| Hosting | Vercel | Free tier fine at this scale |
| Database/Auth/Storage | Supabase | Postgres + Auth + Storage + Realtime. RLS is the security model |
| Styling | Tailwind CSS | Mobile-first utility classes |
| PWA | next-pwa or manual manifest + service worker | Install prompt in onboarding flow |
| Email | Resend | Transactional + notification email |
| Payments (shop) | Stripe Payment Links | No custom payment code. App renders a product grid linking out |
| Invoicing/payroll | QuickBooks Online API | OAuth2. TimeActivity write, Invoice read. QBO Payments hosted pay links |
| Calendar feed | iCal (.ics) generation | Public read-only subscribe URL per role scope |
| Rich text (admin content) | Tiptap (or similar drop-in) | For FAQ/announcements. Keep it a "fancy text box," nothing more |

**Explicitly rejected:** React Native / App Store distribution (PWA instead), Acuity
(replaced by in-app scheduling), QuickBooks Time (paid add-on; use QBO TimeActivity
API included with her existing subscription), custom ecommerce (Stripe Payment Links
instead), SMS in v1 (A2P registration overhead; email + in-app notifications first).

---

## 3. Architecture Principles

1. **RLS is the entire client security model.** The browser only ever holds the anon
   key. Every table has RLS enabled from creation. Default deny. The service role key
   exists ONLY in server-side API routes (QBO sync, admin operations that need it).
2. **Role drives both UI and policy.** The same `role` value that renders tab bars is
   what RLS policies check. UI and security can never disagree.
3. **Templates + exceptions.** Recurring things (weekly lesson schedule, feed board,
   task lists) are set up once via a wizard, then only deviations are edited. This is
   what makes phone-only administration tolerable.
4. **Never show a table on mobile.** Lists are cards. Bulk actions are swipe/multi-select.
   One decision per screen.
5. **Insert-only where auditability matters.** Staff punches cannot be edited by staff;
   admin corrections are new adjusting rows. Same pattern for medication logs.
6. **Barn config file.** `/config/barn.ts` holds name, colors, logo, timezone, feature
   flags, dressage test catalog overrides. Cloning = new Supabase project + new config.

---

## 4. Roles & Permissions

### Roles (enum on `profiles.role`)
- `admin` — Belle. Full access.
- `staff` — the 4 employees. Operational access.
- `parent` — account holders. Family-scoped access.

### Fine-grained permission flags (on `profiles`, admin-grantable, all default false)
- `manage_shows` — can create/edit shows and entries (for a future senior trainer)
- `manage_schedule` — can edit lesson calendar
- `manage_horses` — can edit horse profiles/feed/medical

Admin implicitly has all flags. Check flags via the `has_permission()` security
definer function (see §6), never by querying profiles inside a policy.

### Access matrix (summary)
| Resource | admin | staff | parent |
|---|---|---|---|
| Announcements | CRUD | read | read |
| Lessons/calendar | CRUD | read all | read own family's + barn-wide events |
| Punches | read all, insert corrections | insert own, read own | none |
| Tasks | CRUD | read/update assigned | none |
| Horses (barn-owned) | CRUD | read all, log care | basics only (name/photo) if their rider rides it |
| Horses (family-owned) | CRUD | read all, log care | full read on OWN horse incl. medical; basics on others |
| Show interest | read all, nudge | read | write own family's responses |
| Show entries | CRUD | read | read own family's entries + shared show info (never other families' fees) |
| Onboarding forms | read all | none | write own |
| Invoices (QBO surface) | read all | none | read own family's |
| FAQ/resources/shop | CRUD | read | read |

---

## 5. Data Model

All tables: `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`.
FKs indicated inline. Timezone: store timestamptz; render in barn TZ from config.

### Identity & family
```
profiles          user_id uuid pk (fk auth.users), role text, full_name, phone,
                  manage_shows bool, manage_schedule bool, manage_horses bool,
                  family_id uuid fk families (null for staff/admin),
                  qbo_customer_id text (parents; maps to QBO Customer)
families          name text, notes text
riders            family_id fk, name, dob date, level_id fk levels, photo_url,
                  active bool, notes text
levels            name text (e.g. Intro, Training, First), sort int
                  -- Belle-assigned formal levels; drives backfill eligibility
```

### Onboarding
```
form_templates    name, description, schema jsonb (field definitions),
                  required bool, applies_to text ('family'|'rider'), active bool
form_submissions  template_id fk, family_id fk, rider_id fk null,
                  data jsonb, signed_name text, signed_at timestamptz,
                  status text ('pending'|'complete')
```
New family registration creates one pending `form_submissions` row per required
active template → renders as their onboarding checklist. Parents blocked from full
app content (soft gate on Home) until all required forms complete. Admin dashboard:
who's incomplete. Signed forms also rendered to PDF and stored in Storage
`documents/` for the legal vault.

### Horses
```
horses            name, barn_name, owner_family_id uuid fk null (null = barn-owned),
                  photo_url, breed, dob, active bool, notes
horse_riders      horse_id fk, rider_id fk  -- who is allowed/assigned to ride
feed_plans        horse_id fk, meal text ('am'|'pm'|'lunch'), description text,
                  supplements text, special_instructions text, active bool
care_events       horse_id fk, type text ('vaccine'|'coggins'|'dental'|'deworm'|
                  'farrier'|'vet'|'medication'|'wound'|'other'),
                  description, performed_at date, due_next date null,
                  logged_by uuid fk profiles, insert-only for staff
horse_documents   horse_id fk, storage_path, label, uploaded_by
```
Daily feed list = generated view over active feed_plans grouped by meal.
"Due soon" surface for admin = care_events where due_next within 30 days.

### Scheduling
```
lesson_templates  weekday int, start_time time, duration_min int (45|60),
                  type text ('private'|'group'), instructor_id fk profiles,
                  max_riders int, level_id fk null, active bool
                  -- the recurring weekly schedule, built once via wizard
lesson_instances  template_id fk null, date date, start_time, duration_min,
                  type, instructor_id, status text ('scheduled'|'cancelled'),
                  notes  -- materialized ~4 weeks ahead by a cron/edge function;
                  one-off lessons have null template_id
lesson_riders     instance_id fk, rider_id fk,
                  status text ('booked'|'cancelled'|'backfilled'),
                  cancelled_at timestamptz null
backfill_offers   instance_id fk, rider_id fk (offered-to), offered_by fk,
                  status text ('sent'|'accepted'|'declined'|'expired'),
                  responded_at
events            type text ('show'|'clinic'|'farrier'|'vet'|'closure'|'other'),
                  title, description, start_at, end_at, location,
                  visibility text ('all'|'staff'), show_id fk null
```
**Backfill flow (admin-picks model, confirmed):**
1. Parent cancels their rider's spot (their only write on lesson data) OR admin cancels.
2. Admin gets notification → opens slot → app shows eligible riders: same `level_id`,
   not already in that instance, active. Group lessons: backfill fills the open seat.
   Private: replacement takes the slot.
3. Admin multi-selects who to notify → `backfill_offers` rows → notifications to
   those parents with Accept/Decline.
4. First `accepted` wins: creates `lesson_riders` row (status 'backfilled'),
   auto-expires sibling offers, notifies everyone of outcome. Admin can also
   directly assign, skipping offers.

**Cancellation cutoff:** config value `backfill_cutoff_minutes` (default 120).
Cancellations inside the cutoff notify admin but don't prompt backfill.

**Deferred (do not build in v1):** lesson credits/makeup accounting, horse
assignment per lesson. Schema leaves room (add `horse_id` to lesson_riders later).

### Time tracking
```
punches           profile_id fk, direction text ('in'|'out'),
                  punched_at timestamptz, lat numeric null, lng numeric null,
                  source text ('self'|'admin_adjustment'),
                  adjusts_punch_id fk null, note text
                  -- INSERT-ONLY for staff (own rows). No update/delete policies
                  -- for staff. Admin corrections = new rows with source
                  -- 'admin_adjustment' + note. Full audit trail preserved.
pay_periods       start_date, end_date, status text ('open'|'approved'|'synced')
timesheet_approvals period_id fk, profile_id fk, total_minutes int,
                  approved_by fk, approved_at, qbo_timeactivity_ids jsonb
```
GPS capture: request geolocation at punch; store if granted; punch succeeds either
way but flags `lat is null` for admin visibility. Geofence radius check (config:
barn lat/lng + radius_m) → out-of-range punches flagged, not blocked.

**Admin review UX:** card stack per employee per pay period — total hours, flagged
punches (missing out-punch, out-of-geofence, adjustments). Tap to expand/fix,
swipe to approve. "Approve all → Sync to QuickBooks" fires QBO TimeActivity writes
(server-side), stores returned IDs, marks period 'synced'.

### Tasks
```
task_templates    title, description, recurrence text ('daily'|'weekday'|'weekly'),
                  weekday int null, default_assignee fk null, active bool
tasks             template_id fk null, title, description, date date,
                  assignee fk profiles, status text ('open'|'done'),
                  completed_at, completed_by
```
Daily generation from templates via the same cron. Ad-hoc tasks created directly.

### Shows (dressage)
```
tests             catalog: name (e.g. 'Intro A', 'Training 2', 'First 3'),
                  level_group text, sort int, custom bool
                  -- pre-seeded USDF/USEF intro→fourth + FEI names; admin can add
                  -- custom rows for schooling show oddities
shows             name, venue, address, start_date, end_date,
                  status text ('gauging'|'entries_open'|'confirmed'|'complete'),
                  interest_deadline date null, entry_deadline date null,
                  logistics_md text (hotel/hauling/packing, rich text),
                  results_url text (link to official live results),
                  est_cost text
show_interest     show_id fk, rider_id fk, response text ('yes'|'no'|'maybe'),
                  responded_at   -- parents write own riders' rows only
show_entries      show_id fk, rider_id fk, horse_id fk, test_id fk,
                  ride_time timestamptz null, status ('entered'|'scratched'),
                  score numeric null, placing text null,
                  fees jsonb null  -- {entry, coaching, hauling} admin-only visibility
show_updates      show_id fk, author fk, body text, photo_path null, posted_at
                  -- the show-day thread; admin/staff post, families read
```
**Status progression drives family view:** gauging → interest poll on Home;
entries_open/confirmed → their rider's tests + ride times + logistics + results
link; during/after → updates thread + scores. Auto-reminders (see §8) hang off
interest_deadline and entry_deadline. "Nudge non-responders" button = re-notify
families with no show_interest row for eligible riders.
Interest poll pattern is generic enough to attach to clinics later (events table)
— acceptable to defer that generalization.

### Content, shop, notifications
```
announcements     title, body_md, pinned bool, notify bool, audience ('all'|'staff'),
                  author fk, posted_at
faq_items         category text, question, answer_md, sort int, active bool
resources         title, description, url_or_storage_path, category, sort
shop_products     name, description, photo_url, price_display text,
                  stripe_payment_link text, sort, active bool
notifications     profile_id fk, type text, title, body, link_path text,
                  read_at timestamptz null
                  -- in-app notification feed; bell icon + unread badge.
                  -- Email mirror per notification type per user preference.
notification_prefs profile_id fk, type text, email bool default true
```

### Invoices (QBO surface — no local invoice authoring in v1)
```
qbo_connection    singleton: tokens (encrypted), realm_id, connected_at
invoice_cache     qbo_invoice_id, family_id fk, doc_number, amount, balance,
                  due_date, status, pay_link_url, synced_at
                  -- refreshed by scheduled server job + on-demand pull
```
Parents' Home shows open balance + due date; "Pay Now" deep-links to QBO's hosted
payment page (QuickBooks Payments handles card/ACH). App never touches payment data.
Belle continues authoring invoices in QBO itself for v1.

---

## 6. Row Level Security — Implementation Spec

**Non-negotiables:**
- `alter table ... enable row level security` in the same migration that creates
  every table. No exceptions, including lookup tables.
- Role/permission checks via SECURITY DEFINER functions to avoid recursive RLS:

```sql
create or replace function public.current_role() returns text
language sql stable security definer set search_path = public as
$$ select role from profiles where user_id = auth.uid() $$;

create or replace function public.current_family() returns uuid
language sql stable security definer set search_path = public as
$$ select family_id from profiles where user_id = auth.uid() $$;

create or replace function public.has_permission(perm text) returns boolean
language plpgsql stable security definer set search_path = public as
$$ ... admin returns true; else check the named boolean flag ... $$;
```

**Policy patterns (write these for every table per the §4 matrix):**
- Read-all-authenticated: announcements(audience='all'), faq, resources, shop, tests, levels.
- Staff+admin read: punches summaries, tasks, horses full, care_events, feed_plans.
- Family-scoped read: `family_id = current_family()` — riders, form_submissions,
  invoice_cache, show_interest, show_entries (with fees column protection, below),
  lesson_riders joined through riders.
- Family-scoped write (only writes parents have):
  - show_interest insert/update for own riders
  - lesson_riders update status → 'cancelled' on own rider rows only
  - form_submissions insert/update own, only while status='pending'
  - backfill_offers update status on rows offered to own rider
- Staff insert-only: punches (own profile_id, source='self'), care_events.
  NO update/delete policy for staff on these tables.
- Admin/permission-gated writes: everything else via `current_role()='admin'`
  or `has_permission('manage_x')`.

**Column-level protections (RLS is row-level; handle columns separately):**
- `show_entries.fees` and `punches.lat/lng` must not reach parents: expose
  family-facing reads through VIEWS (`show_entries_family_v`, etc.) that omit
  sensitive columns, grant select on views, and keep base-table parent policies
  absent. Same technique for horse "basics only" (name, photo, barn_name) view
  for non-owner families whose rider is linked via horse_riders.

**Horse visibility (the interesting case):**
- Owner family: full read on own horse + its care_events + horse_documents.
- Non-owner family whose rider rides it (horse_riders link): basics view only.
  Never medical, never documents.
- Staff/admin: full.

**Storage buckets & policies (do not forget — table RLS does not cover Storage):**
- `documents/` (waivers, signed forms, Coggins): path convention
  `family_{id}/...` or `horse_{id}/...`; policies mirror table access
  (own family / horse owner / staff / admin).
- `photos/` (horse photos, show updates): read authenticated, write staff+admin.
- No public buckets.

**Process:** After every migration, run Supabase Dashboard → Advisors → Security
Advisor. Fix every flag before proceeding. Re-run before each phase ships. Also
write a small pgTAP or script-based policy test suite: for each role fixture,
assert the exact rows visible per table. Run it in CI.

**Server-side rules:** service role key only in API routes/edge functions
(QBO sync, materialization crons, backfill expiry). Never in client bundles —
add a CI grep check.

---

## 7. Navigation & Screen Map

PWA with bottom tab bar. Max 5 tabs. Tabs render from role. All admin workflows
are mobile-native (no desktop-required flows). CSV import/export endpoints exist
but are unadvertised utilities.

### Parent tabs: `Home · Lessons · Shows · More`
- **Home:** announcements (pinned first) → onboarding checklist if incomplete
  (soft-gates rest) → balance due card w/ Pay Now → next lesson card → active
  show interest polls → notification bell.
- **Lessons:** upcoming lessons per rider (cards), cancel action (cutoff-aware),
  barn calendar (list view by day), iCal subscribe button.
- **Shows:** list by status; show page renders per status (poll / entries+times+
  logistics+results link / updates thread+scores).
- **More:** family profile & riders, forms/documents, FAQ, resources, shop,
  notification prefs, install-app prompt, logout.

### Staff tabs: `Home · Clock · Tasks · Schedule · More`
- **Home:** announcements → shift today → open task count → clock status.
- **Clock:** big In/Out button, GPS capture, today's punches, week total. Insert-only.
- **Tasks:** today's cards, tap done; feed list view (generated from feed_plans)
  with per-horse special instructions; care logging quick-add (med/wound/note).
- **Schedule:** day-column view of lessons + events.
- **More:** my timesheet history, horse directory (full read), FAQ, logout.

### Admin (Belle) tabs: `Home · Schedule · Manage · Shows · More`
- **Home:** announcements composer shortcut → today: who's clocked in, lessons,
  unassigned tasks, pending cancellations needing backfill → due-soon care items
  → onboarding stragglers.
- **Schedule:** day-column calendar; tap slot to edit; long-press move; weekly
  template wizard (one-time + editable); cancellation → backfill flow lives here.
- **Manage:** card-stack timesheet review → QBO sync; tasks (templates + today);
  horses (profiles, feed plans, care log, documents); families & riders (levels!);
  forms admin; content (FAQ/resources/shop/announcements — rich text boxes).
- **Shows:** create show → status controls → interest tally + nudge → entries
  builder (roster checkboxes → horse picker → test picker → ride times two-tap
  edit) → show-day thread posting → scores entry.
- **More:** barn settings (config surface), QBO connection status, notification
  prefs, CSV utilities, logout.

**Design rules (enforce in every screen):** cards not tables; one decision per
screen; swipe/multi-select for bulk; template wizards for recurring setup;
two-tap edits for show-day ride time changes; bottom-sheet forms; 44px touch
targets; optimistic UI with toast confirmations.

---

## 8. Notifications

**Channels v1:** in-app feed (notifications table, realtime badge) + email via
Resend, per-type opt-out in notification_prefs. SMS deferred to phase 2+
(requires A2P 10DLC registration — note in backlog).

**Notification types & triggers:**
| Type | To | Trigger |
|---|---|---|
| announcement | audience | admin posts with notify=true |
| lesson_reminder | parent | cron, evening before |
| lesson_cancelled | admin | parent cancels |
| backfill_offer | selected parents | admin sends offers |
| backfill_result | offer recipients + admin | first accept / expiry |
| show_interest_open | eligible parents | show → gauging |
| show_interest_closing | non-responders | interest_deadline − 2 days |
| show_entry_deadline | admin | entry_deadline − 7 days, interested-not-entered count |
| show_ride_times | entered families | admin bulk-publishes times |
| show_update | entered families (opt) | new show_updates post |
| invoice_due | parent | invoice_cache balance>0 & due within N days (cron) |
| care_due | admin | care_events due_next within 30 days (weekly digest) |
| onboarding_nudge | incomplete families | weekly until complete |
| punch_flag | admin | missing out-punch by end of day |

All senders are server-side (edge functions / route handlers + Vercel cron).

---

## 9. Integrations

### QuickBooks Online (OAuth2, server-side only)
- Singleton connection (Belle authorizes once from admin More tab). Store
  encrypted refresh token; auto-refresh; surface connection health.
- **TimeActivity (write):** on timesheet approval, create TimeActivity entries
  per employee per day. Map profiles → QBO Employee IDs (admin mapping screen
  on first sync). Store returned IDs for idempotency; re-sync updates, not dupes.
- **Invoices (read):** scheduled pull of open invoices per mapped Customer →
  invoice_cache. Pay link = QBO invoice's hosted payment URL (QuickBooks
  Payments must be enabled on her QBO account — onboarding checklist item).
- **Fallback:** if OAuth becomes a blocker mid-build, ship CSV timesheet export
  formatted for QBO import as an interim, keep building; API sync is the target.

### Stripe Payment Links (shop)
- Belle creates products/links in Stripe dashboard; pastes link into shop_products.
  App renders grid → external checkout. Zero payment code owned.

### iCal
- `/api/ical/[token].ics` per-family and staff tokens (unguessable), rendering
  lessons (own riders), shows, barn events. Subscribe button in Lessons/More.

### Email (Resend)
- Domain sending setup (SPF/DKIM) once subdomain exists. Until then, Resend
  shared domain for dev.

---

## 10. Build Phases & Milestones

### Phase 0 — Foundation (week 1)
Repo, Next.js + Supabase wiring, barn config file, auth (email magic link +
password), profiles/roles/families/riders/levels schema + RLS + policy tests,
tab-bar shell rendering per role, PWA manifest + install prompt, notification
table + bell. **Exit:** three test users (admin/staff/parent) see correct empty
tabs; Security Advisor clean.

### Phase 1 — Core operations (weeks 2–4)
Announcements (+notify), FAQ/resources, clock in/out with GPS + flags, timesheet
card-stack review, QBO OAuth + Employee mapping + TimeActivity sync (CSV fallback
acceptable interim), task templates + daily tasks, lesson template wizard +
instance materialization cron + day-column calendar + parent lesson view +
cancellation + admin-picks backfill with offers/accept/expiry, lesson reminders.
**Exit:** Belle runs a real week — schedule, staff punches synced to QBO, a
cancellation backfilled — without leaving the app.

### Phase 2 — Barn depth (weeks 5–6)
Horse profiles + ownership/rider links + visibility views, feed plans + staff
daily feed list, care_events logging + due-soon surfacing + weekly digest,
horse documents in Storage w/ policies, onboarding form templates + submissions
+ checklist gate + PDF-to-vault + admin completeness dashboard + nudges,
events + iCal feeds.
**Exit:** new family self-onboards fully digitally; staff feed off the app;
Coggins expiry surfaces itself.

### Phase 3 — Shows & money (weeks 7–8)
Tests catalog seed, show CRUD + status machine, interest poll + tally + nudge,
entries builder (roster→horse→tests), ride-time two-tap edits + publish,
show-day updates thread + photos, scores, deadline reminders, QBO invoice pull +
family balance card + pay deep-link + due reminders, shop grid + Stripe links.
**Exit:** one full show cycle (gauge → enter → show-day → scores) run in-app;
a parent pays a QBO invoice from their phone.

### Backlog (explicitly deferred — do not build unless asked)
SMS channel (A2P), lesson credits/makeups, horse-per-lesson assignment,
in-app invoice authoring, clinic interest polls (generalize show poll),
rider progress/score history views, second-barn cloning docs, Storage photo
compression, staff shift scheduling beyond tasks.

---

## 11. Assumptions & Open Items (build against these; flag if contradicted)

- QuickBooks **Online** confirmed; QuickBooks Payments assumed available/enable-able
  on her account (verify during Phase 3 kickoff — if not, pay links degrade to
  "invoice emailed from QBO" and the app shows balance only).
- Parents hold accounts; riders have no logins. If an adult boarder rides for
  herself, she is simply a family of one — model handles it.
- Domain/subdomain deferred; deploy on vercel.app URL until decided. Email
  domain auth follows domain decision.
- Family count unknown (~15–40 assumed). Free tiers hold to several hundred users.
- Dressage-only test catalog v1 (USDF Intro–Fourth + FEI names, plus custom).
- 45/60-minute lessons only in the template wizard duration picker.
- Backfill: admin selects notify list; first accept wins; 120-min cutoff default.
- English-only UI. Barn timezone from config (America/New_York default).

## 12. Definition of Done (every feature)
- RLS policies written + policy tests passing + Security Advisor clean
- Works one-handed on a 380px viewport; no horizontal scroll
- Notification triggers wired if the feature implies one (§8 table)
- Admin edit surface exists for any content the feature displays
- No service key or sensitive column reachable from client (CI checks)
