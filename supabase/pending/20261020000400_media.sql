-- =============================================================================
-- 0027 — media: horse photos, rider photos, announcement images.
--
-- PRINTED FOR AUDIT, NOT APPLIED (2026-10-20). Nothing in the app uploads to
-- these buckets until this is applied and the `media` flag is on.
--
-- CONVENTION (from 0021's show banners): PRIVATE buckets, SIGNED URLs, and the
-- row stores an OBJECT NAME, never a URL. Object names are
-- '<owning row id>/<filename>', and every policy reads that first segment
-- through a definer helper that regex-checks the uuid before casting — a
-- malformed name must answer "no", not raise inside a policy.
-- Every storage policy names its bucket_id: a policy that forgot it would
-- widen every other bucket in the project.
--
-- The legacy horses.photo_url / riders.photo_url columns are left in place and
-- unread once a path is set; dropping them is a later, separate change.
--
-- =============================================================================
-- RIDER PHOTOS — THESE ARE PHOTOGRAPHS OF CHILDREN. VISIBILITY, FOR AUDIT:
-- =============================================================================
--   WHO CAN SEE a rider photo
--     admin                       every rider
--     staff                       every rider — instructors need to know which
--                                 child is in front of them, and staff already
--                                 read every riders row
--     the rider's own client      their own riders only (family_owns_rider)
--     the rider's linked login    that one rider (riders.profile_id, 0026)
--     ANYONE ELSE                 nothing. Not another client whose child rides
--                                 in the same group lesson; not a client who
--                                 shares a horse; not signed-out.
--   WHO CAN UPLOAD / REPLACE / REMOVE
--     admin, and the rider's own client. Staff cannot. The linked login
--     cannot (a working student's photo is her parents' call, via their
--     client account).
--   HOW A CLIENT IS STOPPED FROM READING ANOTHER CLIENT'S PHOTO
--     storage.objects SELECT is allowed only when rider_photo_is_readable(name)
--     is true, which resolves the rider id from the object name and asks
--     family_owns_rider() — the same helper the riders table already trusts.
--     The path cannot be forged into another family: the helper reads the
--     rider row server-side, and the client cannot write riders.photo_path for
--     a rider they do not own (riders UPDATE is admin-only, plus 0026's guard).
--   PROOF IN THE SUITE (lands with this file)
--     control  parent uploads a photo for their own rider, reads it back,
--              and a signed URL for it resolves;
--     control  admin and staff read it;
--     deny     parent2 (the control family) cannot read it — list, download
--              and createSignedUrl all refused — and cannot upload into, or
--              overwrite, or delete under, the parent's rider's folder;
--     deny     parent cannot read parent2's rider photo (symmetry);
--     deny     anon reads nothing;
--     deny     a malformed object name ('not-a-uuid/x.jpg') answers no;
--     re-read  after every deny, the object is unchanged (same size, same
--              last-modified).
--
-- WRITING THE PATH. riders.photo_path is set by a definer function,
-- set_rider_photo(rider, path), because a client cannot UPDATE riders: it
-- checks the caller is admin or owns the rider AND that the path lies under
-- that rider's own folder, then writes only that column.
-- =============================================================================

begin;

-- Columns ---------------------------------------------------------------------
alter table public.horses        add column if not exists photo_path text;
alter table public.riders        add column if not exists photo_path text;
alter table public.announcements add column if not exists image_path text;

comment on column public.horses.photo_path is 'Object name in the private horse-photos bucket: <horse_id>/<file>.';
comment on column public.riders.photo_path is 'Object name in the private rider-photos bucket: <rider_id>/<file>. A child''s photo.';
comment on column public.announcements.image_path is 'Object name in the private announcement-images bucket: <announcement_id>/<file>.';

-- Buckets: private, 6 MB, images only ------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('horse-photos',        'horse-photos',        false, 6291456, array['image/jpeg','image/png','image/webp','image/avif']),
  ('rider-photos',        'rider-photos',        false, 6291456, array['image/jpeg','image/png','image/webp','image/avif']),
  ('announcement-images', 'announcement-images', false, 6291456, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Helpers -----------------------------------------------------------------------
create or replace function public.object_owner_id(object_name text)
returns uuid
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part(object_name, '/', 1)::uuid
    else null
  end;
$$;
revoke all on function public.object_owner_id(text) from public, anon, authenticated;
grant execute on function public.object_owner_id(text) to authenticated;

-- Horse photo: the barn, the owning client, and a client whose rider rides it
-- (the same audience as horses_basics(), which already returns the photo).
create or replace function public.horse_photo_is_readable(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.object_owner_id(object_name) is null then false
    when public."current_role"() in ('admin', 'staff') then true
    else public.family_owns_horse(public.object_owner_id(object_name))
      or exists (
        select 1
          from public.horse_riders hr
          join public.riders r on r.id = hr.rider_id
         where hr.horse_id = public.object_owner_id(object_name)
           and r.family_id = public.current_family()
      )
  end;
$$;
revoke all on function public.horse_photo_is_readable(text) from public, anon, authenticated;
grant execute on function public.horse_photo_is_readable(text) to authenticated;

create or replace function public.rider_photo_is_readable(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.object_owner_id(object_name) is null then false
    when public."current_role"() in ('admin', 'staff') then true
    else public.family_owns_rider(public.object_owner_id(object_name))
      or exists (
        select 1 from public.riders r
         where r.id = public.object_owner_id(object_name)
           and r.profile_id is not null
           and r.profile_id = public.current_profile()
      )
  end;
$$;
revoke all on function public.rider_photo_is_readable(text) from public, anon, authenticated;
grant execute on function public.rider_photo_is_readable(text) to authenticated;

create or replace function public.rider_photo_is_writable(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.object_owner_id(object_name) is null then false
    when public."current_role"() = 'admin' then true
    else public."current_role"() = 'parent'
      and public.family_owns_rider(public.object_owner_id(object_name))
  end;
$$;
revoke all on function public.rider_photo_is_writable(text) from public, anon, authenticated;
grant execute on function public.rider_photo_is_writable(text) to authenticated;

-- An announcement image is readable exactly when its announcement row is:
-- the announcements policy already applies the audience rule (staff-only
-- posts never reach a client), so ask it rather than restate it.
create or replace function public.announcement_image_is_readable(object_name text)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if public.object_owner_id(object_name) is null then
    return false;
  end if;
  return exists (
    select 1 from public.announcements a where a.id = public.object_owner_id(object_name)
  );
end;
$$;
-- SECURITY INVOKER on purpose: the exists() runs under the CALLER's RLS, so a
-- staff-only post's image is invisible to a client by the same policy that
-- hides the post. Not a definer function, so it needs no revoke; it is
-- granted so the storage policy can call it.
grant execute on function public.announcement_image_is_readable(text) to authenticated;

-- set_rider_photo — the one way a client records their rider's photo path ------
create or replace function public.set_rider_photo(rider uuid, path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    public."current_role"() = 'admin'
    or (public."current_role"() = 'parent' and public.family_owns_rider(rider))
  ) then
    raise exception 'Only the rider''s own family or an admin may set this photo.' using errcode = '42501';
  end if;
  if path is not null and public.object_owner_id(path) is distinct from rider then
    raise exception 'That photo is not in this rider''s folder.' using errcode = '22023';
  end if;
  update public.riders set photo_path = path where id = rider;
end;
$$;
revoke all on function public.set_rider_photo(uuid, text) from public, anon, authenticated;
grant execute on function public.set_rider_photo(uuid, text) to authenticated;

-- Storage policies: horse-photos ------------------------------------------------
drop policy if exists "horse-photos: read" on storage.objects;
create policy "horse-photos: read"
  on storage.objects for select to authenticated
  using (bucket_id = 'horse-photos' and public.horse_photo_is_readable(name));

drop policy if exists "horse-photos: manage insert" on storage.objects;
create policy "horse-photos: manage insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'horse-photos' and (select public.has_permission('manage_horses')));

drop policy if exists "horse-photos: manage update" on storage.objects;
create policy "horse-photos: manage update"
  on storage.objects for update to authenticated
  using (bucket_id = 'horse-photos' and (select public.has_permission('manage_horses')))
  with check (bucket_id = 'horse-photos' and (select public.has_permission('manage_horses')));

drop policy if exists "horse-photos: manage delete" on storage.objects;
create policy "horse-photos: manage delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'horse-photos' and (select public.has_permission('manage_horses')));

-- Storage policies: rider-photos ------------------------------------------------
drop policy if exists "rider-photos: read" on storage.objects;
create policy "rider-photos: read"
  on storage.objects for select to authenticated
  using (bucket_id = 'rider-photos' and public.rider_photo_is_readable(name));

drop policy if exists "rider-photos: insert (admin, own client)" on storage.objects;
create policy "rider-photos: insert (admin, own client)"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'rider-photos' and public.rider_photo_is_writable(name));

drop policy if exists "rider-photos: update (admin, own client)" on storage.objects;
create policy "rider-photos: update (admin, own client)"
  on storage.objects for update to authenticated
  using (bucket_id = 'rider-photos' and public.rider_photo_is_writable(name))
  with check (bucket_id = 'rider-photos' and public.rider_photo_is_writable(name));

drop policy if exists "rider-photos: delete (admin, own client)" on storage.objects;
create policy "rider-photos: delete (admin, own client)"
  on storage.objects for delete to authenticated
  using (bucket_id = 'rider-photos' and public.rider_photo_is_writable(name));

-- Storage policies: announcement-images -----------------------------------------
drop policy if exists "announcement-images: read" on storage.objects;
create policy "announcement-images: read"
  on storage.objects for select to authenticated
  using (bucket_id = 'announcement-images' and public.announcement_image_is_readable(name));

drop policy if exists "announcement-images: admin insert" on storage.objects;
create policy "announcement-images: admin insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'announcement-images' and (select public."current_role"()) = 'admin');

drop policy if exists "announcement-images: admin update" on storage.objects;
create policy "announcement-images: admin update"
  on storage.objects for update to authenticated
  using (bucket_id = 'announcement-images' and (select public."current_role"()) = 'admin')
  with check (bucket_id = 'announcement-images' and (select public."current_role"()) = 'admin');

drop policy if exists "announcement-images: admin delete" on storage.objects;
create policy "announcement-images: admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'announcement-images' and (select public."current_role"()) = 'admin');

commit;

-- -----------------------------------------------------------------------------
-- IMAGE AT CREATION (5.6). The create forms for horses, riders and
-- announcements take the file inline. The server action inserts the row,
-- then uploads to '<new id>/<file>' and writes the path in the same request;
-- if the upload fails the row stands and the person is told the photo did not
-- save (the show-banner precedent). No orphan objects: an object is only ever
-- written under an id that already exists.
--
-- ADVISOR NOTE. db:advisor must stay clean: no public bucket, every definer
-- function search_path = '' and revoked from anon. object_owner_id is
-- IMMUTABLE and reads no table, so exposing it to authenticated reveals
-- nothing; it is classified as an entry point in the suite's inventory.
-- -----------------------------------------------------------------------------
