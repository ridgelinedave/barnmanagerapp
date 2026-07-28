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
