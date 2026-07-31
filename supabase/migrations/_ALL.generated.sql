-- GENERATED FILE — do not edit. Source: supabase/migrations/*.sql
-- Regenerate with: npm run db:combine
--
-- Paste the whole thing into the Supabase SQL Editor and Run. Every
-- statement is idempotent, so re-running after a partial failure is safe.
--
-- Order applied:
--   1. 20260727000100_core_identity.sql
--   2. 20260727000200_security_definer_helpers.sql
--   3. 20260727000300_core_identity_policies.sql
--   4. 20260727000400_notifications.sql
--   5. 20260728000100_announcements.sql
--   6. 20260728000200_tasks.sql
--   7. 20260728000300_lessons.sql
--   8. 20260728000400_backfill.sql
--   9. 20260728000500_timeclock.sql
--   10. 20260728000600_horses.sql
--   11. 20260728000700_care_events.sql
--   12. 20260729000100_horse_documents.sql
--   13. 20260729000200_onboarding_forms.sql
--   14. 20260729000300_events_ical.sql
--   15. 20260729000400_lock_down_definer_grants.sql
--   16. 20260731000100_at_least_one_admin.sql


-------------------------------------------------------------------------------
-- BEGIN 20260727000100_core_identity.sql
-------------------------------------------------------------------------------

-- =============================================================================
-- 0001 — Core identity tables: families, levels, profiles, riders
--
-- HARD RULE (SPEC §6): every table gets `enable row level security` in the SAME
-- migration that creates it. No exceptions, including lookup tables. With RLS on
-- and no policies yet, these tables are default-deny — policies arrive in 0003,
-- so there is never a window where the tables are readable without a policy.
--
-- NOT APPLIED YET. See README → "Part 2: connect Supabase".
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- families
-- -----------------------------------------------------------------------------
create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  notes       text
);

alter table public.families enable row level security;

comment on table public.families is
  'An account-holding household. Parents are scoped to exactly one family.';

-- -----------------------------------------------------------------------------
-- levels — Belle-assigned formal levels; drives lesson backfill eligibility
-- -----------------------------------------------------------------------------
create table if not exists public.levels (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null unique,
  sort        integer not null default 0
);

alter table public.levels enable row level security;

comment on table public.levels is
  'Lookup of rider levels (Intro, Training, First, ...). RLS on, per SPEC §6.';

-- -----------------------------------------------------------------------------
-- profiles — one row per auth user; `role` drives BOTH the tab bar and RLS
--
-- SPEC §5 models this with user_id as the primary key; the Phase 0 brief
-- requires a uuid surrogate `id` on every table. Both are honoured: `id` is the
-- PK, `user_id` is a NOT NULL UNIQUE FK to auth.users.
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  user_id         uuid not null unique references auth.users (id) on delete cascade,
  role            text not null check (role in ('admin', 'staff', 'parent')),
  full_name       text,
  phone           text,
  -- Fine-grained flags, admin-grantable, all default false (SPEC §4).
  -- Admin implicitly has all of them — see public.has_permission().
  manage_shows    boolean not null default false,
  manage_schedule boolean not null default false,
  manage_horses   boolean not null default false,
  -- Parents belong to a family; staff and admin never do.
  family_id       uuid references public.families (id) on delete set null,
  qbo_customer_id text,
  constraint profiles_family_only_for_parents
    check (role = 'parent' or family_id is null)
);

alter table public.profiles enable row level security;

create index if not exists profiles_family_id_idx on public.profiles (family_id);
create index if not exists profiles_role_idx on public.profiles (role);

comment on table public.profiles is
  'One row per auth user. `role` is the single value that drives both navigation and RLS.';

-- -----------------------------------------------------------------------------
-- riders — minors attached to a family. No logins of their own in v1.
-- -----------------------------------------------------------------------------
create table if not exists public.riders (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  family_id   uuid not null references public.families (id) on delete cascade,
  name        text not null,
  dob         date,
  level_id    uuid references public.levels (id) on delete set null,
  photo_url   text,
  active      boolean not null default true,
  notes       text
);

alter table public.riders enable row level security;

create index if not exists riders_family_id_idx on public.riders (family_id);
create index if not exists riders_level_id_idx on public.riders (level_id);

comment on table public.riders is
  'A rider (usually a minor) belonging to a family. Family-scoped for parents.';

commit;

-------------------------------------------------------------------------------
-- END 20260727000100_core_identity.sql
-------------------------------------------------------------------------------


-------------------------------------------------------------------------------
-- BEGIN 20260727000200_security_definer_helpers.sql
-------------------------------------------------------------------------------

-- =============================================================================
-- 0002 — SECURITY DEFINER helper functions (SPEC §6)
--
-- Why these exist: an RLS policy on `profiles` that itself queries `profiles`
-- recurses. Reading role/family through a SECURITY DEFINER function breaks the
-- cycle, and gives one place to change how a permission is decided.
--
-- Hardening beyond SPEC §6: `set search_path = ''` (rather than `= public`) and
-- fully-qualified identifiers throughout. An empty search_path is the strictest
-- option and is what Supabase's Security Advisor wants to see — a SECURITY
-- DEFINER function with a mutable search_path is a privilege-escalation vector.
--
-- NOTE ON THE NAME `current_role`: CURRENT_ROLE is a reserved SQL keyword, so
-- the identifier is double-quoted at definition. Call it as
-- `public."current_role"()` in policies to be unambiguous.
--
-- NOT APPLIED YET. See README → "Part 2: connect Supabase".
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- current_role() — 'admin' | 'staff' | 'parent' | null (no profile / signed out)
-- -----------------------------------------------------------------------------
create or replace function public."current_role"()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.user_id = auth.uid();
$$;

comment on function public."current_role"() is
  'Role of the calling user, or null. SECURITY DEFINER to avoid recursive RLS on profiles.';

-- -----------------------------------------------------------------------------
-- current_family() — the caller's family, or null for staff/admin
-- -----------------------------------------------------------------------------
create or replace function public.current_family()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.family_id from public.profiles p where p.user_id = auth.uid();
$$;

comment on function public.current_family() is
  'Family id of the calling user, or null. Basis of every family-scoped read policy.';

-- -----------------------------------------------------------------------------
-- current_profile() — the caller's profiles.id
--
-- Supporting helper (not in SPEC §6's list of three). Needed because rows are
-- linked to profiles.id, while auth gives us profiles.user_id.
-- -----------------------------------------------------------------------------
create or replace function public.current_profile()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p where p.user_id = auth.uid();
$$;

comment on function public.current_profile() is
  'profiles.id of the calling user. Used by policies on tables keyed to profiles.id.';

-- -----------------------------------------------------------------------------
-- has_permission(perm) — admin implicitly true; otherwise the named flag
--
-- The permission name is whitelisted before it reaches format(%I), so this
-- cannot be used to read an arbitrary column.
-- -----------------------------------------------------------------------------
create or replace function public.has_permission(perm text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role    text;
  v_granted boolean;
begin
  select p.role into v_role from public.profiles p where p.user_id = auth.uid();

  if v_role is null then
    return false;
  end if;

  -- Admin implicitly holds every permission flag (SPEC §4).
  if v_role = 'admin' then
    return true;
  end if;

  if perm not in ('manage_shows', 'manage_schedule', 'manage_horses') then
    return false;
  end if;

  execute format(
    'select coalesce(p.%I, false) from public.profiles p where p.user_id = auth.uid()',
    perm
  ) into v_granted;

  return coalesce(v_granted, false);
end;
$$;

comment on function public.has_permission(text) is
  'True when the caller is admin, or holds the named manage_* flag. Never query profiles inside a policy directly — call this.';

commit;

-------------------------------------------------------------------------------
-- END 20260727000200_security_definer_helpers.sql
-------------------------------------------------------------------------------


-------------------------------------------------------------------------------
-- BEGIN 20260727000300_core_identity_policies.sql
-------------------------------------------------------------------------------

-- =============================================================================
-- 0003 — RLS policies for families, levels, profiles, riders (SPEC §4 matrix)
--
-- Shape of every policy set below:
--   * exactly ONE permissive SELECT policy per table (multiple permissive
--     policies for the same action are a performance-advisor warning, and they
--     make "who can see this row" harder to reason about);
--   * separate INSERT / UPDATE / DELETE policies for the write paths;
--   * `to authenticated` everywhere — anon is never granted a policy, so the
--     signed-out default is deny;
--   * helper calls wrapped as `(select public.fn())` so Postgres evaluates them
--     once per statement instead of once per row.
--
-- Phase 0 covers four tables. Later phases add their own policy migrations.
--
-- NOT APPLIED YET. See README → "Part 2: connect Supabase".
-- =============================================================================

begin;

-- =============================================================================
-- levels — read-all-authenticated lookup; admin writes
-- =============================================================================
drop policy if exists "levels: read (all authenticated)" on public.levels;
create policy "levels: read (all authenticated)"
  on public.levels for select to authenticated
  using (true);

drop policy if exists "levels: admin insert" on public.levels;
create policy "levels: admin insert"
  on public.levels for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "levels: admin update" on public.levels;
create policy "levels: admin update"
  on public.levels for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "levels: admin delete" on public.levels;
create policy "levels: admin delete"
  on public.levels for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- families
--   admin  — full
--   staff  — read all (they work across every family)
--   parent — read own family only
-- =============================================================================
drop policy if exists "families: read (admin/staff all, parent own)" on public.families;
create policy "families: read (admin/staff all, parent own)"
  on public.families for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or id = (select public.current_family())
  );

drop policy if exists "families: admin insert" on public.families;
create policy "families: admin insert"
  on public.families for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "families: admin update" on public.families;
create policy "families: admin update"
  on public.families for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "families: admin delete" on public.families;
create policy "families: admin delete"
  on public.families for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- riders
--   admin  — full
--   staff  — read all (they teach and handle every rider)
--   parent — read own family's riders only
--
-- Parents have no write on riders: rider details are barn-maintained. Parent
-- writes arrive in Phase 2 via onboarding form_submissions, not here.
-- =============================================================================
drop policy if exists "riders: read (admin/staff all, parent own family)" on public.riders;
create policy "riders: read (admin/staff all, parent own family)"
  on public.riders for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or family_id = (select public.current_family())
  );

drop policy if exists "riders: admin insert" on public.riders;
create policy "riders: admin insert"
  on public.riders for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "riders: admin update" on public.riders;
create policy "riders: admin update"
  on public.riders for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "riders: admin delete" on public.riders;
create policy "riders: admin delete"
  on public.riders for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- profiles
--   admin  — full
--   staff  — read all (instructor names, who is on shift)
--   parent — read own row, plus other profiles in their own family
--
-- A parent may edit their own row, but MUST NOT be able to promote themselves.
-- RLS is row-level, so the column protection is a trigger (below), not a policy.
-- =============================================================================
drop policy if exists "profiles: read (self, own family, or admin/staff)" on public.profiles;
create policy "profiles: read (self, own family, or admin/staff)"
  on public.profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public."current_role"()) in ('admin', 'staff')
    or (family_id is not null and family_id = (select public.current_family()))
  );

drop policy if exists "profiles: admin insert" on public.profiles;
create policy "profiles: admin insert"
  on public.profiles for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "profiles: update own row or admin" on public.profiles;
create policy "profiles: update own row or admin"
  on public.profiles for update to authenticated
  using (
    user_id = (select auth.uid())
    or (select public."current_role"()) = 'admin'
  )
  with check (
    user_id = (select auth.uid())
    or (select public."current_role"()) = 'admin'
  );

drop policy if exists "profiles: admin delete" on public.profiles;
create policy "profiles: admin delete"
  on public.profiles for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- -----------------------------------------------------------------------------
-- Privilege-escalation guard.
--
-- The UPDATE policy above lets a user edit their own profile (name, phone).
-- Without this trigger the same policy would also let them set role='admin'.
-- Only an admin may change role, the manage_* flags, family linkage, the QBO
-- customer mapping, or the auth user this row points at.
-- -----------------------------------------------------------------------------
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- No end user in context: this is a service-role / server-side call, which
  -- already bypasses RLS entirely. Nothing to escalate.
  if auth.uid() is null then
    return new;
  end if;

  if (select public."current_role"()) = 'admin' then
    return new;
  end if;

  if new.role            is distinct from old.role
     or new.manage_shows    is distinct from old.manage_shows
     or new.manage_schedule is distinct from old.manage_schedule
     or new.manage_horses   is distinct from old.manage_horses
     or new.family_id       is distinct from old.family_id
     or new.qbo_customer_id is distinct from old.qbo_customer_id
     or new.user_id         is distinct from old.user_id
     or new.id              is distinct from old.id
  then
    raise exception
      'Only an admin may change role, permission flags, family linkage or billing mapping.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;

create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row
  execute function public.profiles_guard_privileged_columns();

commit;

-------------------------------------------------------------------------------
-- END 20260727000300_core_identity_policies.sql
-------------------------------------------------------------------------------


-------------------------------------------------------------------------------
-- BEGIN 20260727000400_notifications.sql
-------------------------------------------------------------------------------

-- =============================================================================
-- 0004 — notifications (Phase 0 brief §2: "notifications table + bell icon")
--
-- The in-app notification feed behind the bell badge. Phase 0 ships the table
-- and its policies only; senders are wired per feature in Phases 1–3 (SPEC §8).
-- RLS is enabled in this same migration, per the hard rule.
--
-- NOT APPLIED YET. See README → "Part 2: connect Supabase".
-- =============================================================================

begin;

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  link_path   text,
  read_at     timestamptz
);

alter table public.notifications enable row level security;

-- Powers the unread badge query: own rows, unread first.
create index if not exists notifications_profile_unread_idx
  on public.notifications (profile_id, read_at, created_at desc);

comment on table public.notifications is
  'In-app notification feed. One row per recipient. Inserted server-side only.';

-- -----------------------------------------------------------------------------
-- Policies: a user sees only their own notifications. Nobody but an admin can
-- create them from a client; in practice they are inserted by server-side jobs
-- using the service role, which bypasses RLS.
-- -----------------------------------------------------------------------------
drop policy if exists "notifications: read own" on public.notifications;
create policy "notifications: read own"
  on public.notifications for select to authenticated
  using (profile_id = (select public.current_profile()));

drop policy if exists "notifications: mark own read" on public.notifications;
create policy "notifications: mark own read"
  on public.notifications for update to authenticated
  using (profile_id = (select public.current_profile()))
  with check (profile_id = (select public.current_profile()));

drop policy if exists "notifications: admin insert" on public.notifications;
create policy "notifications: admin insert"
  on public.notifications for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

-- No DELETE policy: the feed is append-only from a client's point of view.

-- -----------------------------------------------------------------------------
-- Column-level protection. RLS is row-level, so without this a recipient could
-- rewrite the title or body of a notification they received. The only column a
-- client ever needs to write is read_at.
-- -----------------------------------------------------------------------------
revoke update on public.notifications from authenticated;
grant  update (read_at) on public.notifications to authenticated;

commit;

-------------------------------------------------------------------------------
-- END 20260727000400_notifications.sql
-------------------------------------------------------------------------------


-------------------------------------------------------------------------------
-- BEGIN 20260728000100_announcements.sql
-------------------------------------------------------------------------------

-- =============================================================================
-- 0005 — announcements (Phase 1, slice 1)
--
-- Barn news. Admin writes; staff and parents read, filtered by audience.
-- RLS is enabled in this same migration, per the standing rule.
--
-- Audience is the whole security story here: an announcement marked 'staff' is
-- internal (rota changes, pay period notes) and a parent must never see it.
-- That is enforced by the RLS policy, not by a WHERE clause in the app — the
-- app's query is unfiltered on purpose, so a forgotten filter cannot leak.
--
-- NOT APPLIED BY THIS REPO. Paste into the Supabase SQL Editor. Safe to re-run.
-- =============================================================================

begin;

create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  title       text not null check (length(btrim(title)) > 0),
  -- Named body_md per SPEC §5. Phase 1 renders it as plain text with line
  -- breaks; the rich-text editor arrives with the content admin surfaces.
  body_md     text not null default '',
  pinned      boolean not null default false,
  notify      boolean not null default false,
  audience    text not null default 'all' check (audience in ('all', 'staff')),
  author      uuid references public.profiles (id) on delete set null,
  posted_at   timestamptz not null default now(),
  -- Set by the fan-out trigger below the first time notifications go out.
  -- Makes the fan-out idempotent: editing an announcement afterwards must not
  -- re-notify everyone.
  notified_at timestamptz
);

alter table public.announcements enable row level security;

-- Home lists pinned first, then newest. Audience is in the index because every
-- parent read filters on it.
create index if not exists announcements_feed_idx
  on public.announcements (audience, pinned desc, posted_at desc);

create index if not exists announcements_author_idx on public.announcements (author);

comment on table public.announcements is
  'Barn announcements. audience=staff is internal and never visible to parents.';

-- -----------------------------------------------------------------------------
-- Policies
--   admin  — full CRUD
--   staff  — read every announcement, both audiences
--   parent — read audience='all' only
--
-- A signed-in user with no profiles row has no role, so the read policy matches
-- nothing for them. Being authenticated is not enough; you need a role.
-- -----------------------------------------------------------------------------
drop policy if exists "announcements: read (audience-scoped)" on public.announcements;
create policy "announcements: read (audience-scoped)"
  on public.announcements for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or ((select public."current_role"()) = 'parent' and audience = 'all')
  );

drop policy if exists "announcements: admin insert" on public.announcements;
create policy "announcements: admin insert"
  on public.announcements for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "announcements: admin update" on public.announcements;
create policy "announcements: admin update"
  on public.announcements for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "announcements: admin delete" on public.announcements;
create policy "announcements: admin delete"
  on public.announcements for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- -----------------------------------------------------------------------------
-- Notification fan-out.
--
-- Runs in the database rather than in a route handler so that posting an
-- announcement and notifying its audience are one atomic act. There is no code
-- path that can create an announcement with notify=true and silently skip the
-- notifications — including a future CSV import or an admin working directly in
-- the SQL Editor.
--
-- BEFORE (not AFTER) so notified_at can be set on the row being written instead
-- of issuing a second UPDATE, which would re-enter this trigger.
--
-- SECURITY DEFINER because it inserts into notifications on behalf of other
-- users, which the caller's own RLS policies rightly forbid.
--
-- TODO (deferred, SPEC §8): mirror each notification to email via Resend, honouring
-- notification_prefs. In-app only for now — nothing here sends mail.
-- -----------------------------------------------------------------------------
create or replace function public.announcements_fan_out_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only fan out once, and only when asked to.
  if new.notify is not true or new.notified_at is not null then
    return new;
  end if;

  insert into public.notifications (profile_id, type, title, body, link_path)
  select p.id,
         'announcement',
         new.title,
         -- Preview only; the full text lives on the announcement itself.
         left(coalesce(new.body_md, ''), 280),
         '/home'
    from public.profiles p
   where p.id is distinct from new.author        -- don't notify the author
     and (
       new.audience = 'all'
       or (new.audience = 'staff' and p.role in ('admin', 'staff'))
     );

  new.notified_at := now();
  return new;
end;
$$;

comment on function public.announcements_fan_out_notifications() is
  'Writes one notifications row per recipient when an announcement is posted with notify=true. Idempotent via announcements.notified_at.';

drop trigger if exists announcements_fan_out_notifications on public.announcements;

create trigger announcements_fan_out_notifications
  before insert or update on public.announcements
  for each row
  execute function public.announcements_fan_out_notifications();

commit;

-------------------------------------------------------------------------------
-- END 20260728000100_announcements.sql
-------------------------------------------------------------------------------


-------------------------------------------------------------------------------
-- BEGIN 20260728000200_tasks.sql
-------------------------------------------------------------------------------

-- =============================================================================
-- 0006 — task_templates + tasks (Phase 1, slice 2)
--
-- The barn's daily work. Admin defines recurring templates and assigns work;
-- staff see only what is assigned to them and can do one thing to it: mark it
-- done. Parents never see any of it.
--
-- RLS is enabled in this same migration for both tables, per the standing rule.
--
-- The interesting constraint is staff UPDATE. A row policy alone would let a
-- staff member edit any field of their own task — including reassigning it to
-- someone else, or moving it to another date. So the policy restricts WHICH
-- ROWS they may touch and a trigger restricts WHICH COLUMNS may change, the
-- same split already used on profiles and notifications.
--
-- NOT APPLIED BY THIS REPO. Paste into the Supabase SQL Editor. Safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- task_templates — the recurring work, set up once (SPEC §3.3 "templates +
-- exceptions"). Admin-only in every direction; staff never read these, they
-- only ever see the generated tasks.
-- -----------------------------------------------------------------------------
create table if not exists public.task_templates (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  title            text not null check (length(btrim(title)) > 0),
  description      text not null default '',
  recurrence       text not null check (recurrence in ('daily', 'weekday', 'weekly')),
  -- ISO weekday, 1 = Monday … 7 = Sunday. Required for 'weekly', meaningless
  -- otherwise, so the constraint enforces exactly that.
  weekday          integer check (weekday between 1 and 7),
  default_assignee uuid references public.profiles (id) on delete set null,
  active           boolean not null default true,
  constraint task_templates_weekday_matches_recurrence check (
    (recurrence = 'weekly' and weekday is not null)
    or (recurrence <> 'weekly' and weekday is null)
  )
);

alter table public.task_templates enable row level security;

create index if not exists task_templates_active_idx
  on public.task_templates (active, recurrence);

comment on table public.task_templates is
  'Recurring task definitions. Admin-only; staff see generated tasks, not templates.';

-- -----------------------------------------------------------------------------
-- tasks — one row per job per day.
-- -----------------------------------------------------------------------------
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  template_id  uuid references public.task_templates (id) on delete set null,
  title        text not null check (length(btrim(title)) > 0),
  description  text not null default '',
  date         date not null default current_date,
  assignee     uuid references public.profiles (id) on delete set null,
  status       text not null default 'open' check (status in ('open', 'done')),
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  -- 'done' and the completion stamps travel together or not at all. Without
  -- this a task could read done with no record of who did it, or open while
  -- still carrying a completion.
  constraint tasks_completion_is_consistent check (
    (status = 'done' and completed_at is not null)
    or (status = 'open' and completed_at is null and completed_by is null)
  )
);

alter table public.tasks enable row level security;

-- Staff open their tab to "my tasks for today"; admin opens "everything today".
create index if not exists tasks_assignee_date_idx on public.tasks (assignee, date, status);
create index if not exists tasks_date_idx on public.tasks (date, status);

-- Makes template generation idempotent: one row per template per day. Ad-hoc
-- tasks have a null template_id and are not constrained, so an admin can add
-- the same one twice on purpose.
create unique index if not exists tasks_one_per_template_per_day
  on public.tasks (template_id, date)
  where template_id is not null;

comment on table public.tasks is
  'A single job on a single day. Staff read and complete only their own; parents see none.';

-- =============================================================================
-- Policies — task_templates (admin only, all four verbs)
-- =============================================================================
drop policy if exists "task_templates: admin read" on public.task_templates;
create policy "task_templates: admin read"
  on public.task_templates for select to authenticated
  using ((select public."current_role"()) = 'admin');

drop policy if exists "task_templates: admin insert" on public.task_templates;
create policy "task_templates: admin insert"
  on public.task_templates for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "task_templates: admin update" on public.task_templates;
create policy "task_templates: admin update"
  on public.task_templates for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "task_templates: admin delete" on public.task_templates;
create policy "task_templates: admin delete"
  on public.task_templates for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- Policies — tasks
--   admin  — full CRUD
--   staff  — read ONLY tasks assigned to them; update only those rows
--   parent — nothing (no policy matches them)
--
-- Note the read policy does not mention 'parent' at all. A parent's role never
-- satisfies either branch, so they see zero rows without a special case.
-- =============================================================================
drop policy if exists "tasks: read (admin all, staff own assignments)" on public.tasks;
create policy "tasks: read (admin all, staff own assignments)"
  on public.tasks for select to authenticated
  using (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'staff'
      and assignee = (select public.current_profile())
    )
  );

drop policy if exists "tasks: admin insert" on public.tasks;
create policy "tasks: admin insert"
  on public.tasks for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

-- Staff may update a row that is theirs and must still be theirs afterwards.
-- The WITH CHECK is what stops them handing a task to someone else; the column
-- trigger below stops them changing anything other than completion.
drop policy if exists "tasks: update (admin any, staff own assignments)" on public.tasks;
create policy "tasks: update (admin any, staff own assignments)"
  on public.tasks for update to authenticated
  using (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'staff'
      and assignee = (select public.current_profile())
    )
  )
  with check (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'staff'
      and assignee = (select public.current_profile())
    )
  );

drop policy if exists "tasks: admin delete" on public.tasks;
create policy "tasks: admin delete"
  on public.tasks for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- -----------------------------------------------------------------------------
-- Column guard for staff completions.
--
-- The UPDATE policy above decides which ROWS a staff member may write. This
-- decides which COLUMNS. Without it, "staff may update their own task" also
-- means they may retitle it, move it to next week, or detach it from its
-- template — and, since the WITH CHECK only requires the row still be theirs,
-- they could not give it away but could still rewrite the work itself.
--
-- Staff may set status, completed_at and completed_by, and nothing else. They
-- may also un-complete a task they ticked by mistake.
-- -----------------------------------------------------------------------------
create or replace function public.tasks_guard_staff_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role       text;
  v_profile_id uuid;
begin
  -- No end user in context: a service-role or server-side call, which already
  -- bypasses RLS. Nothing to restrict.
  if auth.uid() is null then
    return new;
  end if;

  select p.role, p.id into v_role, v_profile_id
    from public.profiles p
   where p.user_id = auth.uid();

  if v_role = 'admin' then
    return new;
  end if;

  if new.title       is distinct from old.title
     or new.description is distinct from old.description
     or new.date        is distinct from old.date
     or new.assignee    is distinct from old.assignee
     or new.template_id is distinct from old.template_id
     or new.id          is distinct from old.id
  then
    raise exception 'Staff may only complete a task, not change what it is or who it belongs to.'
      using errcode = '42501';
  end if;

  -- A completion must be attributed to the person doing it.
  if new.status = 'done' and new.completed_by is distinct from v_profile_id then
    raise exception 'A task must be completed by the person marking it done.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.tasks_guard_staff_columns() is
  'Restricts non-admin task updates to the completion columns, and forces completed_by to be the caller.';

drop trigger if exists tasks_guard_staff_columns on public.tasks;

create trigger tasks_guard_staff_columns
  before update on public.tasks
  for each row
  execute function public.tasks_guard_staff_columns();

-- =============================================================================
-- generate_tasks_for_date(target_date) — materialise a day's tasks
--
-- Idempotent by construction: the unique index on (template_id, date) plus
-- ON CONFLICT DO NOTHING means running it twice creates nothing the second
-- time, and it can be re-run safely after adding a template mid-day.
--
-- Returns the number of tasks actually created, so the admin UI can report
-- "3 tasks generated" rather than a silent success.
--
-- TODO (deferred): a scheduled cron should call this nightly. For now the
-- admin triggers it from Manage → Tasks. Nothing schedules itself.
-- =============================================================================
create or replace function public.generate_tasks_for_date(target_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer;
  v_iso_dow integer := extract(isodow from target_date);
begin
  -- Admin-only. This runs as its own owner and writes tasks for everyone, so
  -- it must not be callable by staff or parents.
  if (select public."current_role"()) is distinct from 'admin' then
    raise exception 'Only an admin may generate tasks.' using errcode = '42501';
  end if;

  insert into public.tasks (template_id, title, description, date, assignee, status)
  select t.id, t.title, t.description, target_date, t.default_assignee, 'open'
    from public.task_templates t
   where t.active
     and (
       t.recurrence = 'daily'
       or (t.recurrence = 'weekday' and v_iso_dow between 1 and 5)
       or (t.recurrence = 'weekly' and t.weekday = v_iso_dow)
     )
  on conflict (template_id, date) where template_id is not null do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

comment on function public.generate_tasks_for_date(date) is
  'Creates today''s tasks from active templates. Idempotent; admin-only; returns the count created.';

-- The function is SECURITY DEFINER and gates on role internally, so it is safe
-- to expose. anon has no session, so current_role() is null and it refuses.
revoke all on function public.generate_tasks_for_date(date) from public;
grant execute on function public.generate_tasks_for_date(date) to authenticated;

commit;

-------------------------------------------------------------------------------
-- END 20260728000200_tasks.sql
-------------------------------------------------------------------------------


-------------------------------------------------------------------------------
-- BEGIN 20260728000300_lessons.sql
-------------------------------------------------------------------------------

-- =============================================================================
-- 0007 — lesson_templates + lesson_instances + lesson_riders (Phase 1, slice 3a)
--
-- The weekly riding schedule. Belle builds the recurring pattern once as
-- templates, a generator materialises real dated instances from it, and riders
-- are booked into those instances.
--
-- RLS is enabled in this same migration for all three tables.
--
-- Two things make this slice harder than tasks, and both are handled with
-- SECURITY DEFINER helpers rather than nested policy subqueries:
--
--   1. A parent may see a lesson instance only if one of THEIR riders is in it.
--      That is a fact about lesson_riders ⋈ riders, read from a policy on
--      lesson_instances — three tables, each with its own RLS. Expressed
--      inline it either recurses or silently returns nothing depending on
--      evaluation order. family_sees_instance() answers the question once, with
--      RLS suspended, and the policy just calls it.
--   2. The same applies to "is this lesson_riders row one of my family's?" —
--      family_owns_rider().
--
-- NOT APPLIED BY THIS REPO. Paste into the Supabase SQL Editor. Safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- lesson_templates — the recurring weekly schedule, built once via the wizard.
-- -----------------------------------------------------------------------------
create table if not exists public.lesson_templates (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  -- ISO weekday, 1 = Monday … 7 = Sunday.
  weekday       integer not null check (weekday between 1 and 7),
  start_time    time not null,
  duration_min  integer not null check (duration_min in (45, 60)),
  type          text not null check (type in ('private', 'group')),
  instructor_id uuid references public.profiles (id) on delete set null,
  max_riders    integer not null default 1 check (max_riders >= 1),
  level_id      uuid references public.levels (id) on delete set null,
  active        boolean not null default true
);

alter table public.lesson_templates enable row level security;

create index if not exists lesson_templates_active_idx
  on public.lesson_templates (active, weekday, start_time);
create index if not exists lesson_templates_instructor_idx
  on public.lesson_templates (instructor_id);
create index if not exists lesson_templates_level_idx
  on public.lesson_templates (level_id);

comment on table public.lesson_templates is
  'The recurring weekly lesson pattern. Instances are materialised from these.';

-- -----------------------------------------------------------------------------
-- lesson_instances — a real lesson on a real date. A null template_id means a
-- one-off that was not generated from the weekly pattern.
-- -----------------------------------------------------------------------------
create table if not exists public.lesson_instances (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  template_id   uuid references public.lesson_templates (id) on delete set null,
  date          date not null,
  start_time    time not null,
  duration_min  integer not null check (duration_min in (45, 60)),
  type          text not null check (type in ('private', 'group')),
  instructor_id uuid references public.profiles (id) on delete set null,
  status        text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  notes         text not null default ''
);

alter table public.lesson_instances enable row level security;

create index if not exists lesson_instances_date_idx
  on public.lesson_instances (date, start_time);
create index if not exists lesson_instances_instructor_idx
  on public.lesson_instances (instructor_id);

-- Makes materialisation idempotent: one instance per template per day. One-off
-- lessons have a null template_id and are deliberately unconstrained, so an
-- admin can add two at the same time if they mean to.
create unique index if not exists lesson_instances_one_per_template_per_day
  on public.lesson_instances (template_id, date)
  where template_id is not null;

comment on table public.lesson_instances is
  'A dated lesson. Generated from a template, or one-off when template_id is null.';

-- -----------------------------------------------------------------------------
-- lesson_riders — who is in which lesson.
-- -----------------------------------------------------------------------------
create table if not exists public.lesson_riders (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  instance_id  uuid not null references public.lesson_instances (id) on delete cascade,
  rider_id     uuid not null references public.riders (id) on delete cascade,
  status       text not null default 'booked' check (status in ('booked', 'cancelled', 'backfilled')),
  cancelled_at timestamptz,
  -- One booking per rider per lesson. Without this a double-tap on the admin
  -- booking control silently books the same child twice.
  constraint lesson_riders_no_double_booking unique (instance_id, rider_id)
);

alter table public.lesson_riders enable row level security;

create index if not exists lesson_riders_instance_idx on public.lesson_riders (instance_id, status);
create index if not exists lesson_riders_rider_idx on public.lesson_riders (rider_id, status);

comment on table public.lesson_riders is
  'A rider''s place in a lesson. Cancelling is the only write a parent has here.';

-- =============================================================================
-- SECURITY DEFINER helpers — see the header note on why these exist.
-- =============================================================================

-- Does the calling family have a rider in this lesson instance?
create or replace function public.family_sees_instance(instance uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.lesson_riders lr
      join public.riders r on r.id = lr.rider_id
     where lr.instance_id = instance
       and r.family_id is not distinct from public.current_family()
       and public.current_family() is not null
  );
$$;

comment on function public.family_sees_instance(uuid) is
  'True when one of the calling family''s riders is in the given lesson instance. SECURITY DEFINER to avoid cross-table RLS recursion.';

-- Does this rider belong to the calling family?
create or replace function public.family_owns_rider(rider uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.riders r
     where r.id = rider
       and r.family_id is not distinct from public.current_family()
       and public.current_family() is not null
  );
$$;

comment on function public.family_owns_rider(uuid) is
  'True when the given rider belongs to the calling family. Supporting helper for lesson_riders policies.';

-- =============================================================================
-- Policies — lesson_templates: admin CRUD, staff read, parents nothing.
-- =============================================================================
drop policy if exists "lesson_templates: read (admin/staff)" on public.lesson_templates;
create policy "lesson_templates: read (admin/staff)"
  on public.lesson_templates for select to authenticated
  using ((select public."current_role"()) in ('admin', 'staff'));

drop policy if exists "lesson_templates: admin insert" on public.lesson_templates;
create policy "lesson_templates: admin insert"
  on public.lesson_templates for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "lesson_templates: admin update" on public.lesson_templates;
create policy "lesson_templates: admin update"
  on public.lesson_templates for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "lesson_templates: admin delete" on public.lesson_templates;
create policy "lesson_templates: admin delete"
  on public.lesson_templates for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- Policies — lesson_instances: admin CRUD, staff read all, parents read only
-- the instances one of their own riders is in.
-- =============================================================================
drop policy if exists "lesson_instances: read (admin/staff all, parent own riders)" on public.lesson_instances;
create policy "lesson_instances: read (admin/staff all, parent own riders)"
  on public.lesson_instances for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (
      (select public."current_role"()) = 'parent'
      and public.family_sees_instance(id)
    )
  );

drop policy if exists "lesson_instances: admin insert" on public.lesson_instances;
create policy "lesson_instances: admin insert"
  on public.lesson_instances for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "lesson_instances: admin update" on public.lesson_instances;
create policy "lesson_instances: admin update"
  on public.lesson_instances for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "lesson_instances: admin delete" on public.lesson_instances;
create policy "lesson_instances: admin delete"
  on public.lesson_instances for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- Policies — lesson_riders
--   admin  — full CRUD
--   staff  — read all
--   parent — read their own family's rows; UPDATE them only to cancel
--
-- The row policy decides WHICH ROWS a parent may write. The trigger below
-- decides WHICH COLUMNS and WHICH STATUS TRANSITIONS, because a row policy
-- alone would let a parent flip a cancellation back to 'booked', or promote it
-- to 'backfilled', or move the booking to a different lesson.
-- =============================================================================
drop policy if exists "lesson_riders: read (admin/staff all, parent own family)" on public.lesson_riders;
create policy "lesson_riders: read (admin/staff all, parent own family)"
  on public.lesson_riders for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (
      (select public."current_role"()) = 'parent'
      and public.family_owns_rider(rider_id)
    )
  );

drop policy if exists "lesson_riders: admin insert" on public.lesson_riders;
create policy "lesson_riders: admin insert"
  on public.lesson_riders for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "lesson_riders: update (admin any, parent own riders)" on public.lesson_riders;
create policy "lesson_riders: update (admin any, parent own riders)"
  on public.lesson_riders for update to authenticated
  using (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'parent'
      and public.family_owns_rider(rider_id)
    )
  )
  with check (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'parent'
      and public.family_owns_rider(rider_id)
    )
  );

drop policy if exists "lesson_riders: admin delete" on public.lesson_riders;
create policy "lesson_riders: admin delete"
  on public.lesson_riders for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- -----------------------------------------------------------------------------
-- Column and transition guard for parent cancellations.
-- -----------------------------------------------------------------------------
create or replace function public.lesson_riders_guard_parent_updates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  -- Service-role / server-side call; already bypasses RLS.
  if auth.uid() is null then
    return new;
  end if;

  v_role := (select public."current_role"());

  if v_role = 'admin' then
    return new;
  end if;

  if v_role is distinct from 'parent' then
    raise exception 'Only an admin or the rider''s own family may change a booking.'
      using errcode = '42501';
  end if;

  if new.instance_id is distinct from old.instance_id
     or new.rider_id is distinct from old.rider_id
     or new.id       is distinct from old.id
  then
    raise exception 'A booking cannot be moved to a different rider or lesson.'
      using errcode = '42501';
  end if;

  -- Cancelling is the only transition a parent has. Notably this blocks
  -- 'cancelled' -> 'booked' (re-booking a released slot behind the barn's back)
  -- and anything -> 'backfilled' (that is the barn's decision, in slice 3b).
  if new.status is distinct from old.status and new.status <> 'cancelled' then
    raise exception 'A family may only cancel a booking. Contact the barn to rebook.'
      using errcode = '42501';
  end if;

  -- Stamp the cancellation so the admin view and the future backfill engine
  -- can tell when the slot was released.
  if new.status = 'cancelled' and new.cancelled_at is null then
    new.cancelled_at := now();
  end if;

  return new;
end;
$$;

comment on function public.lesson_riders_guard_parent_updates() is
  'Restricts parent updates on lesson_riders to cancelling their own rider''s booking.';

drop trigger if exists lesson_riders_guard_parent_updates on public.lesson_riders;

create trigger lesson_riders_guard_parent_updates
  before update on public.lesson_riders
  for each row
  execute function public.lesson_riders_guard_parent_updates();

-- -----------------------------------------------------------------------------
-- Notify the barn when a family cancels.
--
-- In the database rather than the server action so the admin finds out no
-- matter which path released the slot. The CUTOFF decision — whether this
-- cancellation is late enough to skip backfill — deliberately does NOT live
-- here: backfillCutoffMinutes is a per-barn config value, and duplicating it in
-- SQL would give it a second home that a clone would forget to change. The
-- trigger reports the fact and the lesson time; the app applies the policy.
--
-- TODO (slice 3b): the backfill engine hooks in here — on a cancellation
-- outside the cutoff, open the slot and create backfill_offers.
-- TODO (deferred): email mirror via Resend, honouring notification_prefs.
-- -----------------------------------------------------------------------------
create or replace function public.lesson_riders_notify_cancellation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider_name text;
  v_date       date;
  v_start      time;
begin
  -- Only on a genuine transition into 'cancelled', and only when a real user
  -- did it (an admin cancelling on the phone does not need to notify herself).
  if new.status <> 'cancelled' or old.status = 'cancelled' then
    return new;
  end if;

  if (select public."current_role"()) is distinct from 'parent' then
    return new;
  end if;

  select r.name into v_rider_name from public.riders r where r.id = new.rider_id;
  select li.date, li.start_time into v_date, v_start
    from public.lesson_instances li where li.id = new.instance_id;

  insert into public.notifications (profile_id, type, title, body, link_path)
  select p.id,
         'lesson_cancelled',
         coalesce(v_rider_name, 'A rider') || ' cancelled a lesson',
         to_char(v_date, 'Dy DD Mon') || ' at ' || to_char(v_start, 'HH12:MI am'),
         '/schedule'
    from public.profiles p
   where p.role = 'admin';

  return new;
end;
$$;

comment on function public.lesson_riders_notify_cancellation() is
  'Notifies admins when a family cancels a booking. Cutoff policy lives in the app, not here.';

drop trigger if exists lesson_riders_notify_cancellation on public.lesson_riders;

create trigger lesson_riders_notify_cancellation
  after update on public.lesson_riders
  for each row
  execute function public.lesson_riders_notify_cancellation();

-- =============================================================================
-- generate_lesson_instances(through_date, from_date) — materialise the schedule
--
-- Idempotent via the partial unique index plus ON CONFLICT DO NOTHING, so it is
-- safe to run repeatedly and correctly reports 0 when there is nothing new.
--
-- from_date exists because current_date is UTC. For a barn on America/New_York
-- anything after 20:00 local is already tomorrow in UTC, so defaulting the
-- start to current_date would quietly skip the rest of today. The app passes
-- the barn's own calendar date; the default is a fallback for manual SQL use.
--
-- TODO (deferred): a nightly cron should call this. For now the admin triggers
-- it from the Schedule screen.
-- =============================================================================
create or replace function public.generate_lesson_instances(
  through_date date default (current_date + 28),
  from_date    date default current_date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer;
begin
  if (select public."current_role"()) is distinct from 'admin' then
    raise exception 'Only an admin may generate lesson instances.' using errcode = '42501';
  end if;

  if through_date < from_date then
    return 0;
  end if;

  insert into public.lesson_instances
    (template_id, date, start_time, duration_min, type, instructor_id, status)
  select t.id, d::date, t.start_time, t.duration_min, t.type, t.instructor_id, 'scheduled'
    from public.lesson_templates t
    cross join generate_series(from_date::timestamp, through_date::timestamp, interval '1 day') as d
   where t.active
     and extract(isodow from d) = t.weekday
  on conflict (template_id, date) where template_id is not null do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

comment on function public.generate_lesson_instances(date, date) is
  'Materialises lesson_instances from active templates across a date range. Idempotent; admin-only; returns the count created.';

revoke all on function public.generate_lesson_instances(date, date) from public;
grant execute on function public.generate_lesson_instances(date, date) to authenticated;

commit;

-------------------------------------------------------------------------------
-- END 20260728000300_lessons.sql
-------------------------------------------------------------------------------


-------------------------------------------------------------------------------
-- BEGIN 20260728000400_backfill.sql
-------------------------------------------------------------------------------

-- =============================================================================
-- 0008 — backfill engine + lesson reminders (Phase 1, slice 3b)
--
-- When a family cancels, the released seat is offered to eligible riders and
-- the first parent to accept gets it. Everything that decides who gets the seat
-- runs inside the database, because two parents tapping Accept at the same
-- moment is a race, and a race adjudicated in application code is a race with
-- extra steps.
--
-- THREE THINGS IN HERE ARE SUBTLE. Read these before changing anything.
--
--   1. LOCK ORDER (instance first, then offer). Accepting locks the lesson
--      instance and then the offer. Doing it the other way round deadlocks:
--      transaction A holds offer_A and wants the instance; B holds offer_B and
--      wants the instance; whoever wins the instance then tries to expire the
--      other's offer and blocks on a lock the loser is still holding. Locking
--      the instance first makes the whole critical section single-file, so by
--      the time a second accept gets in, it simply finds no seat.
--
--   2. THE GUARD BYPASS. lesson_riders_guard_parent_updates() refuses any
--      parent-driven transition to 'backfilled'. That is correct and must
--      stay — but the engine writes exactly that row while auth.uid() is still
--      the accepting parent, because SECURITY DEFINER changes the executing
--      role, not the JWT. The engine therefore raises a transaction-local flag
--      the guard honours. A parent still cannot reach 'backfilled' directly:
--      the flag is only ever set inside these functions, and set_config lives
--      in pg_catalog, which PostgREST does not expose.
--
--   3. CAPACITY LIVES ON THE INSTANCE, not the template. See the max_riders
--      note below.
--
-- NOT APPLIED BY THIS REPO. Paste into the Supabase SQL Editor. Safe to re-run.
-- =============================================================================

begin;

-- =============================================================================
-- lesson_instances gains the two facts backfill needs to make a decision.
--
-- Both are copied from the template rather than read through it. A template can
-- be paused, edited or deleted after its instances exist — and the FK is
-- ON DELETE SET NULL — so reading capacity or level "through" template_id would
-- make a lesson's own rules change retroactively, or vanish entirely.
--
-- max_riders is not in the slice brief; it is required. "Is there a seat free"
-- is capacity minus active riders, and without it a one-off lesson (which has
-- no template at all) has no capacity to compare against.
-- =============================================================================
alter table public.lesson_instances
  add column if not exists level_id uuid references public.levels (id) on delete set null;

alter table public.lesson_instances
  add column if not exists max_riders integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lesson_instances_max_riders_positive'
  ) then
    alter table public.lesson_instances
      add constraint lesson_instances_max_riders_positive check (max_riders >= 1);
  end if;
end $$;

-- Backfill existing rows from their template. Idempotent: only fills gaps.
update public.lesson_instances li
   set level_id = t.level_id
  from public.lesson_templates t
 where li.template_id = t.id
   and li.level_id is null
   and t.level_id is not null;

update public.lesson_instances li
   set max_riders = t.max_riders
  from public.lesson_templates t
 where li.template_id = t.id
   and li.max_riders is distinct from t.max_riders;

create index if not exists lesson_instances_level_idx on public.lesson_instances (level_id);

comment on column public.lesson_instances.level_id is
  'Eligibility filter for backfill. Null means any level may fill a released seat.';
comment on column public.lesson_instances.max_riders is
  'Seat count for this lesson, copied from the template at generation time.';

-- =============================================================================
-- backfill_offers — "a seat opened, do you want it?"
-- =============================================================================
create table if not exists public.backfill_offers (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  instance_id  uuid not null references public.lesson_instances (id) on delete cascade,
  rider_id     uuid not null references public.riders (id) on delete cascade,
  offered_by   uuid references public.profiles (id) on delete set null,
  status       text not null default 'sent'
                 check (status in ('sent', 'accepted', 'declined', 'expired')),
  responded_at timestamptz
);

alter table public.backfill_offers enable row level security;

-- At most one OUTSTANDING offer per rider per lesson. Partial, so the history
-- of declined and expired offers is kept — re-offering a seat to someone who
-- declined last week is legitimate.
create unique index if not exists backfill_offers_one_outstanding
  on public.backfill_offers (instance_id, rider_id)
  where status = 'sent';

create index if not exists backfill_offers_instance_idx
  on public.backfill_offers (instance_id, status);
create index if not exists backfill_offers_rider_idx
  on public.backfill_offers (rider_id, status);

comment on table public.backfill_offers is
  'Offers of a released lesson seat. Parents respond via respond_to_backfill_offer(), never by writing here.';

-- -----------------------------------------------------------------------------
-- Policies. Parents may READ their own riders' offers so the app can show them;
-- every write goes through the engine, which is why there is no parent
-- insert/update/delete policy at all.
-- -----------------------------------------------------------------------------
drop policy if exists "backfill_offers: read (admin/staff all, parent own riders)" on public.backfill_offers;
create policy "backfill_offers: read (admin/staff all, parent own riders)"
  on public.backfill_offers for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (
      (select public."current_role"()) = 'parent'
      and public.family_owns_rider(rider_id)
    )
  );

drop policy if exists "backfill_offers: admin insert" on public.backfill_offers;
create policy "backfill_offers: admin insert"
  on public.backfill_offers for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "backfill_offers: admin update" on public.backfill_offers;
create policy "backfill_offers: admin update"
  on public.backfill_offers for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "backfill_offers: admin delete" on public.backfill_offers;
create policy "backfill_offers: admin delete"
  on public.backfill_offers for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- The guard bypass (trap 2 in the header).
--
-- Replaces the slice-3a guard, adding one early return. Everything else is
-- unchanged: a parent still may only cancel, still may not move a booking, and
-- still may not set 'backfilled' through the API.
-- =============================================================================
create or replace function public.lesson_riders_guard_parent_updates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  -- Service-role / server-side call; already bypasses RLS.
  if auth.uid() is null then
    return new;
  end if;

  -- The backfill engine is writing. Only the SECURITY DEFINER functions in this
  -- migration ever raise this flag, and they clear it immediately afterwards;
  -- it is transaction-local, so it cannot leak into another request. A client
  -- cannot set it: PostgREST exposes only the `public` schema, and set_config
  -- is in pg_catalog.
  if coalesce(current_setting('app.backfill_engine', true), '') = '1' then
    return new;
  end if;

  v_role := (select public."current_role"());

  if v_role = 'admin' then
    return new;
  end if;

  if v_role is distinct from 'parent' then
    raise exception 'Only an admin or the rider''s own family may change a booking.'
      using errcode = '42501';
  end if;

  if new.instance_id is distinct from old.instance_id
     or new.rider_id is distinct from old.rider_id
     or new.id       is distinct from old.id
  then
    raise exception 'A booking cannot be moved to a different rider or lesson.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status and new.status <> 'cancelled' then
    raise exception 'A family may only cancel a booking. Contact the barn to rebook.'
      using errcode = '42501';
  end if;

  if new.status = 'cancelled' and new.cancelled_at is null then
    new.cancelled_at := now();
  end if;

  return new;
end;
$$;

-- =============================================================================
-- family_sees_instance gains a second reason to say yes.
--
-- Slice 3a only granted a family sight of a lesson one of their riders was
-- already IN. A backfill offer is exactly the case where they are NOT in it
-- yet — so without this, the offer card would arrive with no lesson to show:
-- the parent could read the offer row but not its date, time or instructor.
--
-- Visibility lasts only while the offer is outstanding. Accept and the first
-- branch takes over; decline or let it expire and the lesson goes back to being
-- none of their business.
-- =============================================================================
create or replace function public.family_sees_instance(instance uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.current_family() is not null
    and (
      exists (
        select 1
          from public.lesson_riders lr
          join public.riders r on r.id = lr.rider_id
         where lr.instance_id = instance
           and r.family_id = public.current_family()
      )
      or exists (
        select 1
          from public.backfill_offers o
          join public.riders r on r.id = o.rider_id
         where o.instance_id = instance
           and o.status = 'sent'
           and r.family_id = public.current_family()
      )
    );
$$;

-- =============================================================================
-- Internal helpers
-- =============================================================================

-- Notify every parent of a rider's family.
create or replace function public.notify_rider_family(
  rider uuid, kind text, title text, body text, link_path text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (profile_id, type, title, body, link_path)
  select p.id, kind, title, body, link_path
    from public.riders r
    join public.profiles p on p.family_id = r.family_id and p.role = 'parent'
   where r.id = rider;
$$;

-- Notify every admin.
create or replace function public.notify_admins(
  kind text, title text, body text, link_path text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (profile_id, type, title, body, link_path)
  select p.id, kind, title, body, link_path
    from public.profiles p
   where p.role = 'admin';
$$;

-- Seats currently taken. 'cancelled' rows are not taken; 'booked' and
-- 'backfilled' both are.
create or replace function public.instance_taken_seats(instance uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.lesson_riders lr
   where lr.instance_id = instance
     and lr.status in ('booked', 'backfilled');
$$;

-- Riders who could take a released seat: active, right level, not already in.
create or replace function public.eligible_backfill_riders(instance uuid)
returns table (id uuid, name text, level_id uuid, family_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.name, r.level_id, r.family_id
    from public.riders r
    cross join lateral (
      select li.level_id as instance_level
        from public.lesson_instances li
       where li.id = instance
    ) inst
   where (select public."current_role"()) in ('admin', 'staff')
     and r.active
     -- A lesson with no level set is open to anyone.
     and (inst.instance_level is null or r.level_id = inst.instance_level)
     and not exists (
       select 1 from public.lesson_riders lr
        where lr.instance_id = instance
          and lr.rider_id = r.id
          and lr.status in ('booked', 'backfilled')
     )
   order by r.name;
$$;

comment on function public.eligible_backfill_riders(uuid) is
  'Riders eligible to fill a released seat. Returns nothing unless the caller is admin or staff.';

revoke all on function public.eligible_backfill_riders(uuid) from public;
grant execute on function public.eligible_backfill_riders(uuid) to authenticated;

-- =============================================================================
-- Booking primitive, shared by the accept path and the direct-assign path.
--
-- Upserts so a rider who cancelled and is re-offered the same lesson is
-- restored rather than colliding with their old row. Raises if the lesson is
-- already full, so no caller can overfill by forgetting to check.
--
-- The caller must already hold the instance lock.
-- =============================================================================
create or replace function public.backfill_book_rider(instance uuid, rider uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity integer;
begin
  -- Defence in depth behind the REVOKE below. The grant is the real gate, but a
  -- single stray `grant execute ... to authenticated` during a later migration
  -- would silently reopen "seat any rider in any lesson" to every parent. This
  -- flag is set only by the three authorised entry points, and only after they
  -- have checked the caller, so a direct RPC call arrives without it.
  if coalesce(current_setting('app.backfill_entry', true), '') <> '1' then
    raise exception 'backfill_book_rider() is internal; use the backfill functions.'
      using errcode = '42501';
  end if;

  select li.max_riders into v_capacity
    from public.lesson_instances li where li.id = instance;

  if v_capacity is null then
    raise exception 'That lesson no longer exists.' using errcode = 'P0002';
  end if;

  if public.instance_taken_seats(instance) >= v_capacity then
    raise exception 'That lesson is already full.' using errcode = 'P0001';
  end if;

  -- Trap 2: let the guard know this is the engine, not a parent freelancing.
  perform set_config('app.backfill_engine', '1', true);

  insert into public.lesson_riders (instance_id, rider_id, status, cancelled_at)
  values (instance, rider, 'backfilled', null)
  on conflict (instance_id, rider_id)
  do update set status = 'backfilled', cancelled_at = null;

  perform set_config('app.backfill_engine', '', true);
end;
$$;

-- =============================================================================
-- Lock down the internal primitives.
--
-- PostgREST exposes every function in `public` as an RPC endpoint. Left open,
-- a parent could call backfill_book_rider() directly and seat any rider in any
-- lesson, skipping offers, eligibility and the seat race entirely — the
-- engine's whole purpose, bypassed by one HTTP call.
--
-- REVOKING FROM `public` ALONE IS NOT ENOUGH ON SUPABASE, and this was caught
-- by a test that failed against the live database rather than by reading the
-- code. Postgres grants EXECUTE to PUBLIC by default, but Supabase ALSO ships
-- a default-privileges rule granting ALL on functions to anon, authenticated
-- and service_role. That is a separate, explicit grant which survives a
-- `revoke ... from public`, so the endpoint stayed live and a parent really
-- did seat a rider through it. Both roles must be named.
-- =============================================================================
revoke all on function public.backfill_book_rider(uuid, uuid) from public, anon, authenticated;
revoke all on function public.notify_rider_family(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.notify_admins(text, text, text, text)
  from public, anon, authenticated;

-- Read-only seat count. Harmless to expose and used by the admin UI, so this
-- one stays callable.
grant execute on function public.instance_taken_seats(uuid) to authenticated;

-- =============================================================================
-- send_backfill_offers(instance, rider_ids) — admin only. Returns count sent.
-- =============================================================================
create or replace function public.send_backfill_offers(instance uuid, rider_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sent      integer := 0;
  v_profile   uuid;
  v_date      date;
  v_start     time;
  v_rider     uuid;
begin
  if (select public."current_role"()) is distinct from 'admin' then
    raise exception 'Only an admin may offer a lesson seat.' using errcode = '42501';
  end if;

  select li.date, li.start_time into v_date, v_start
    from public.lesson_instances li where li.id = instance;

  if v_date is null then
    raise exception 'That lesson no longer exists.' using errcode = 'P0002';
  end if;

  v_profile := (select public.current_profile());

  for v_rider in
    select r.id
      from public.riders r
     where r.id = any(rider_ids)
       -- Eligibility is re-checked here, not trusted from the UI.
       and r.id in (select e.id from public.eligible_backfill_riders(instance) e)
  loop
    insert into public.backfill_offers (instance_id, rider_id, offered_by, status)
    values (instance, v_rider, v_profile, 'sent')
    on conflict do nothing;

    if found then
      v_sent := v_sent + 1;
      perform public.notify_rider_family(
        v_rider,
        'backfill_offer',
        'A lesson spot opened up',
        to_char(v_date, 'Dy DD Mon') || ' at ' || to_char(v_start, 'HH12:MI am') ||
          ' — tap to accept or decline.',
        '/lessons'
      );
    end if;
  end loop;

  return v_sent;
end;
$$;

comment on function public.send_backfill_offers(uuid, uuid[]) is
  'Offers a released seat to eligible riders and notifies their families. Admin only; returns the number sent.';

revoke all on function public.send_backfill_offers(uuid, uuid[]) from public;
grant execute on function public.send_backfill_offers(uuid, uuid[]) to authenticated;

-- =============================================================================
-- respond_to_backfill_offer(offer, accept) — the race-safe heart of the slice.
--
-- Returns one of: 'accepted' | 'declined' | 'full' | 'unavailable'.
-- =============================================================================
create or replace function public.respond_to_backfill_offer(offer uuid, accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_instance_id uuid;
  v_offer       public.backfill_offers%rowtype;
  v_capacity    integer;
  v_status      text;
  v_date        date;
  v_start       time;
  v_rider_name  text;
  v_role        text;
  v_expired     integer := 0;
  sibling       record;
begin
  select o.instance_id into v_instance_id
    from public.backfill_offers o where o.id = offer;

  if v_instance_id is null then
    raise exception 'That offer no longer exists.' using errcode = 'P0002';
  end if;

  -- TRAP 1: lock the INSTANCE before the OFFER. Taking these in the other order
  -- deadlocks two simultaneous accepts. See the file header.
  select li.status, li.max_riders, li.date, li.start_time
    into v_status, v_capacity, v_date, v_start
    from public.lesson_instances li
   where li.id = v_instance_id
     for update;

  select * into v_offer
    from public.backfill_offers o
   where o.id = offer
     for update;

  v_role := (select public."current_role"());

  if v_role is distinct from 'admin'
     and not (v_role = 'parent' and public.family_owns_rider(v_offer.rider_id))
  then
    raise exception 'That offer belongs to another family.' using errcode = '42501';
  end if;

  -- Already answered, expired, or superseded. Not an error the parent caused.
  if v_offer.status <> 'sent' then
    return v_offer.status;
  end if;

  select r.name into v_rider_name from public.riders r where r.id = v_offer.rider_id;

  -- ---- decline -------------------------------------------------------------
  if not accept then
    update public.backfill_offers
       set status = 'declined', responded_at = now()
     where id = offer;

    perform public.notify_admins(
      'backfill_result',
      coalesce(v_rider_name, 'A rider') || ' declined a spot',
      to_char(v_date, 'Dy DD Mon') || ' at ' || to_char(v_start, 'HH12:MI am'),
      '/schedule'
    );
    return 'declined';
  end if;

  -- ---- accept --------------------------------------------------------------
  if v_status = 'cancelled' then
    update public.backfill_offers
       set status = 'expired', responded_at = now()
     where id = offer;
    perform public.notify_rider_family(
      v_offer.rider_id, 'backfill_result', 'That lesson was cancelled',
      'The barn cancelled the lesson, so the spot is no longer available.', '/lessons'
    );
    return 'unavailable';
  end if;

  if public.instance_taken_seats(v_instance_id) >= v_capacity then
    update public.backfill_offers
       set status = 'expired', responded_at = now()
     where id = offer;
    perform public.notify_rider_family(
      v_offer.rider_id, 'backfill_result', 'That spot was already taken',
      'Another rider accepted first. We''ll let you know next time one opens.', '/lessons'
    );
    return 'full';
  end if;

  -- Caller is authorised and a seat is free: the engine may book.
  perform set_config('app.backfill_entry', '1', true);
  perform public.backfill_book_rider(v_instance_id, v_offer.rider_id);
  perform set_config('app.backfill_entry', '', true);

  update public.backfill_offers
     set status = 'accepted', responded_at = now()
   where id = offer;

  -- If that was the last seat, nobody else's outstanding offer can be honoured.
  if public.instance_taken_seats(v_instance_id) >= v_capacity then
    for sibling in
      select o.id, o.rider_id
        from public.backfill_offers o
       where o.instance_id = v_instance_id
         and o.status = 'sent'
         and o.id <> offer
    loop
      update public.backfill_offers
         set status = 'expired', responded_at = now()
       where id = sibling.id;

      perform public.notify_rider_family(
        sibling.rider_id, 'backfill_result', 'That spot has been filled',
        'Another rider took the ' || to_char(v_start, 'HH12:MI am') || ' spot on ' ||
          to_char(v_date, 'Dy DD Mon') || '.',
        '/lessons'
      );
      v_expired := v_expired + 1;
    end loop;
  end if;

  perform public.notify_rider_family(
    v_offer.rider_id, 'backfill_result', 'You got the spot',
    to_char(v_date, 'Dy DD Mon') || ' at ' || to_char(v_start, 'HH12:MI am') || ' is confirmed.',
    '/lessons'
  );

  perform public.notify_admins(
    'backfill_result',
    coalesce(v_rider_name, 'A rider') || ' accepted a spot',
    to_char(v_date, 'Dy DD Mon') || ' at ' || to_char(v_start, 'HH12:MI am') ||
      case when v_expired > 0 then ' — ' || v_expired || ' other offer(s) expired.' else '' end,
    '/schedule'
  );

  return 'accepted';
end;
$$;

comment on function public.respond_to_backfill_offer(uuid, boolean) is
  'Accept or decline a backfill offer. First accept wins, enforced by locking the lesson instance. Admin or the owning family only.';

revoke all on function public.respond_to_backfill_offer(uuid, boolean) from public;
grant execute on function public.respond_to_backfill_offer(uuid, boolean) to authenticated;

-- =============================================================================
-- admin_assign_backfill(instance, rider) — skip the offers, just place someone.
-- =============================================================================
create or replace function public.admin_assign_backfill(instance uuid, rider uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity integer;
  v_date     date;
  v_start    time;
  sibling    record;
begin
  if (select public."current_role"()) is distinct from 'admin' then
    raise exception 'Only an admin may assign a lesson seat.' using errcode = '42501';
  end if;

  select li.max_riders, li.date, li.start_time
    into v_capacity, v_date, v_start
    from public.lesson_instances li
   where li.id = instance
     for update;

  if v_capacity is null then
    raise exception 'That lesson no longer exists.' using errcode = 'P0002';
  end if;

  -- Caller is authorised (admin): the engine may book. See backfill_book_rider().
  perform set_config('app.backfill_entry', '1', true);
  perform public.backfill_book_rider(instance, rider);
  perform set_config('app.backfill_entry', '', true);

  update public.backfill_offers
     set status = 'accepted', responded_at = now()
   where instance_id = instance and rider_id = rider and status = 'sent';

  if public.instance_taken_seats(instance) >= v_capacity then
    for sibling in
      select o.id, o.rider_id from public.backfill_offers o
       where o.instance_id = instance and o.status = 'sent'
    loop
      update public.backfill_offers
         set status = 'expired', responded_at = now()
       where id = sibling.id;

      perform public.notify_rider_family(
        sibling.rider_id, 'backfill_result', 'That spot has been filled',
        'The barn filled the ' || to_char(v_start, 'HH12:MI am') || ' spot on ' ||
          to_char(v_date, 'Dy DD Mon') || '.',
        '/lessons'
      );
    end loop;
  end if;

  perform public.notify_rider_family(
    rider, 'backfill_result', 'You have a lesson spot',
    to_char(v_date, 'Dy DD Mon') || ' at ' || to_char(v_start, 'HH12:MI am') || ' is confirmed.',
    '/lessons'
  );

  return 'assigned';
end;
$$;

revoke all on function public.admin_assign_backfill(uuid, uuid) from public;
grant execute on function public.admin_assign_backfill(uuid, uuid) to authenticated;

-- =============================================================================
-- enqueue_lesson_reminders(target_date) — admin only, idempotent.
--
-- Idempotency is by (profile_id, type, link_path): the link carries the
-- instance id, so re-running never sends a family the same reminder twice.
--
-- TODO (deferred): a nightly cron should call this for tomorrow. For now the
-- admin triggers it from the Schedule screen.
-- TODO (deferred): email mirror via Resend, honouring notification_prefs.
-- =============================================================================
create or replace function public.enqueue_lesson_reminders(target_date date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer;
begin
  if (select public."current_role"()) is distinct from 'admin' then
    raise exception 'Only an admin may send lesson reminders.' using errcode = '42501';
  end if;

  insert into public.notifications (profile_id, type, title, body, link_path)
  select p.id,
         'lesson_reminder',
         r.name || ' has a lesson tomorrow',
         to_char(li.date, 'Dy DD Mon') || ' at ' || to_char(li.start_time, 'HH12:MI am'),
         '/lessons?instance=' || li.id
    from public.lesson_instances li
    join public.lesson_riders lr
      on lr.instance_id = li.id and lr.status in ('booked', 'backfilled')
    join public.riders r on r.id = lr.rider_id
    join public.profiles p on p.family_id = r.family_id and p.role = 'parent'
   where li.date = target_date
     and li.status = 'scheduled'
     and not exists (
       select 1 from public.notifications n
        where n.profile_id = p.id
          and n.type = 'lesson_reminder'
          and n.link_path = '/lessons?instance=' || li.id
     );

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

revoke all on function public.enqueue_lesson_reminders(date) from public;
grant execute on function public.enqueue_lesson_reminders(date) to authenticated;

-- =============================================================================
-- generate_lesson_instances — now carries level and capacity onto instances.
-- =============================================================================
create or replace function public.generate_lesson_instances(
  through_date date default (current_date + 28),
  from_date    date default current_date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer;
begin
  if (select public."current_role"()) is distinct from 'admin' then
    raise exception 'Only an admin may generate lesson instances.' using errcode = '42501';
  end if;

  if through_date < from_date then
    return 0;
  end if;

  insert into public.lesson_instances
    (template_id, date, start_time, duration_min, type, instructor_id, status, level_id, max_riders)
  select t.id, d::date, t.start_time, t.duration_min, t.type, t.instructor_id, 'scheduled',
         t.level_id, t.max_riders
    from public.lesson_templates t
    cross join generate_series(from_date::timestamp, through_date::timestamp, interval '1 day') as d
   where t.active
     and extract(isodow from d) = t.weekday
  on conflict (template_id, date) where template_id is not null do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

commit;

-------------------------------------------------------------------------------
-- END 20260728000400_backfill.sql
-------------------------------------------------------------------------------


-------------------------------------------------------------------------------
-- BEGIN 20260728000500_timeclock.sql
-------------------------------------------------------------------------------

-- =============================================================================
-- 0009 — punches + pay_periods + timesheet_approvals (Phase 1, slice 4)
--
-- Staff clock in and out; the barn reviews the week and approves it. This is
-- the table that decides what people get paid, so it is built as an APPEND-ONLY
-- LEDGER, not an editable record.
--
-- THE CENTRAL RULE: a punch is never updated and never deleted, by anybody.
-- There is no UPDATE policy and no DELETE policy on `punches` for any role —
-- not staff, not admin. A mistake is corrected by INSERTING an adjusting row
-- that points at the original (source='admin_adjustment', adjusts_punch_id,
-- note). The original stays. That is what makes the ledger worth trusting when
-- someone disputes their hours six weeks later: nothing that was recorded can
-- quietly stop being true.
--
-- The geofence deliberately does NOT live here. barn.geofence is per-barn
-- config; hard-coding coordinates in SQL would give a clone a second place to
-- change and a silent way to get it wrong. The app decides what is flagged; the
-- database just records lat/lng, or null when the phone declined.
--
-- NOT APPLIED BY THIS REPO WHEN PASTED BY HAND. Idempotent, safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- punches — the ledger.
-- -----------------------------------------------------------------------------
create table if not exists public.punches (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  direction        text not null check (direction in ('in', 'out')),
  punched_at       timestamptz not null default now(),
  -- Null when the phone refused location. Recorded, never required: a punch
  -- must never fail because someone denied GPS, it is only flagged.
  lat              numeric,
  lng              numeric,
  source           text not null default 'self' check (source in ('self', 'admin_adjustment')),
  adjusts_punch_id uuid references public.punches (id) on delete set null,
  note             text not null default '',
  -- An adjustment says what it is correcting and why; a self punch does
  -- neither. Without this an "adjustment" could appear from nowhere with no
  -- explanation, which is exactly what an audit trail must not allow.
  constraint punches_adjustment_shape check (
    (source = 'admin_adjustment' and adjusts_punch_id is not null and length(btrim(note)) > 0)
    or (source = 'self' and adjusts_punch_id is null)
  )
);

alter table public.punches enable row level security;

create index if not exists punches_profile_time_idx on public.punches (profile_id, punched_at desc);
create index if not exists punches_time_idx on public.punches (punched_at desc);
create index if not exists punches_adjusts_idx on public.punches (adjusts_punch_id);

comment on table public.punches is
  'Append-only time clock ledger. No UPDATE or DELETE policy exists for any role; corrections are new adjusting rows.';

-- -----------------------------------------------------------------------------
-- pay_periods
-- -----------------------------------------------------------------------------
create table if not exists public.pay_periods (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  start_date date not null,
  end_date   date not null,
  status     text not null default 'open' check (status in ('open', 'approved', 'synced')),
  constraint pay_periods_dates_ordered check (end_date >= start_date),
  constraint pay_periods_unique_span unique (start_date, end_date)
);

alter table public.pay_periods enable row level security;

create index if not exists pay_periods_status_idx on public.pay_periods (status, start_date desc);

-- -----------------------------------------------------------------------------
-- timesheet_approvals — one row per employee per period.
-- -----------------------------------------------------------------------------
create table if not exists public.timesheet_approvals (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  period_id     uuid not null references public.pay_periods (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  total_minutes integer not null default 0 check (total_minutes >= 0),
  approved_by   uuid references public.profiles (id) on delete set null,
  approved_at   timestamptz,
  -- The QuickBooks seam. QBO returns TimeActivity ids on sync; storing them
  -- here is what makes a re-sync update rather than duplicate. Nothing writes
  -- it yet — the API integration is deferred.
  external_ref  jsonb,
  constraint timesheet_approvals_one_per_person_per_period unique (period_id, profile_id)
);

alter table public.timesheet_approvals enable row level security;

create index if not exists timesheet_approvals_profile_idx
  on public.timesheet_approvals (profile_id, period_id);

comment on column public.timesheet_approvals.external_ref is
  'QuickBooks TimeActivity ids, for idempotent re-sync. Deferred; nothing writes this yet.';

-- =============================================================================
-- Policies — punches
--
--   admin  — SELECT all, INSERT corrections only
--   staff  — SELECT own, INSERT own self-punches only
--   parent — nothing
--
-- Note what is absent: no UPDATE, no DELETE, for anyone. That absence is the
-- feature. Adding either later would silently turn an audit trail into a
-- spreadsheet.
-- =============================================================================
drop policy if exists "punches: read (admin all, staff own)" on public.punches;
create policy "punches: read (admin all, staff own)"
  on public.punches for select to authenticated
  using (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'staff'
      and profile_id = (select public.current_profile())
    )
  );

-- Staff may only ever add their own self-punch. The WITH CHECK pins the
-- profile to the caller and the shape to 'self'; the trigger below re-states
-- it, because a WITH CHECK that is edited later would fail open and silently.
drop policy if exists "punches: staff insert own self-punch" on public.punches;
create policy "punches: staff insert own self-punch"
  on public.punches for insert to authenticated
  with check (
    (select public."current_role"()) = 'staff'
    and profile_id = (select public.current_profile())
    and source = 'self'
    and adjusts_punch_id is null
  );

-- Admin may only ever add a correction. An admin who wants to punch for
-- themselves is a staff-shaped action and is not what this policy is for.
drop policy if exists "punches: admin insert correction" on public.punches;
create policy "punches: admin insert correction"
  on public.punches for insert to authenticated
  with check (
    (select public."current_role"()) = 'admin'
    and source = 'admin_adjustment'
    and adjusts_punch_id is not null
  );

-- =============================================================================
-- Policies — pay_periods: admin CRUD, staff read (they need to see the span
-- their approved hours belong to).
-- =============================================================================
drop policy if exists "pay_periods: read (admin/staff)" on public.pay_periods;
create policy "pay_periods: read (admin/staff)"
  on public.pay_periods for select to authenticated
  using ((select public."current_role"()) in ('admin', 'staff'));

drop policy if exists "pay_periods: admin insert" on public.pay_periods;
create policy "pay_periods: admin insert"
  on public.pay_periods for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "pay_periods: admin update" on public.pay_periods;
create policy "pay_periods: admin update"
  on public.pay_periods for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "pay_periods: admin delete" on public.pay_periods;
create policy "pay_periods: admin delete"
  on public.pay_periods for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- Policies — timesheet_approvals: admin CRUD, staff read only their own.
-- =============================================================================
drop policy if exists "timesheet_approvals: read (admin all, staff own)" on public.timesheet_approvals;
create policy "timesheet_approvals: read (admin all, staff own)"
  on public.timesheet_approvals for select to authenticated
  using (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'staff'
      and profile_id = (select public.current_profile())
    )
  );

drop policy if exists "timesheet_approvals: admin insert" on public.timesheet_approvals;
create policy "timesheet_approvals: admin insert"
  on public.timesheet_approvals for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "timesheet_approvals: admin update" on public.timesheet_approvals;
create policy "timesheet_approvals: admin update"
  on public.timesheet_approvals for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "timesheet_approvals: admin delete" on public.timesheet_approvals;
create policy "timesheet_approvals: admin delete"
  on public.timesheet_approvals for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- Insert guard.
--
-- Restates the policy rules as a trigger. Two reasons that is not redundant:
-- a WITH CHECK edited later fails open with no noise, and a trigger can say
-- WHY in language the admin reading the logs will understand. It also pins
-- `profile_id` for staff even if a future policy is loosened.
-- =============================================================================
create or replace function public.punches_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role    text;
  v_profile uuid;
begin
  -- Service-role / server-side call; already bypasses RLS.
  if auth.uid() is null then
    return new;
  end if;

  select p.role, p.id into v_role, v_profile
    from public.profiles p where p.user_id = auth.uid();

  if v_role = 'admin' then
    if new.source <> 'admin_adjustment' or new.adjusts_punch_id is null then
      raise exception 'An admin may only add a correction, which must reference the punch it adjusts.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if v_role is distinct from 'staff' then
    raise exception 'Only staff may clock in and out.' using errcode = '42501';
  end if;

  if new.profile_id is distinct from v_profile then
    raise exception 'You can only clock in for yourself.' using errcode = '42501';
  end if;

  if new.source <> 'self' or new.adjusts_punch_id is not null then
    raise exception 'Staff punches are self-recorded; corrections are made by the barn.'
      using errcode = '42501';
  end if;

  -- A self-punch happens NOW, whatever the client says.
  --
  -- Until this, punched_at was whatever the caller supplied. The app sends the
  -- real time, but the app is not the only way in: a staff member with their
  -- own publishable key could POST a punch dated to last Tuesday, or three
  -- hours from now, and the row would be indistinguishable from a real one.
  -- Paid hours must not be client-assertable.
  --
  -- Overwritten rather than rejected, so a few seconds of clock skew or network
  -- latency is not an error the person on the yard has to understand.
  --
  -- Admin adjustments deliberately keep their supplied time: correcting a
  -- forgotten clock-out to 5pm yesterday is the entire point of an adjustment,
  -- and that path is admin-only and carries a mandatory note.
  --
  -- NOTE for a future offline queue: if punches are ever recorded while the
  -- phone has no signal and posted later, this has to become "trust the client
  -- time, but only within a tolerance", or every queued punch lands at sync
  -- time. Not a problem today — nothing queues.
  new.punched_at := now();

  return new;
end;
$$;

comment on function public.punches_guard_insert() is
  'Restates the punches INSERT policies as a trigger, so a loosened WITH CHECK cannot fail open silently.';

drop trigger if exists punches_guard_insert on public.punches;

create trigger punches_guard_insert
  before insert on public.punches
  for each row
  execute function public.punches_guard_insert();

commit;

-------------------------------------------------------------------------------
-- END 20260728000500_timeclock.sql
-------------------------------------------------------------------------------


-------------------------------------------------------------------------------
-- BEGIN 20260728000600_horses.sql
-------------------------------------------------------------------------------

-- =============================================================================
-- 0010 — horses + horse_riders + feed_plans (Phase 2, slice 1)
--
-- The barn's horses, who is allowed to ride them, and what each one is fed.
--
-- THE CENTRAL PROBLEM THIS MIGRATION SOLVES: horse visibility is not a row
-- rule, it is a COLUMN rule, and RLS is row-level only.
--
--   admin / staff        full read on every horse
--   owner family         full read on the horse they own (breed, dob, notes)
--   riding family        BASICS ONLY — name, barn_name, photo. Never breed,
--                        dob or notes, and later never medical or documents
--   unrelated family     nothing
--
-- A single SELECT policy cannot express "these rows, but only these columns".
-- If the riding family's rows were added to the policy, `select *` would hand
-- them every column, and the only thing standing between them and another
-- family's horse's medical history would be the app remembering to ask for
-- fewer columns. App-side column lists are not a security boundary — the anon
-- key lets anyone write their own query.
--
-- So the base table policy stops at the OWNER. The basics tier is served by
-- public.horses_basics(), a SECURITY DEFINER function that physically cannot
-- return breed, dob or notes because they are not in its return type. The
-- projection is the boundary, and it is enforced by the database.
--
-- WHY A FUNCTION RATHER THAN A VIEW: SPEC §6 suggests a view, and a view would
-- work — but a view over an RLS-protected table has to run as its owner
-- (security_invoker off) to see rows the caller cannot, and that is exactly the
-- shape Supabase's Security Advisor flags as `security_definer_view`. A
-- SECURITY DEFINER function with a pinned empty search_path is the same
-- privilege boundary, is the pattern already used throughout this schema, and
-- the Advisor has no lint against it. Same guarantee, clean Advisor.
--
-- Idempotent, safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- horses
--
-- owner_family_id null = barn-owned. `on delete set null` rather than cascade:
-- deleting a family must not delete a horse, and a horse with no owning family
-- IS a barn horse, which is a narrower visibility, not a wider one.
-- -----------------------------------------------------------------------------
create table if not exists public.horses (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  name            text not null,
  barn_name       text,
  owner_family_id uuid references public.families (id) on delete set null,
  photo_url       text,
  breed           text,
  dob             date,
  active          boolean not null default true,
  notes           text
);

alter table public.horses enable row level security;

create index if not exists horses_owner_family_idx on public.horses (owner_family_id);
create index if not exists horses_active_name_idx on public.horses (active, name);

comment on table public.horses is
  'Barn and family-owned horses. Parents read their OWN horse here; the basics tier for a horse their rider rides is served by public.horses_basics(), never by this table.';
comment on column public.horses.owner_family_id is
  'Null = barn-owned. Non-null grants that family full read on this row.';

-- -----------------------------------------------------------------------------
-- horse_riders — who is allowed/assigned to ride which horse.
--
-- This link is what earns a non-owning family the basics tier, so it is a
-- permission edge, not just a convenience. Cascades both ways: the link is
-- meaningless without either end.
-- -----------------------------------------------------------------------------
create table if not exists public.horse_riders (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  horse_id   uuid not null references public.horses (id) on delete cascade,
  rider_id   uuid not null references public.riders (id) on delete cascade,
  constraint horse_riders_unique_pair unique (horse_id, rider_id)
);

alter table public.horse_riders enable row level security;

create index if not exists horse_riders_horse_idx on public.horse_riders (horse_id);
create index if not exists horse_riders_rider_idx on public.horse_riders (rider_id);

comment on table public.horse_riders is
  'Rider ↔ horse assignment. A row here is what makes a non-owning family eligible for the basics tier via horses_basics().';

-- -----------------------------------------------------------------------------
-- feed_plans — the standing feed chart, per horse per meal.
--
-- At most ONE ACTIVE plan per horse per meal (partial unique index). Two active
-- 'am' rows for the same horse would print the horse twice on the morning feed
-- board with two different instructions, which is how a horse gets fed twice or
-- not at all. Superseded plans stay as active=false rather than being deleted,
-- so a feed change six weeks ago is still legible.
-- -----------------------------------------------------------------------------
create table if not exists public.feed_plans (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  horse_id             uuid not null references public.horses (id) on delete cascade,
  meal                 text not null check (meal in ('am', 'lunch', 'pm')),
  description          text not null default '',
  supplements          text not null default '',
  special_instructions text not null default '',
  active               boolean not null default true
);

alter table public.feed_plans enable row level security;

create index if not exists feed_plans_horse_idx on public.feed_plans (horse_id);
create index if not exists feed_plans_board_idx on public.feed_plans (meal) where active;

create unique index if not exists feed_plans_one_active_per_meal
  on public.feed_plans (horse_id, meal) where active;

comment on table public.feed_plans is
  'Standing feed chart. One active row per horse per meal; superseded plans are kept as active=false.';

-- =============================================================================
-- Policy helpers.
--
-- Both answer only about the CALLER'S OWN family: neither takes a family as an
-- argument, so there is no way to ask "does family X own horse Y". They derive
-- the family from auth.uid() via current_family(), which returns null for
-- staff, admin and anon — so for those callers both helpers are simply false.
--
-- These are policy helpers: an RLS policy's expression is evaluated as the
-- querying user, so a user who cannot EXECUTE them would be denied everything.
-- They therefore stay callable by `authenticated` and are allowlisted in the
-- suite's EXPOSED_BY_DESIGN, exactly like family_owns_rider() before them.
-- Calling them signed-out returns false, which is the same thing anon learns
-- from being denied.
-- =============================================================================

-- Does the calling family OWN this horse?
create or replace function public.family_owns_horse(horse uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.horses h
     where h.id = horse
       and h.owner_family_id is not distinct from public.current_family()
       and public.current_family() is not null
  );
$$;

comment on function public.family_owns_horse(uuid) is
  'True when the calling family owns the given horse. Basis of the owner tier: full read on the horse and its feed plans.';

-- Does one of the calling family's riders RIDE this horse?
create or replace function public.family_rides_horse(horse uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.horse_riders hr
      join public.riders r on r.id = hr.rider_id
     where hr.horse_id = horse
       and r.family_id is not distinct from public.current_family()
       and public.current_family() is not null
  );
$$;

comment on function public.family_rides_horse(uuid) is
  'True when a rider of the calling family is assigned to the given horse. Earns the BASICS tier only — never full read.';

-- =============================================================================
-- horses_basics() — the basics tier, and the only route to it.
--
-- Returns name/barn_name/photo for horses the calling family's riders ride but
-- does NOT own. breed, dob and notes are absent from the return type, so no
-- amount of clever querying by the caller can produce them.
--
-- Owned horses are deliberately EXCLUDED: the family already reads those in
-- full from the table, and keeping the two sets disjoint means the parent UI
-- can render "your horses" and "horses your rider rides" without de-duplicating
-- — and makes the test for the basics tier unambiguous about which row it is
-- looking at.
--
-- Inactive horses are excluded; a retired horse is not on anyone's list.
-- =============================================================================
create or replace function public.horses_basics()
returns table (id uuid, name text, barn_name text, photo_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.name, h.barn_name, h.photo_url
    from public.horses h
   where public.current_family() is not null
     and h.active
     and h.owner_family_id is distinct from public.current_family()
     and public.family_rides_horse(h.id)
   order by h.name;
$$;

comment on function public.horses_basics() is
  'Basics tier (name, barn_name, photo) for horses the calling family rides but does not own. The projection IS the column boundary — breed/dob/notes cannot be returned.';

-- Signed-out callers have no family and would get an empty set anyway; taking
-- the grant away means they do not get to ask. `from public` alone is not
-- enough on Supabase — anon and authenticated carry their own default grants.
revoke all on function public.horses_basics() from public, anon;
grant execute on function public.horses_basics() to authenticated;

-- =============================================================================
-- Policies — horses
--
--   select  admin/staff: all. Parent: only a horse their family owns.
--   write   has_permission('manage_horses') — admin implicitly true, and a
--           senior trainer can be granted the flag without becoming an admin
--           (SPEC §4). Staff hold it false by default, so staff cannot write.
--
-- Note what is absent: the riding family is NOT in the select policy. That
-- omission is the column boundary — see the header. Adding them here would
-- quietly hand out breed, dob and notes.
-- =============================================================================
drop policy if exists "horses: read (admin/staff all, owner family own)" on public.horses;
create policy "horses: read (admin/staff all, owner family own)"
  on public.horses for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (
      owner_family_id is not null
      and owner_family_id = (select public.current_family())
    )
  );

drop policy if exists "horses: manage insert" on public.horses;
create policy "horses: manage insert"
  on public.horses for insert to authenticated
  with check ((select public.has_permission('manage_horses')));

drop policy if exists "horses: manage update" on public.horses;
create policy "horses: manage update"
  on public.horses for update to authenticated
  using ((select public.has_permission('manage_horses')))
  with check ((select public.has_permission('manage_horses')));

drop policy if exists "horses: manage delete" on public.horses;
create policy "horses: manage delete"
  on public.horses for delete to authenticated
  using ((select public.has_permission('manage_horses')));

-- =============================================================================
-- Policies — horse_riders
--
-- A parent sees the links belonging to their OWN riders: which horse their
-- child is on is their business. They never see who else rides it — that would
-- name another family's rider.
-- =============================================================================
drop policy if exists "horse_riders: read (admin/staff all, family own riders)" on public.horse_riders;
create policy "horse_riders: read (admin/staff all, family own riders)"
  on public.horse_riders for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (
      (select public."current_role"()) = 'parent'
      and public.family_owns_rider(rider_id)
    )
  );

drop policy if exists "horse_riders: manage insert" on public.horse_riders;
create policy "horse_riders: manage insert"
  on public.horse_riders for insert to authenticated
  with check ((select public.has_permission('manage_horses')));

drop policy if exists "horse_riders: manage update" on public.horse_riders;
create policy "horse_riders: manage update"
  on public.horse_riders for update to authenticated
  using ((select public.has_permission('manage_horses')))
  with check ((select public.has_permission('manage_horses')));

drop policy if exists "horse_riders: manage delete" on public.horse_riders;
create policy "horse_riders: manage delete"
  on public.horse_riders for delete to authenticated
  using ((select public.has_permission('manage_horses')));

-- =============================================================================
-- Policies — feed_plans
--
-- The owning family reads its own horse's feed chart: a boarder paying for
-- feed is entitled to know what the horse is being fed. A riding family is
-- not — feed and supplements shade into medical, and they do not own the horse.
-- =============================================================================
drop policy if exists "feed_plans: read (admin/staff all, owner family own horse)" on public.feed_plans;
create policy "feed_plans: read (admin/staff all, owner family own horse)"
  on public.feed_plans for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (
      (select public."current_role"()) = 'parent'
      and public.family_owns_horse(horse_id)
    )
  );

drop policy if exists "feed_plans: manage insert" on public.feed_plans;
create policy "feed_plans: manage insert"
  on public.feed_plans for insert to authenticated
  with check ((select public.has_permission('manage_horses')));

drop policy if exists "feed_plans: manage update" on public.feed_plans;
create policy "feed_plans: manage update"
  on public.feed_plans for update to authenticated
  using ((select public.has_permission('manage_horses')))
  with check ((select public.has_permission('manage_horses')));

drop policy if exists "feed_plans: manage delete" on public.feed_plans;
create policy "feed_plans: manage delete"
  on public.feed_plans for delete to authenticated
  using ((select public.has_permission('manage_horses')));

commit;

-------------------------------------------------------------------------------
-- END 20260728000600_horses.sql
-------------------------------------------------------------------------------


-------------------------------------------------------------------------------
-- BEGIN 20260728000700_care_events.sql
-------------------------------------------------------------------------------

-- =============================================================================
-- 0011 — care_events (Phase 2, slice 2)
--
-- Every vaccine, Coggins, dental, worming, farrier visit, vet call, medication
-- and wound, per horse, with what is due next.
--
-- THIS IS THE MOST SENSITIVE TABLE IN THE APP. A horse's medical history is
-- the owner's business and the barn's business, and nobody else's. Two rules
-- follow from that, and both are deliberately stricter than the horses table:
--
--   1. THERE IS NO BASICS TIER. A family whose rider merely rides a horse sees
--      ZERO care rows. Not a redacted view, not names-only — nothing. Horse
--      visibility needed a projection function because "some columns" is not
--      expressible as a row policy; care needs no such thing, because the
--      answer is not "fewer columns", it is "no rows". The parent branch of the
--      SELECT policy is family_owns_horse() and must NEVER become
--      family_rides_horse().
--
--   2. STAFF INSERT, AND ONLY INSERT. No UPDATE policy and no DELETE policy for
--      staff, the same append-only discipline as `punches`: a care log that the
--      person who wrote it can quietly rewrite is not a medical record. A
--      correction is made by the barn.
--
-- WHAT IS DELIBERATELY NOT COPIED FROM `punches`: performed_at is NOT pinned to
-- now(). A punch is an assertion about the present and a client-supplied time
-- is a way to invent paid hours; a care event is routinely logged after the
-- fact ("the vet came Tuesday"), so a past date is the normal case, not an
-- attack. `logged_by` IS forced to the caller, because attribution is what
-- makes the record worth anything.
--
-- Idempotent, safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- care_events
-- -----------------------------------------------------------------------------
create table if not exists public.care_events (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  horse_id     uuid not null references public.horses (id) on delete cascade,
  type         text not null check (
                 type in ('vaccine', 'coggins', 'dental', 'deworm',
                          'farrier', 'vet', 'medication', 'wound', 'other')
               ),
  description  text not null default '',
  -- The day the care happened. Routinely in the past; see the header.
  performed_at date not null,
  -- When it next falls due. Null for one-off events (a wound, a vet call).
  due_next     date,
  -- Forced to the caller by the trigger below. Nullable because the seed and
  -- future server-side jobs run without a profile.
  logged_by    uuid references public.profiles (id) on delete set null
);

alter table public.care_events enable row level security;

create index if not exists care_events_horse_time_idx
  on public.care_events (horse_id, performed_at desc);

-- Partial: only rows that HAVE a due date are ever scanned by the due-soon
-- surface, and most of the table eventually will not.
create index if not exists care_events_due_next_idx
  on public.care_events (due_next) where due_next is not null;

comment on table public.care_events is
  'Per-horse care and medical history. Staff may INSERT only; there is no UPDATE or DELETE policy for staff. A family whose rider merely rides the horse sees NOTHING here — no basics tier exists for care.';
comment on column public.care_events.performed_at is
  'The day the care happened — legitimately in the past, so unlike punches.punched_at it is NOT pinned to now().';
comment on column public.care_events.logged_by is
  'Forced to the calling profile by care_events_guard_insert(). Never trust a client-supplied value here.';

-- =============================================================================
-- Insert guard.
--
-- Two jobs:
--   * pin `logged_by` to the caller. "Who logged this medication" is the whole
--     value of the attribution, and a client can put any profile id in the
--     column. Overwritten rather than rejected — the app has no reason to send
--     it, and a mismatch is not something the person on the yard can fix.
--   * restate the insert rule, so a WITH CHECK loosened in a later migration
--     cannot fail open silently. Same reasoning as punches_guard_insert().
--
-- performed_at is deliberately left alone. See the file header.
-- =============================================================================
create or replace function public.care_events_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role    text;
  v_profile uuid;
begin
  -- Service-role / server-side call (the seed, a future cron); already outside
  -- RLS, and has no profile to attribute to.
  if auth.uid() is null then
    return new;
  end if;

  select p.role, p.id into v_role, v_profile
    from public.profiles p where p.user_id = auth.uid();

  if v_role is null or v_role not in ('admin', 'staff') then
    raise exception 'Only the barn may log care for a horse.' using errcode = '42501';
  end if;

  new.logged_by := v_profile;

  return new;
end;
$$;

comment on function public.care_events_guard_insert() is
  'Forces care_events.logged_by to the calling profile and restates the insert rule, so attribution cannot be spoofed and a loosened WITH CHECK cannot fail open.';

drop trigger if exists care_events_guard_insert on public.care_events;

create trigger care_events_guard_insert
  before insert on public.care_events
  for each row
  execute function public.care_events_guard_insert();

-- =============================================================================
-- Policies — care_events
--
--   select  admin/staff: all. Parent: only for a horse their family OWNS.
--   insert  admin and staff — the barn logs care.
--   update  has_permission('manage_horses')
--   delete  has_permission('manage_horses')
--
-- Note what is absent: no UPDATE and no DELETE reachable by a plain staff
-- member, who holds manage_horses false. They log; the barn corrects.
-- =============================================================================
drop policy if exists "care_events: read (admin/staff all, owner family own horse)" on public.care_events;
create policy "care_events: read (admin/staff all, owner family own horse)"
  on public.care_events for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (
      (select public."current_role"()) = 'parent'
      -- OWNS, never rides. Changing this to family_rides_horse() would hand a
      -- riding family another family's horse's medical history.
      and public.family_owns_horse(horse_id)
    )
  );

drop policy if exists "care_events: barn insert" on public.care_events;
create policy "care_events: barn insert"
  on public.care_events for insert to authenticated
  with check ((select public."current_role"()) in ('admin', 'staff'));

drop policy if exists "care_events: manage update" on public.care_events;
create policy "care_events: manage update"
  on public.care_events for update to authenticated
  using ((select public.has_permission('manage_horses')))
  with check ((select public.has_permission('manage_horses')));

drop policy if exists "care_events: manage delete" on public.care_events;
create policy "care_events: manage delete"
  on public.care_events for delete to authenticated
  using ((select public.has_permission('manage_horses')));

-- =============================================================================
-- enqueue_care_due_digest() — admin only, idempotent. Returns rows created.
--
-- Notifies every admin of care falling due in the next 30 days, AND of anything
-- already overdue. Idempotency is by (profile_id, type, link_path), and the
-- link carries the care event id, so re-running never tells an admin the same
-- Coggins is due twice.
--
-- THERE IS NO LOWER BOUND ON due_next, deliberately (amended after review). An
-- item that lapses is the one most worth telling someone about; excluding the
-- past would have meant the digest went quiet at exactly the moment the care
-- became overdue. The screen and the digest now agree on what counts as
-- outstanding.
--
-- THE 30-DAY WINDOW IS ALSO IN THE APP, in lib/care.ts. Two homes for one
-- number is a drift risk and is called out in both places; it is not in
-- config/barn.ts because that file is for barn-specific FACTS (colours,
-- timezone, geofence), not product rules a clone would keep.
--
-- SEMANTICS WORTH KNOWING: idempotency is per care item FOREVER, not per
-- digest cycle — matching enqueue_lesson_reminders(). Once an admin has been
-- told a Coggins is due, they are not told again. That is right for an
-- admin-triggered button and WRONG for the weekly digest SPEC §8 describes:
-- a weekly job on this function goes quiet after the first week. Revisit when
-- the cron lands — most likely by scoping the idempotency key to the week.
--
-- TODO (deferred): the nightly/weekly cron. Admin-triggered for now.
-- TODO (deferred): email mirror via Resend, honouring notification_prefs.
-- =============================================================================
create or replace function public.enqueue_care_due_digest()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer;
begin
  if (select public."current_role"()) is distinct from 'admin' then
    raise exception 'Only an admin may send the care digest.' using errcode = '42501';
  end if;

  insert into public.notifications (profile_id, type, title, body, link_path)
  select p.id,
         'care_due',
         h.name || ' — ' || ce.type || ' due',
         'Due ' || to_char(ce.due_next, 'Dy DD Mon') || '.',
         '/manage/care?event=' || ce.id
    from public.care_events ce
    join public.horses h on h.id = ce.horse_id and h.active
    join public.profiles p on p.role = 'admin'
   where ce.due_next is not null
     -- No lower bound: overdue care is included. See the header.
     and ce.due_next <= current_date + 30
     and not exists (
       select 1 from public.notifications n
        where n.profile_id = p.id
          and n.type = 'care_due'
          and n.link_path = '/manage/care?event=' || ce.id
     );

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

comment on function public.enqueue_care_due_digest() is
  'Notifies admins of care due within 30 days. Idempotent per care item. Admin-gated internally; the cron that should call it is deferred.';

-- Entry point: gated internally on role, so it is granted to authenticated and
-- taken away from everyone else. `from public` alone is not enough on Supabase
-- — anon carries its own default grant.
revoke all on function public.enqueue_care_due_digest() from public, anon;
grant execute on function public.enqueue_care_due_digest() to authenticated;

commit;

-------------------------------------------------------------------------------
-- END 20260728000700_care_events.sql
-------------------------------------------------------------------------------


-------------------------------------------------------------------------------
-- BEGIN 20260729000100_horse_documents.sql
-------------------------------------------------------------------------------

-- =============================================================================
-- 0012 — the `documents` Storage bucket and its policies (Phase 2, slice 3)
--
-- Coggins certificates, registration papers, vet reports, signed waivers. The
-- legal vault.
--
-- TABLE RLS DOES NOT COVER STORAGE (SPEC §6). Storage is its own schema with
-- its own table, `storage.objects`, and its own policies. A bucket left public
-- is readable by anyone with the URL — no session, no policy evaluation, no
-- audit. So:
--
--   * the bucket is created with public = false, and the insert is written as
--     an UPSERT that re-asserts public = false. Re-running this migration is
--     therefore also the fix if anyone ever flips it in the dashboard.
--   * every access decision is a policy on storage.objects, scoped to this
--     bucket by name.
--
-- WHO SEES WHAT — mirrors care_events, not horses:
--
--   admin / staff        everything in the bucket
--   owner family         documents for a horse they OWN, and their own family
--                        folder. Read only.
--   riding family        NOTHING. Documents are medical-sensitive, so this
--                        follows care: family_owns_horse(), NEVER
--                        family_rides_horse().
--   anon                 nothing, and the bucket is private so there is no URL
--                        that bypasses the question.
--
-- PATH CONVENTION IS THE SECURITY BOUNDARY, so it is parsed in one place:
--
--   horse_<uuid>/<filename>    documents about a horse
--   family_<uuid>/<filename>   documents about a family (waivers, forms)
--
-- A path that does not match either shape is readable by the barn only. That
-- is the safe default: an unrecognised path grants nothing to a family.
--
-- Idempotent, safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- The bucket. Private, and re-asserted private on every re-run.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update set public = false;

-- =============================================================================
-- public.family_may_read_document(object_name)
--
-- The whole family-facing access rule, in one function, so the four policies
-- below cannot drift apart from each other.
--
-- Answers only about the CALLER'S OWN family: there is no family argument, and
-- current_family() is null for staff, admin and anon, so for them it is simply
-- false (they are covered by the role branch of the policy instead).
--
-- The uuid is regex-checked BEFORE it is cast. A malformed path would otherwise
-- raise inside a policy, which turns a "no" into a failed query for everyone
-- touching that row.
-- =============================================================================
create or replace function public.family_may_read_document(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_prefix text := split_part(coalesce(object_name, ''), '/', 1);
  v_ref    uuid;
begin
  if public.current_family() is null then
    return false;
  end if;

  -- horse_<uuid>/... — the OWNING family only. Never a riding family: this is
  -- the same boundary as care_events, for the same reason.
  if v_prefix ~ '^horse_[0-9a-fA-F-]{36}$' then
    v_ref := substring(v_prefix from 7)::uuid;
    return public.family_owns_horse(v_ref);
  end if;

  -- family_<uuid>/... — that family only.
  if v_prefix ~ '^family_[0-9a-fA-F-]{36}$' then
    v_ref := substring(v_prefix from 8)::uuid;
    return v_ref = public.current_family();
  end if;

  -- Unrecognised path: the barn can see it, no family can.
  return false;
end;
$$;

comment on function public.family_may_read_document(text) is
  'True when the calling family may read this documents/ object, by path convention (horse_<uuid>/ they own, or family_<uuid>/ that is theirs). Owner-only — a riding family never qualifies.';

-- =============================================================================
-- Policies on storage.objects, scoped to the documents bucket.
--
-- storage.objects already has RLS enabled by Supabase; these add to whatever
-- else is on the table, which is why every one of them is pinned to
-- `bucket_id = 'documents'` — a policy that forgot the bucket would silently
-- widen access to every other bucket in the project.
-- =============================================================================
drop policy if exists "documents: read (barn all, family own scope)" on storage.objects;
create policy "documents: read (barn all, family own scope)"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      (select public."current_role"()) in ('admin', 'staff')
      or (
        (select public."current_role"()) = 'parent'
        and public.family_may_read_document(name)
      )
    )
  );

-- The barn uploads. Families never write to the vault — a document a family
-- can add is a document the barn did not verify.
drop policy if exists "documents: barn insert" on storage.objects;
create policy "documents: barn insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (select public."current_role"()) in ('admin', 'staff')
  );

drop policy if exists "documents: barn update" on storage.objects;
create policy "documents: barn update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'documents'
    and (select public."current_role"()) in ('admin', 'staff')
  )
  with check (
    bucket_id = 'documents'
    and (select public."current_role"()) in ('admin', 'staff')
  );

drop policy if exists "documents: barn delete" on storage.objects;
create policy "documents: barn delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (select public."current_role"()) in ('admin', 'staff')
  );

commit;

-------------------------------------------------------------------------------
-- END 20260729000100_horse_documents.sql
-------------------------------------------------------------------------------


-------------------------------------------------------------------------------
-- BEGIN 20260729000200_onboarding_forms.sql
-------------------------------------------------------------------------------

-- =============================================================================
-- 0013 — form_templates + form_submissions (Phase 2, slice 4)
--
-- Waivers, liability releases, emergency contacts, boarding agreements. The
-- barn defines a template once; each family gets a submission to fill and sign.
--
-- THE PROPERTY THAT MATTERS: a signature must mean something. Everything here
-- exists to stop a submission being marked complete without one, or being
-- edited after it was signed:
--
--   * a parent may only ever touch their OWN family's submissions   (policy)
--   * they may not move a submission to another family, or point it at another
--     template or another family's rider                            (trigger)
--   * status may only go pending -> complete, and only WITH a signature; the
--     signature timestamp is set by the database, never by the client (trigger)
--   * once complete, a parent cannot edit it at all                 (trigger)
--
-- The row policy decides WHICH rows; the trigger decides which CHANGES. Neither
-- is sufficient alone — this is the same split as profiles, tasks and
-- lesson_riders.
--
-- STAFF SEE NOTHING HERE. These are legal and personal documents between the
-- family and the barn owner; an employee has no reason to read them.
--
-- Idempotent, safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- form_templates — the barn's blank forms.
--
-- `schema` is a jsonb array of field definitions, rendered by the app:
--   [{"key":"emergency_contact","label":"Emergency contact","type":"text",
--     "required":true}, ...]
-- Kept as jsonb rather than modelled as columns because the barn will add
-- fields we have not thought of, and a form field is not a schema change.
-- -----------------------------------------------------------------------------
create table if not exists public.form_templates (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  description text not null default '',
  schema      jsonb not null default '[]'::jsonb,
  -- Required forms are the ones a family must complete to be fully onboarded.
  required    boolean not null default true,
  -- 'family' — one per household. 'rider' — one per rider in the household.
  applies_to  text not null default 'family' check (applies_to in ('family', 'rider')),
  active      boolean not null default true,
  constraint form_templates_schema_is_array check (jsonb_typeof(schema) = 'array')
);

alter table public.form_templates enable row level security;

create index if not exists form_templates_active_idx on public.form_templates (active, name);

comment on table public.form_templates is
  'Blank forms the barn asks families to complete. `schema` is a jsonb array of field definitions rendered by the app.';

-- -----------------------------------------------------------------------------
-- form_submissions — one family's answers to one template.
-- -----------------------------------------------------------------------------
create table if not exists public.form_submissions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  template_id uuid not null references public.form_templates (id) on delete cascade,
  family_id   uuid not null references public.families (id) on delete cascade,
  -- Set only for 'rider' templates.
  rider_id    uuid references public.riders (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  signed_name text,
  signed_at   timestamptz,
  status      text not null default 'pending' check (status in ('pending', 'complete')),
  -- The PDF written to the documents vault on completion. Null until then.
  document_path text,
  -- A completed submission carries a signature. Enforced here as well as in the
  -- trigger, so a service-role script cannot create a signature-less "complete"
  -- row either.
  constraint form_submissions_complete_is_signed check (
    status = 'pending'
    or (signed_at is not null and signed_name is not null and length(btrim(signed_name)) > 0)
  ),
  constraint form_submissions_one_per_scope unique nulls not distinct (template_id, family_id, rider_id)
);

alter table public.form_submissions enable row level security;

create index if not exists form_submissions_family_idx on public.form_submissions (family_id, status);
create index if not exists form_submissions_template_idx on public.form_submissions (template_id);

comment on table public.form_submissions is
  'One family''s answers to one template. Parents fill and sign their own; staff see nothing. Completion requires a signature (CHECK + trigger).';
comment on column public.form_submissions.document_path is
  'Path in the private `documents` bucket of the signed PDF. Written server-side on completion.';

-- =============================================================================
-- Guard trigger — which CHANGES a parent may make.
--
-- The policy already restricts which ROWS they can see and update. This decides
-- what a permitted update is allowed to do, which a row policy cannot express.
-- =============================================================================
create or replace function public.form_submissions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role   text;
  v_family uuid;
begin
  -- Service-role / server-side (the seed, the PDF writer); already outside RLS.
  if auth.uid() is null then
    return new;
  end if;

  select p.role, p.family_id into v_role, v_family
    from public.profiles p where p.user_id = auth.uid();

  if v_role = 'admin' then
    return new;
  end if;

  if v_role is distinct from 'parent' then
    raise exception 'Only the family may complete their own forms.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.family_id is distinct from v_family then
      raise exception 'You can only start a form for your own family.' using errcode = '42501';
    end if;
    -- A form starts blank and unsigned, whatever the client says. Without this
    -- a parent could INSERT a row that is already 'complete' and skip the
    -- signature path entirely.
    new.status := 'pending';
    new.signed_at := null;
    new.signed_name := null;
    new.document_path := null;
    return new;
  end if;

  -- UPDATE from here.
  if old.family_id is distinct from v_family then
    raise exception 'That form belongs to another family.' using errcode = '42501';
  end if;

  -- Immutable identity: a family may answer a form, not re-point it at a
  -- different template, a different household, or another family's rider.
  if new.family_id is distinct from old.family_id
     or new.template_id is distinct from old.template_id
     or new.rider_id is distinct from old.rider_id then
    raise exception 'A form cannot be moved to another family, rider or template.'
      using errcode = '42501';
  end if;

  -- Signed means signed. Corrections are the barn's to make.
  if old.status = 'complete' then
    raise exception 'That form is already signed. Ask the barn if it needs changing.'
      using errcode = '42501';
  end if;

  if new.status = 'complete' then
    if new.signed_name is null or length(btrim(new.signed_name)) = 0 then
      raise exception 'Type your name to sign the form.' using errcode = '42501';
    end if;
    -- The signing time is the database's to state, not the client's.
    new.signed_at := now();
  else
    -- Still in progress: no signature may be recorded.
    new.signed_at := null;
    new.signed_name := null;
  end if;

  -- The PDF path is written server-side after signing, never by the family.
  new.document_path := old.document_path;

  return new;
end;
$$;

comment on function public.form_submissions_guard() is
  'Decides which CHANGES a parent may make to their own submission: identity columns are immutable, completion requires a signature, signed_at is set by the database, and a signed form cannot be edited.';

drop trigger if exists form_submissions_guard on public.form_submissions;

create trigger form_submissions_guard
  before insert or update on public.form_submissions
  for each row
  execute function public.form_submissions_guard();

-- =============================================================================
-- Policies — form_templates
--
--   select  admin, and parents (they have to render the form they are filling)
--   write   admin only
--
-- Staff are absent on purpose.
-- =============================================================================
drop policy if exists "form_templates: read (admin all, parents active)" on public.form_templates;
create policy "form_templates: read (admin all, parents active)"
  on public.form_templates for select to authenticated
  using (
    (select public."current_role"()) = 'admin'
    or ((select public."current_role"()) = 'parent' and active)
  );

drop policy if exists "form_templates: admin insert" on public.form_templates;
create policy "form_templates: admin insert"
  on public.form_templates for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "form_templates: admin update" on public.form_templates;
create policy "form_templates: admin update"
  on public.form_templates for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "form_templates: admin delete" on public.form_templates;
create policy "form_templates: admin delete"
  on public.form_templates for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- Policies — form_submissions
--
--   select  admin all; parent their own family's
--   insert  admin; parent for their own family
--   update  admin; parent for their own family (the trigger decides what a
--           permitted update may actually change)
--   delete  admin only — a family cannot make a signed form disappear
-- =============================================================================
drop policy if exists "form_submissions: read (admin all, parent own family)" on public.form_submissions;
create policy "form_submissions: read (admin all, parent own family)"
  on public.form_submissions for select to authenticated
  using (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'parent'
      and family_id = (select public.current_family())
    )
  );

drop policy if exists "form_submissions: insert (admin, parent own family)" on public.form_submissions;
create policy "form_submissions: insert (admin, parent own family)"
  on public.form_submissions for insert to authenticated
  with check (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'parent'
      and family_id = (select public.current_family())
    )
  );

drop policy if exists "form_submissions: update (admin, parent own family)" on public.form_submissions;
create policy "form_submissions: update (admin, parent own family)"
  on public.form_submissions for update to authenticated
  using (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'parent'
      and family_id = (select public.current_family())
    )
  )
  with check (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'parent'
      and family_id = (select public.current_family())
    )
  );

drop policy if exists "form_submissions: admin delete" on public.form_submissions;
create policy "form_submissions: admin delete"
  on public.form_submissions for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- ensure_family_onboarding(family) — admin only, idempotent. Returns rows made.
--
-- Creates one pending submission per required active template for a family:
-- 'family' templates once, 'rider' templates once per active rider. This is
-- what turns "the barn added a new waiver" into "every family sees it on their
-- checklist" without anyone hand-creating rows.
--
-- Idempotent through the unique constraint on (template_id, family_id,
-- rider_id) — NULLS NOT DISTINCT, so a family-scoped row cannot be duplicated
-- by a null rider_id either.
-- =============================================================================
create or replace function public.ensure_family_onboarding(family uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer;
begin
  if (select public."current_role"()) is distinct from 'admin' then
    raise exception 'Only an admin may set up a family''s onboarding.' using errcode = '42501';
  end if;

  insert into public.form_submissions (template_id, family_id, rider_id)
  select t.id, family, null
    from public.form_templates t
   where t.active and t.required and t.applies_to = 'family'
  union all
  select t.id, family, r.id
    from public.form_templates t
    cross join public.riders r
   where t.active and t.required and t.applies_to = 'rider'
     and r.family_id = family and r.active
  on conflict do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

comment on function public.ensure_family_onboarding(uuid) is
  'Creates the pending submissions a family owes: one per required active family template, one per rider for rider templates. Admin-gated, idempotent.';

revoke all on function public.ensure_family_onboarding(uuid) from public, anon;
grant execute on function public.ensure_family_onboarding(uuid) to authenticated;

commit;

-------------------------------------------------------------------------------
-- END 20260729000200_onboarding_forms.sql
-------------------------------------------------------------------------------


-------------------------------------------------------------------------------
-- BEGIN 20260729000300_events_ical.sql
-------------------------------------------------------------------------------

-- =============================================================================
-- 0014 — events + ical_tokens (Phase 2, slice 5)
--
-- Shows, clinics, farrier and vet days, closures — the things on the barn
-- calendar that are not lessons. Plus the per-user token that lets a family
-- subscribe to their own schedule in Google or Apple Calendar.
--
-- TWO DIFFERENT SECURITY PROBLEMS IN ONE MIGRATION, worth keeping apart:
--
--   `events` is ordinary RLS: admin writes, staff read everything, parents read
--   what is marked visible to everyone. A staff-only event (the vet coming to
--   discuss a lame horse) must not appear on a family's calendar.
--
--   `ical_tokens` is a BEARER CREDENTIAL. Anyone holding the token can read
--   that person's calendar over plain HTTP with no session at all — that is the
--   entire point, because Google Calendar cannot log in. Two consequences:
--
--     * the token is readable ONLY by the person it belongs to. Not by admin,
--       not by staff. A token an employee can read is an employee who can
--       subscribe to a family's schedule forever, and revoking their account
--       would not revoke that.
--     * it must be regenerable, so a leaked URL can be killed. Rotating is an
--       UPDATE of the token column by its owner.
--
-- The feed endpoint itself runs server-side with the service role — it has to,
-- since there is no session — and re-implements the visibility rules in the
-- route handler. That is called out in the route: RLS is not protecting it, so
-- the scoping is the code's job there.
--
-- Idempotent, safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- events
-- -----------------------------------------------------------------------------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  type        text not null default 'other' check (
                type in ('show', 'clinic', 'farrier', 'vet', 'closure', 'other')
              ),
  title       text not null,
  description text not null default '',
  start_at    timestamptz not null,
  end_at      timestamptz,
  location    text not null default '',
  visibility  text not null default 'all' check (visibility in ('all', 'staff')),
  constraint events_ends_after_it_starts check (end_at is null or end_at >= start_at)
);

alter table public.events enable row level security;

create index if not exists events_start_idx on public.events (start_at);
create index if not exists events_visibility_idx on public.events (visibility, start_at);

comment on table public.events is
  'Barn calendar entries that are not lessons. visibility=''staff'' is internal and must never reach a family feed.';

-- -----------------------------------------------------------------------------
-- ical_tokens — one per profile. The token IS the credential.
-- -----------------------------------------------------------------------------
create table if not exists public.ical_tokens (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  token      uuid not null unique default gen_random_uuid(),
  -- Bumped on rotation, so a leaked URL can be shown to have been replaced.
  rotated_at timestamptz
);

alter table public.ical_tokens enable row level security;

create index if not exists ical_tokens_token_idx on public.ical_tokens (token);

comment on table public.ical_tokens is
  'Per-profile calendar subscription token. A BEARER CREDENTIAL: readable only by its owner — never by staff or admin — because holding it grants read access to that person''s schedule with no session.';

-- =============================================================================
-- Policies — events
--
--   select  admin/staff: everything. Parent: visibility='all' only.
--   write   admin, or has_permission('manage_schedule') — the same flag that
--           governs the lesson calendar, since this is the same calendar.
-- =============================================================================
drop policy if exists "events: read (staff all, families public)" on public.events;
create policy "events: read (staff all, families public)"
  on public.events for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (
      (select public."current_role"()) = 'parent'
      and visibility = 'all'
    )
  );

drop policy if exists "events: manage insert" on public.events;
create policy "events: manage insert"
  on public.events for insert to authenticated
  with check ((select public.has_permission('manage_schedule')));

drop policy if exists "events: manage update" on public.events;
create policy "events: manage update"
  on public.events for update to authenticated
  using ((select public.has_permission('manage_schedule')))
  with check ((select public.has_permission('manage_schedule')));

drop policy if exists "events: manage delete" on public.events;
create policy "events: manage delete"
  on public.events for delete to authenticated
  using ((select public.has_permission('manage_schedule')));

-- =============================================================================
-- Policies — ical_tokens: strictly own-row, for everyone.
--
-- There is deliberately NO admin branch on the read policy. An admin who could
-- read a family's token could subscribe to their calendar silently and forever;
-- the barn owner has legitimate access to the same data through the app, and
-- does not need the bearer credential to get it.
-- =============================================================================
drop policy if exists "ical_tokens: read own" on public.ical_tokens;
create policy "ical_tokens: read own"
  on public.ical_tokens for select to authenticated
  using (profile_id = (select public.current_profile()));

drop policy if exists "ical_tokens: create own" on public.ical_tokens;
create policy "ical_tokens: create own"
  on public.ical_tokens for insert to authenticated
  with check (profile_id = (select public.current_profile()));

-- Rotation. The USING half stops someone updating another person's row; the
-- WITH CHECK half stops them re-pointing their own row at another profile.
drop policy if exists "ical_tokens: rotate own" on public.ical_tokens;
create policy "ical_tokens: rotate own"
  on public.ical_tokens for update to authenticated
  using (profile_id = (select public.current_profile()))
  with check (profile_id = (select public.current_profile()));

drop policy if exists "ical_tokens: delete own" on public.ical_tokens;
create policy "ical_tokens: delete own"
  on public.ical_tokens for delete to authenticated
  using (profile_id = (select public.current_profile()));

-- =============================================================================
-- ical_token_guard() — the token is the database's to mint, not the client's.
--
-- Without this, a caller could INSERT their row with a token they chose (say,
-- all zeroes, or one they had already shared) and rotation could set it to a
-- known value. Both are ways to turn an unguessable credential into a guessable
-- one. On insert the column default already generates it; this makes the value
-- unforgeable rather than merely defaulted.
-- =============================================================================
create or replace function public.ical_token_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Service-role / server-side; nothing to attribute or defend against here.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.token := gen_random_uuid();
    new.rotated_at := null;
    return new;
  end if;

  -- UPDATE: the only meaningful change is "give me a new one".
  if new.token is distinct from old.token then
    new.token := gen_random_uuid();
    new.rotated_at := now();
  end if;

  new.profile_id := old.profile_id;

  return new;
end;
$$;

comment on function public.ical_token_guard() is
  'Forces ical_tokens.token to a server-generated uuid on insert and on rotation, so a client can never choose — and therefore never predict or re-use — a calendar credential.';

drop trigger if exists ical_token_guard on public.ical_tokens;

create trigger ical_token_guard
  before insert or update on public.ical_tokens
  for each row
  execute function public.ical_token_guard();

commit;

-------------------------------------------------------------------------------
-- END 20260729000300_events_ical.sql
-------------------------------------------------------------------------------


-------------------------------------------------------------------------------
-- BEGIN 20260729000400_lock_down_definer_grants.sql
-------------------------------------------------------------------------------

-- =============================================================================
-- 0015 — take back the default grants on every SECURITY DEFINER function
--
-- WHY: `npm run db:advisor` (splinter lint 0028) reported that all 26 unrevoked
-- SECURITY DEFINER functions in `public` were EXECUTE-able by `anon`. That is
-- not something anyone wrote — Postgres grants EXECUTE to PUBLIC by default and
-- Supabase ships a *separate* default-privileges grant to `anon` and
-- `authenticated`. Every function we did not explicitly close was open.
--
-- Nothing was exploitable when it was found: the trigger functions are not
-- reachable over PostgREST at all, the admin entry points raise on their own
-- role checks, and the policy helpers return null/false for a caller with no
-- identity. The one real (small) leak was `instance_taken_seats(uuid)`, which
-- handed a seat count to anyone who knew a lesson's uuid.
--
-- "Not currently exploitable" is exactly what was true of backfill_book_rider
-- until it wasn't, and 26 standing warnings is how a real one hides. So this
-- closes the default rather than allowlisting it.
--
-- THE SHAPE: revoke from all three roles by SWEEPING pg_proc, then grant back
-- to `authenticated` by name. Two consequences worth stating:
--
--   * the sweep covers functions added in FUTURE migrations automatically —
--     re-running this file after adding one closes it.
--   * the default for anything new is now CLOSED. A function added later and
--     not named below is executable by nobody but the owner, which is the
--     right way round: forgetting to close something used to be silent,
--     forgetting to open something is a loud, immediate failure.
--
-- Guarded by tests/policies.test.mjs, which now asserts behaviourally that NO
-- definer function in `public` is executable by anon, and by `db:advisor` in
-- the green gate.
--
-- Idempotent, safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Close everything.
--
-- `from public, anon, authenticated` names all three deliberately: revoking
-- from PUBLIC alone does NOT remove Supabase's separate role grants, which is
-- the exact mistake this migration exists to correct.
-- -----------------------------------------------------------------------------
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
     order by p.proname
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      fn.signature
    );
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Re-open exactly what a signed-in session calls.
--
-- POLICY HELPERS — these MUST be executable by `authenticated`, because an RLS
-- policy's expression is evaluated as the querying user; a user who cannot run
-- the helper is denied every table that calls it. They take no role argument
-- and answer only about the caller, so exposing them to a signed-in user
-- reveals nothing that user could not already read.
--
-- They are NOT granted to anon: RLS policies here are all `to authenticated`,
-- so a signed-out request is refused before any helper would run. Anon needs
-- none of them.
-- -----------------------------------------------------------------------------
grant execute on function public."current_role"() to authenticated;
grant execute on function public.current_family() to authenticated;
grant execute on function public.current_profile() to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.family_owns_rider(uuid) to authenticated;
grant execute on function public.family_owns_horse(uuid) to authenticated;
grant execute on function public.family_rides_horse(uuid) to authenticated;
grant execute on function public.family_sees_instance(uuid) to authenticated;
grant execute on function public.family_may_read_document(text) to authenticated;

-- -----------------------------------------------------------------------------
-- ENTRY POINTS — called by the app over RPC, each gated INTERNALLY on the
-- caller's role. The grant lets a signed-in user reach the function; the
-- function itself decides whether they may do the thing.
-- -----------------------------------------------------------------------------
grant execute on function public.generate_tasks_for_date(date) to authenticated;
grant execute on function public.generate_lesson_instances(date, date) to authenticated;
grant execute on function public.send_backfill_offers(uuid, uuid[]) to authenticated;
grant execute on function public.respond_to_backfill_offer(uuid, boolean) to authenticated;
grant execute on function public.admin_assign_backfill(uuid, uuid) to authenticated;
grant execute on function public.enqueue_lesson_reminders(date) to authenticated;
grant execute on function public.enqueue_care_due_digest() to authenticated;
grant execute on function public.ensure_family_onboarding(uuid) to authenticated;
grant execute on function public.eligible_backfill_riders(uuid) to authenticated;
grant execute on function public.instance_taken_seats(uuid) to authenticated;
grant execute on function public.horses_basics() to authenticated;

-- -----------------------------------------------------------------------------
-- DELIBERATELY NOT GRANTED — do not "fix" these by adding a grant:
--
--   backfill_book_rider, notify_rider_family, notify_admins
--     Internal primitives. backfill_book_rider being reachable is the bug this
--     whole discipline exists because of.
--
--   the nine trigger functions (punches_guard_insert, form_submissions_guard,
--   ical_token_guard, care_events_guard_insert, profiles_guard_privileged_columns,
--   tasks_guard_staff_columns, announcements_fan_out_notifications,
--   lesson_riders_guard_parent_updates, lesson_riders_notify_cancellation)
--     Triggers are invoked by the table, not by a caller. They need no grant to
--     fire, and PostgREST cannot call them anyway.
-- -----------------------------------------------------------------------------

commit;

-------------------------------------------------------------------------------
-- END 20260729000400_lock_down_definer_grants.sql
-------------------------------------------------------------------------------


-------------------------------------------------------------------------------
-- BEGIN 20260731000100_at_least_one_admin.sql
-------------------------------------------------------------------------------

-- =============================================================================
-- 0016 — the barn must always have at least one admin
--
-- The Team panel already refuses to demote the last admin in its server action;
-- that stops the ordinary mistake but not two admins demoting each other in the
-- same instant. This closes it at the database, the one place a race can't pass.
-- Fires for everyone, service-role included: we never want zero admins.
--
-- WHY AN ADVISORY LOCK AND NOT JUST A COUNT: under READ COMMITTED (Supabase's
-- default) two concurrent transactions each see the OTHER admin still in place,
-- so both counts return 1 and both demotions commit. Taking the lock serialises
-- them, and because a new statement after the lock takes a fresh snapshot, the
-- second transaction sees the first one's committed demotion and fails.
--
-- Idempotent, safe to re-run.
-- =============================================================================

begin;

create or replace function public.enforce_at_least_one_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admins integer;
begin
  if tg_op = 'DELETE' then
    if old.role is distinct from 'admin' then
      return old;
    end if;
  else
    if old.role is distinct from 'admin' or new.role = 'admin' then
      return new;
    end if;
  end if;

  -- Serialise every admin-removing operation so two cannot race past each other.
  -- Under READ COMMITTED (Supabase default) the count after the lock takes a
  -- fresh snapshot, so the second concurrent demotion sees the first and fails.
  perform pg_advisory_xact_lock(hashtext('crouse.at_least_one_admin'));

  select count(*) into v_admins from public.profiles where role = 'admin';

  if v_admins = 0 then
    raise exception
      'The barn must always have at least one admin. Make someone else an admin first.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function public.enforce_at_least_one_admin() is
  'Refuses any demotion or deletion that would leave zero admins. Advisory-lock serialised so concurrent demotions cannot both slip through.';

-- -----------------------------------------------------------------------------
-- Close the default grants on the function this migration just created.
--
-- NOT OPTIONAL, and not present in the SQL this migration was drafted from.
-- Migration 0015 swept every SECURITY DEFINER function in `public` and revoked
-- EXECUTE from all three roles — but a sweep only covers what existed when it
-- ran. Postgres grants EXECUTE to PUBLIC on every new function, and Supabase
-- ships separate default-privilege grants to `anon` and `authenticated` on top,
-- so this function would have been born open.
--
-- That is not theoretical: `npm run db:advisor` lint
-- 0028_anon_security_definer_function_executable tests
-- has_function_privilege('anon', p.oid, 'EXECUTE') against every prosecdef
-- function in `public`, so omitting this turns the green gate red.
--
-- All three roles are named deliberately: revoking from PUBLIC alone does NOT
-- remove Supabase's role grants. A trigger function needs no grant to fire —
-- the table invokes it, not a caller — so nothing is granted back.
-- -----------------------------------------------------------------------------
revoke all on function public.enforce_at_least_one_admin() from public, anon, authenticated;

drop trigger if exists enforce_at_least_one_admin on public.profiles;

create trigger enforce_at_least_one_admin
  after update or delete on public.profiles
  for each row
  execute function public.enforce_at_least_one_admin();

commit;

-------------------------------------------------------------------------------
-- END 20260731000100_at_least_one_admin.sql
-------------------------------------------------------------------------------

