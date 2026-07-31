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
