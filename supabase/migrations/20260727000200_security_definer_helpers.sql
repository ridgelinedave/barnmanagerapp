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
