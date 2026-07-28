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

