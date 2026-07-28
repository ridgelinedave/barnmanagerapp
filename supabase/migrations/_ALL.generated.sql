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

