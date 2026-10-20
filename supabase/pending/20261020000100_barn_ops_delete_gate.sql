-- =============================================================================
-- 0024 — barn ops: DELETE is admin or the manage_horses flag, on all five.
--
-- PRINTED FOR AUDIT, NOT APPLIED (2026-10-20).
--
-- WHY. Every operations table already HAD a delete policy (0022), so nothing
-- here creates a missing one. What was wrong is who they let in:
--
--   supply_items          admin + staff     -> admin or manage_horses
--   blanket_plans         admin + staff     -> admin or manage_horses
--   turnout_plans         admin + staff     -> admin or manage_horses
--   water_sources         admin only        -> admin or manage_horses
--   maintenance_requests  has_permission('manage_horses')   unchanged
--
-- The brief is "delete: admin and the relevant permission flag only". The app
-- now asks exactly that (canManageBarnOps → has_permission('manage_horses')),
-- but until this is applied any staff login can still delete a supply item or
-- a plan over PostgREST, because the policy is the boundary and the button is
-- not. Insert and update are NOT touched: staff log supplies and edit plans.
--
-- has_permission() is the existing SECURITY DEFINER helper (0002): admin is
-- implicitly true; otherwise the named flag; signed-out is false. No new
-- function, so no new grant to revoke.
--
-- SUITE CHANGES THAT LAND WITH IT (tests/policies.test.mjs, barn ops section):
--   positive control  admin deletes a fixture supply item, plan and trough;
--   positive control  a flagged staff login deletes one of each;
--   deny              unflagged staff deletes each → 0 rows, re-read unchanged;
--   deny              parent deletes their own boarder supply item → 0 rows.
--
-- Idempotent: drop-if-exists before every create.
-- =============================================================================

begin;

drop policy if exists "supply_items: barn delete" on public.supply_items;
drop policy if exists "supply_items: manage delete" on public.supply_items;
create policy "supply_items: manage delete"
  on public.supply_items for delete to authenticated
  using ((select public.has_permission('manage_horses')));

drop policy if exists "water_sources: admin delete" on public.water_sources;
drop policy if exists "water_sources: manage delete" on public.water_sources;
create policy "water_sources: manage delete"
  on public.water_sources for delete to authenticated
  using ((select public.has_permission('manage_horses')));

drop policy if exists "blanket_plans: barn delete" on public.blanket_plans;
drop policy if exists "blanket_plans: manage delete" on public.blanket_plans;
create policy "blanket_plans: manage delete"
  on public.blanket_plans for delete to authenticated
  using ((select public.has_permission('manage_horses')));

drop policy if exists "turnout_plans: barn delete" on public.turnout_plans;
drop policy if exists "turnout_plans: manage delete" on public.turnout_plans;
create policy "turnout_plans: manage delete"
  on public.turnout_plans for delete to authenticated
  using ((select public.has_permission('manage_horses')));

-- maintenance_requests: "manage delete" already reads has_permission('manage_horses').

commit;
