-- =============================================================================
-- 0018 — a parent row can never carry a permission flag
--
-- The profiles-table mirror of invites_flags_only_for_staff (migration 0017).
--
-- WHY THIS EXISTS. public.has_permission() short-circuits to true for admin and
-- otherwise reads the flag column WITHOUT checking that the role is staff:
--
--     if v_role = 'admin' then return true; end if;
--     execute format('select coalesce(p.%I, false) ...', perm) into v_granted;
--
-- So a PARENT row carrying manage_horses = true really does hold barn-wide
-- write permission. That was verified against the live database rather than
-- reasoned about — control first: with the flag off, the parent's insert into
-- `horses` was refused; with it on, THE INSERT LANDED. (A first attempt at that
-- probe read the row back with .select() and appeared to disprove it; the
-- read-back fails the SELECT policy for a barn-owned horse, so it was a false
-- negative. Noting it because the same trap will catch the next person.)
--
-- Migration 0017 closed the one path that creates a profile from stored values.
-- This closes the data itself: the unsafe combination can no longer exist, so
-- the quirk in has_permission() has nothing to act on. Structural, not a rule
-- the app has to remember.
--
-- It also guards the demote path. Turning a flagged staff member into a parent
-- would otherwise leave the flags behind on a row where they now grant real
-- access — the same shape of bug as family_id lingering after a promotion,
-- which profiles_family_only_for_parents already prevents. updatePersonRole()
-- clears the flags in the SAME statement as the role change, for the same
-- reason it clears family_id there: two statements would leave a moment the
-- constraint refuses.
--
-- ADMIN IS DELIBERATELY UNCONSTRAINED. An admin holds every permission
-- implicitly, so whatever its flag columns happen to say is irrelevant — they
-- are never read for that role. Constraining them would forbid a harmless
-- state and break the ordinary staff → admin promotion, which does not clear
-- them. Only the one genuinely unsafe combination is forbidden.
--
-- Verified before applying: zero existing parent rows carried a flag.
--
-- Idempotent, safe to re-run.
-- =============================================================================

begin;

alter table public.profiles
  drop constraint if exists profiles_flags_only_for_staff;

-- Parents hold no permission flags. Staff legitimately do; admin holds all of
-- them implicitly via has_permission(), so its stored flags are irrelevant and
-- left unconstrained. This only forbids the one combination that is actually
-- unsafe: a parent carrying a flag, which has_permission() would honour.
alter table public.profiles
  add constraint profiles_flags_only_for_staff check (
    role <> 'parent'
    or (manage_shows = false and manage_schedule = false and manage_horses = false)
  );

commit;
