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
