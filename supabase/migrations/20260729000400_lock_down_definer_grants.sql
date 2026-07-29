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
