-- =============================================================================
-- 0021 — shows, show_entries, show_results, and the `shows` banner bucket
--
-- The competition hub: which shows the barn is going to, who is entered, when
-- they ride, and how they placed.
--
-- VISIBILITY MIRRORS `events` DELIBERATELY. A show carries the same
-- 'all' | 'staff' switch, checked the same way, because it is the same
-- question — "is this on the family calendar or is it internal?" — and two
-- different answers to one question is how a staff-only entry ends up on a
-- parent's screen.
--
-- THREE TABLES, ONE VISIBILITY DECISION. Entries and results hang off a show,
-- so their readability is the show's readability AND ("it is mine" OR "I am
-- barn staff"). That compound rule is written ONCE, in
-- public.show_is_readable(), rather than copied into six policies where the
-- copies drift. Rider ownership reuses the existing family_owns_rider().
--
-- WHY THE BANNER BUCKET IS PRIVATE. A banner is not secret, but a
-- visibility='staff' show's banner would be reachable by URL from a public
-- bucket, and a public bucket also trips advisor lint 0025
-- (public_bucket_allows_listing) which this project keeps green. Private
-- bucket, signed URLs, same as `documents`.
--
-- Idempotent, safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- shows
-- -----------------------------------------------------------------------------
create table if not exists public.shows (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  location    text not null default '',
  start_date  date not null,
  end_date    date not null,
  description text not null default '',
  -- Object name inside the private `shows` bucket, e.g. '<show_id>/banner.jpg'.
  -- Never a URL: a stored URL goes stale the moment the bucket or CDN changes.
  image_path  text,
  pinned      boolean not null default false,
  visibility  text not null default 'all' check (visibility in ('all', 'staff')),
  constraint shows_ends_after_it_starts check (end_date >= start_date)
);

alter table public.shows enable row level security;

create index if not exists shows_start_idx on public.shows (start_date);
create index if not exists shows_visibility_idx on public.shows (visibility, start_date);
create index if not exists shows_pinned_idx on public.shows (pinned) where pinned;

comment on table public.shows is
  'Competitions the barn attends. visibility=''staff'' is internal and must never reach a family screen — same rule as public.events.';

-- -----------------------------------------------------------------------------
-- show_entries — the roster. Who is going, on what, in which classes, when.
-- -----------------------------------------------------------------------------
create table if not exists public.show_entries (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  show_id    uuid not null references public.shows (id) on delete cascade,
  rider_id   uuid not null references public.riders (id) on delete cascade,
  -- Nullable: an entry is often made before the horse is settled, and a
  -- catch-ride may never get one. on delete set null so retiring a horse does
  -- not erase the fact that the rider went.
  horse_id   uuid references public.horses (id) on delete set null,
  classes    text not null default '',
  ride_time  timestamptz
);

alter table public.show_entries enable row level security;

create index if not exists show_entries_show_idx on public.show_entries (show_id);
create index if not exists show_entries_rider_idx on public.show_entries (rider_id);
create index if not exists show_entries_ride_time_idx on public.show_entries (ride_time);

-- One entry per rider per horse per show. Two indexes rather than one
-- constraint because NULLs are distinct to UNIQUE: without the partial index a
-- rider with no horse assigned could be entered twice and nothing would object.
create unique index if not exists show_entries_one_per_mount
  on public.show_entries (show_id, rider_id, horse_id)
  where horse_id is not null;
create unique index if not exists show_entries_one_per_rider_no_horse
  on public.show_entries (show_id, rider_id)
  where horse_id is null;

comment on table public.show_entries is
  'Show roster. Readable by the barn, and by the family of the rider entered — never by other families.';

-- -----------------------------------------------------------------------------
-- show_results
-- -----------------------------------------------------------------------------
create table if not exists public.show_results (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  show_id    uuid not null references public.shows (id) on delete cascade,
  rider_id   uuid not null references public.riders (id) on delete cascade,
  -- QUOTED, and it has to be: PLACING is a RESERVED word in Postgres (it is
  -- part of the `overlay(string placing string from int)` grammar), so the
  -- bare identifier is a syntax error, not a style choice. Kept as "placing"
  -- rather than renamed because it is the word the sport uses, and this
  -- codebase already quotes one reserved name for the same reason —
  -- public."current_role"(). PostgREST quotes identifiers itself, so the
  -- client stays plain: .select("placing") needs no ceremony. Raw SQL must
  -- quote it.
  --
  -- Nullable: eliminated, retired and withdrawn are real outcomes with no
  -- placing. A 0 would sort as a win.
  "placing"  integer check ("placing" is null or "placing" > 0),
  score      numeric(7, 3),
  class      text not null default ''
);

alter table public.show_results enable row level security;

create index if not exists show_results_show_idx on public.show_results (show_id);
create index if not exists show_results_rider_idx on public.show_results (rider_id);

-- One result per rider per class per show.
create unique index if not exists show_results_one_per_class
  on public.show_results (show_id, rider_id, class);

comment on table public.show_results is
  'Placings and scores. Same read scope as show_entries: the barn, and the rider''s own family.';

-- =============================================================================
-- public.show_is_readable(show uuid)
--
-- "Is this show on my screen at all?" — the one place the visibility rule for
-- shows lives. Admin and staff: always. Parent: only visibility='all'.
--
-- SECURITY DEFINER so the policies below can ask about a show without the
-- caller needing to read public.shows through its own RLS, which would make
-- the entry policies depend on the row-visibility of a second table and is the
-- shape that produces surprising recursion.
-- =============================================================================
create or replace function public.show_is_readable(show uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.shows s
     where s.id = show
       and (
         public."current_role"() in ('admin', 'staff')
         or (public."current_role"() = 'parent' and s.visibility = 'all')
       )
  );
$$;

comment on function public.show_is_readable(uuid) is
  'True when the calling user may see the given show at all. Staff/admin always; parents only for visibility=''all''.';

-- Born open: Postgres grants EXECUTE to PUBLIC by default and Supabase ships
-- separate default grants to anon and authenticated, so all three come off
-- before anything is granted back (see migration 0015).
revoke all on function public.show_is_readable(uuid) from public, anon, authenticated;
grant execute on function public.show_is_readable(uuid) to authenticated;

-- =============================================================================
-- public.show_banner_is_readable(object_name text)
--
-- The bucket equivalent, for storage.objects policies. Object names are
-- '<show_id>/<filename>'.
--
-- The uuid is regex-checked BEFORE it is cast, exactly as
-- family_may_read_document does: a malformed path would otherwise raise inside
-- a policy, and an error in a policy is a failed query rather than a "no".
-- =============================================================================
create or replace function public.show_banner_is_readable(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then public.show_is_readable(split_part(object_name, '/', 1)::uuid)
    else false
  end;
$$;

comment on function public.show_banner_is_readable(text) is
  'True when the caller may read a banner object, based on the show id in its first path segment.';

revoke all on function public.show_banner_is_readable(text) from public, anon, authenticated;
grant execute on function public.show_banner_is_readable(text) to authenticated;

-- =============================================================================
-- Policies — shows
--
--   select  admin/staff: everything. Parent: visibility='all' only.
--   write   has_permission('manage_shows'), which already returns true for
--           admin (helpers migration 0002, SPEC §4) — so this IS "admin OR the
--           flag", written the way every other write policy here is written.
-- =============================================================================
drop policy if exists "shows: read (staff all, families public)" on public.shows;
create policy "shows: read (staff all, families public)"
  on public.shows for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (
      (select public."current_role"()) = 'parent'
      and visibility = 'all'
    )
  );

drop policy if exists "shows: manage insert" on public.shows;
create policy "shows: manage insert"
  on public.shows for insert to authenticated
  with check ((select public.has_permission('manage_shows')));

drop policy if exists "shows: manage update" on public.shows;
create policy "shows: manage update"
  on public.shows for update to authenticated
  using ((select public.has_permission('manage_shows')))
  with check ((select public.has_permission('manage_shows')));

drop policy if exists "shows: manage delete" on public.shows;
create policy "shows: manage delete"
  on public.shows for delete to authenticated
  using ((select public.has_permission('manage_shows')));

-- =============================================================================
-- Policies — show_entries
--
-- Read is the compound rule: the show must be readable, AND you must be barn
-- staff or the rider's own family. Both halves matter — without the first, a
-- family could enumerate the roster of a staff-only show through their own
-- rider; without the second, every family would see every other family's
-- entries on a public show.
-- =============================================================================
drop policy if exists "show_entries: read (barn all, family own riders)" on public.show_entries;
create policy "show_entries: read (barn all, family own riders)"
  on public.show_entries for select to authenticated
  using (
    (select public.show_is_readable(show_id))
    and (
      (select public."current_role"()) in ('admin', 'staff')
      or (select public.family_owns_rider(rider_id))
    )
  );

drop policy if exists "show_entries: manage insert" on public.show_entries;
create policy "show_entries: manage insert"
  on public.show_entries for insert to authenticated
  with check ((select public.has_permission('manage_shows')));

drop policy if exists "show_entries: manage update" on public.show_entries;
create policy "show_entries: manage update"
  on public.show_entries for update to authenticated
  using ((select public.has_permission('manage_shows')))
  with check ((select public.has_permission('manage_shows')));

drop policy if exists "show_entries: manage delete" on public.show_entries;
create policy "show_entries: manage delete"
  on public.show_entries for delete to authenticated
  using ((select public.has_permission('manage_shows')));

-- =============================================================================
-- Policies — show_results (same read scope as entries)
-- =============================================================================
drop policy if exists "show_results: read (barn all, family own riders)" on public.show_results;
create policy "show_results: read (barn all, family own riders)"
  on public.show_results for select to authenticated
  using (
    (select public.show_is_readable(show_id))
    and (
      (select public."current_role"()) in ('admin', 'staff')
      or (select public.family_owns_rider(rider_id))
    )
  );

drop policy if exists "show_results: manage insert" on public.show_results;
create policy "show_results: manage insert"
  on public.show_results for insert to authenticated
  with check ((select public.has_permission('manage_shows')));

drop policy if exists "show_results: manage update" on public.show_results;
create policy "show_results: manage update"
  on public.show_results for update to authenticated
  using ((select public.has_permission('manage_shows')))
  with check ((select public.has_permission('manage_shows')));

drop policy if exists "show_results: manage delete" on public.show_results;
create policy "show_results: manage delete"
  on public.show_results for delete to authenticated
  using ((select public.has_permission('manage_shows')));

-- =============================================================================
-- Storage — the `shows` bucket (banners). Private, re-asserted on every re-run.
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('shows', 'shows', false)
on conflict (id) do update set public = false;

-- Every policy names bucket_id = 'shows'. A policy that forgot the bucket
-- would silently widen access to every other bucket in the project.
drop policy if exists "shows: read (barn all, families visible shows)" on storage.objects;
create policy "shows: read (barn all, families visible shows)"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'shows'
    and (
      (select public."current_role"()) in ('admin', 'staff')
      or (
        (select public."current_role"()) = 'parent'
        and public.show_banner_is_readable(name)
      )
    )
  );

-- The barn uploads banners. Families never write here.
drop policy if exists "shows: manage insert" on storage.objects;
create policy "shows: manage insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'shows'
    and (select public.has_permission('manage_shows'))
  );

drop policy if exists "shows: manage update" on storage.objects;
create policy "shows: manage update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'shows'
    and (select public.has_permission('manage_shows'))
  )
  with check (
    bucket_id = 'shows'
    and (select public.has_permission('manage_shows'))
  );

drop policy if exists "shows: manage delete" on storage.objects;
create policy "shows: manage delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'shows'
    and (select public.has_permission('manage_shows'))
  );

commit;
