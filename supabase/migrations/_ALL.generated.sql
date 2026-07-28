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

