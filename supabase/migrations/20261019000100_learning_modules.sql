-- =============================================================================
-- 0023 — learning modules: learning_modules, learning_lessons, the audience
--        rule, and the two reorder functions. Video lives in Cloudflare Stream.
--
-- REVISION 2 (2026-10-19) — PRINTED FOR AUDIT. Supersedes the first draft that
-- was approved and applied earlier the same day. That draft stored video in a
-- Supabase Storage bucket; David's correction: this organisation uses
-- Cloudflare exclusively and Cloudflare Stream is the video provider. So this
-- revision:
--   - stores a PROVIDER and an EXTERNAL VIDEO ID per lesson, never a storage
--     object path;
--   - creates NO storage bucket and no storage policies;
--   - CONVERGES a database that ran the first draft (the block marked
--     CONVERGE): drops its four `learning` storage policies and its storage
--     path helper, renames video_ref -> video_id, replaces the provider CHECK.
--     The empty `learning` bucket itself cannot be removed in SQL — Supabase's
--     protect_buckets_delete trigger refuses it — so it is removed once,
--     through the Storage API, after this is applied. It holds 0 objects.
-- On a fresh database the CONVERGE block is a no-op and the file reads as if
-- the first draft never existed.
--
-- A MONARCH PRODUCT CAPABILITY, NOT A CROUSE FEATURE (DESIGN-MASTER §8). Every
-- barn gets it and names its own instance — Crouse calls theirs "CE Academy".
-- So nothing here carries a barn's name: not a table, not a column. The label
-- lives in config/barn.ts and nowhere else.
--
-- SHAPE. A module holds an ordered list of lessons; a lesson is one video plus
-- text notes.
--
-- AUDIENCE — DECIDED: 'all' (every signed-in member) or 'level' (families with
-- an active rider at one named level). Staff see every published module; admin
-- sees everything, drafts included. Of the four options weighed:
--
--   everyone        YES, the default. This replaces a members' Circle
--                   subscription; "the barn's members" is the audience that
--                   business case is about.
--   a named level   YES. Dressage is taught by level, riders already carry
--                   level_id, and "Second Level work" is how the barn owner
--                   would naturally aim a module. It narrows on a fact the
--                   barn maintains anyway, so it cannot drift on its own.
--   lesson students NO. "A student" has no column — it would have to be
--                   derived from lesson_riders over some window, so a rider who
--                   misses a month would lose a module mid-way through it with
--                   nobody having changed anything. Access that changes without
--                   an edit is the kind RLS should never have.
--   a named family  NO. Content for one family is private coaching material;
--                   the documents vault (0012) already scopes files to a
--                   family, with its own tested policies. A second mechanism
--                   for the same job is how one of them ends up wrong.
-- Adding 'students' later is one CHECK value and one helper branch; nothing
-- here would need to move.
--
-- DRAFTS. A module is `published = false` until the admin says otherwise, so a
-- half-built module never reaches a family.
--
-- VIDEO — CLOUDFLARE STREAM, PRIVATE BY CONSTRUCTION. A lesson stores
-- (video_provider, video_id): the provider is 'cloudflare_stream' and video_id
-- is the Stream video uid (32 hex). Every video is created with
-- requireSignedURLs, so the uid alone plays nothing. A playback token is minted
-- SERVER-SIDE, by the app, only after THIS database has returned the lesson row
-- to the viewer under their own RLS session — i.e. after
-- learning_module_is_readable() said yes. The database decides; then the
-- privileged step (the Stream API call with the account token) runs. No token
-- path exists in SQL, and no Cloudflare credential is stored here.
--
-- ORDERING CANNOT GO AMBIGUOUS. position is UNIQUE per parent, DEFERRABLE so a
-- whole-list rewrite can pass through duplicate values mid-statement, and the
-- only reorder path is a function that takes the COMPLETE new order and writes
-- every position at once. Nothing swaps two rows — the lesson the levels
-- reorder taught (two rows on the same sort value swap to the same place).
--
-- Idempotent, safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- learning_modules
-- -----------------------------------------------------------------------------
create table if not exists public.learning_modules (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  title             text not null check (length(trim(title)) > 0),
  -- The barn's own words. Never generated, never pre-filled with a summary.
  description       text not null default '',
  position          integer not null check (position >= 0),
  published         boolean not null default false,
  audience          text not null default 'all' check (audience in ('all', 'level')),
  -- on delete restrict: deleting a level that a module is aimed at must be a
  -- conscious act, not a silent widening or a silent loss.
  audience_level_id uuid references public.levels (id) on delete restrict,
  constraint learning_modules_level_matches_audience check (
    (audience = 'level') = (audience_level_id is not null)
  ),
  constraint learning_modules_position_unique unique (position) deferrable initially immediate
);

alter table public.learning_modules enable row level security;

create index if not exists learning_modules_level_idx
  on public.learning_modules (audience_level_id) where audience_level_id is not null;

comment on table public.learning_modules is
  'A barn''s learning modules (named per barn in config, e.g. "CE Academy"). Members read published modules in their audience; admin writes.';

-- -----------------------------------------------------------------------------
-- learning_lessons
-- -----------------------------------------------------------------------------
create table if not exists public.learning_lessons (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  module_id        uuid not null references public.learning_modules (id) on delete cascade,
  title            text not null check (length(trim(title)) > 0),
  -- The barn owner writes these herself. Empty until she does.
  notes            text not null default '',
  position         integer not null check (position >= 0),
  -- The provider seam. The CHECKs are added below, by name, so this file can
  -- also replace the first draft's on a database that ran it.
  video_provider   text not null default 'cloudflare_stream',
  -- The provider's own id for the video — for Stream, the video uid. Never a
  -- URL (a URL is minted per viewer, with a token) and never a storage path.
  -- Null while a lesson exists before its video is attached.
  video_id         text,
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  constraint learning_lessons_position_unique unique (module_id, position) deferrable initially immediate
);

alter table public.learning_lessons enable row level security;

create index if not exists learning_lessons_module_idx on public.learning_lessons (module_id, position);

comment on table public.learning_lessons is
  'One video plus notes, in a fixed position inside a module. Readable exactly when the module is. video_id is an external provider id; playback is minted server-side.';

-- -----------------------------------------------------------------------------
-- CONVERGE — a database that ran the first draft of this migration.
-- Every statement is a no-op on a fresh database.
-- -----------------------------------------------------------------------------

-- The first draft's storage policies, and the path helper they called. Policies
-- go first: the function cannot be dropped while a policy depends on it.
drop policy if exists "learning: read (module-scoped)" on storage.objects;
drop policy if exists "learning: admin insert" on storage.objects;
drop policy if exists "learning: admin update" on storage.objects;
drop policy if exists "learning: admin delete" on storage.objects;
drop function if exists public.learning_object_is_readable(text);

-- video_ref -> video_id. No IF EXISTS form of RENAME COLUMN, hence the check.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'learning_lessons' and column_name = 'video_ref'
  ) and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'learning_lessons' and column_name = 'video_id'
  ) then
    alter table public.learning_lessons rename column video_ref to video_id;
  end if;
end;
$$;

-- The first draft allowed 'supabase' and tied a ref to a storage folder.
alter table public.learning_lessons drop constraint if exists learning_lessons_supabase_ref_in_module;
alter table public.learning_lessons drop constraint if exists learning_lessons_video_provider_check;
alter table public.learning_lessons alter column video_provider set default 'cloudflare_stream';

-- -----------------------------------------------------------------------------
-- The provider CHECKs, by name, so re-running replaces rather than duplicates.
--
-- One provider today. Adding another is a new value here and a new branch in
-- the app's one playback resolver — the table does not change shape.
-- -----------------------------------------------------------------------------
alter table public.learning_lessons drop constraint if exists learning_lessons_provider_known;
alter table public.learning_lessons add constraint learning_lessons_provider_known
  check (video_provider in ('cloudflare_stream'));

-- A Stream uid is 32 lowercase hex. Checked so a pasted URL, an iframe snippet
-- or a token can never be stored where the id belongs.
alter table public.learning_lessons drop constraint if exists learning_lessons_stream_id_shape;
alter table public.learning_lessons add constraint learning_lessons_stream_id_shape
  check (video_provider <> 'cloudflare_stream' or video_id is null or video_id ~ '^[0-9a-f]{32}$');

-- =============================================================================
-- public.learning_audience_allows(is_published, for_audience, for_level)
--
-- THE ONE place the audience rule lives, written over a module's own column
-- VALUES rather than by looking the module up.
--
--   admin   every module, drafts included
--   staff   every published module
--   parent  published, and audience 'all' — or audience 'level' with an ACTIVE
--           rider of their own family at that level
--
-- WHY IT TAKES VALUES. The modules SELECT policy must judge a row from the row.
-- An INSERT ... RETURNING (every supabase-js insert with .select()) checks the
-- SELECT policy against the NEW row, and a function in the same statement
-- cannot see a row the statement is still inserting — the first draft looked
-- the module up by id here and every admin insert was refused. Only OTHER
-- tables' policies look a module up by id (learning_module_is_readable).
--
-- SECURITY DEFINER so the level branch reads riders without depending on the
-- caller's RLS view of them. It answers only about the caller: the family
-- comes from current_family(), never from an argument.
-- =============================================================================
create or replace function public.learning_audience_allows(
  is_published boolean,
  for_audience text,
  for_level uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public."current_role"() = 'admin'
      or (
        coalesce(is_published, false)
        and (
          public."current_role"() = 'staff'
          or (
            public."current_role"() = 'parent'
            and (
              for_audience = 'all'
              or (
                for_audience = 'level'
                and exists (
                  select 1
                    from public.riders r
                   where r.family_id = public.current_family()
                     and r.active
                     and r.level_id = for_level
                )
              )
            )
          )
        )
      );
$$;

comment on function public.learning_audience_allows(boolean, text, uuid) is
  'The learning-module audience rule over a module''s own values. The modules SELECT policy uses it directly; learning_module_is_readable wraps it for other tables.';

-- Born open (0015): all three revoked, then authenticated granted back because
-- RLS policies call it as the querying user.
revoke all on function public.learning_audience_allows(boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.learning_audience_allows(boolean, text, uuid) to authenticated;

-- =============================================================================
-- public.learning_module_is_readable(module uuid)
--
-- The same rule, by module id — for the lessons policy, which is on another
-- table and so can look the module up safely. False when the module does not
-- exist. This is the check that gates a playback token: the app mints one only
-- for a lesson row this policy let the viewer read.
-- =============================================================================
create or replace function public.learning_module_is_readable(module uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select public.learning_audience_allows(m.published, m.audience, m.audience_level_id)
        from public.learning_modules m
       where m.id = module
    ),
    false
  );
$$;

comment on function public.learning_module_is_readable(uuid) is
  'True when the caller may see the module: admin always; staff when published; parents when published and in its audience.';

revoke all on function public.learning_module_is_readable(uuid) from public, anon, authenticated;
grant execute on function public.learning_module_is_readable(uuid) to authenticated;

-- =============================================================================
-- Reordering — the only way positions change after insert.
--
-- SECURITY INVOKER, deliberately: the UPDATE runs under the caller's own RLS,
-- so only an admin's call writes anything. The explicit role check is there to
-- turn "updated zero rows" into an error the screen can show, not to grant.
--
-- Each takes the COMPLETE new order. It refuses a list that is missing an id,
-- repeats one, or names one from elsewhere, then writes every position from the
-- array index in ONE statement. The unique constraint is deferred for the
-- transaction so intermediate duplicates are legal and the end state is
-- checked.
-- =============================================================================
create or replace function public.learning_reorder_lessons(module uuid, lesson_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  expected integer;
begin
  if public."current_role"() is distinct from 'admin' then
    raise exception 'Only the barn admin can reorder lessons.' using errcode = '42501';
  end if;

  select count(*) into expected from public.learning_lessons where module_id = module;

  if lesson_ids is null
     or cardinality(lesson_ids) <> expected
     or (select count(distinct x) from unnest(lesson_ids) as x) <> expected
     or exists (
       select 1 from unnest(lesson_ids) as x
        where not exists (
          select 1 from public.learning_lessons l where l.id = x and l.module_id = module
        )
     )
  then
    raise exception 'The new order must list every lesson in this module exactly once.'
      using errcode = '22023';
  end if;

  set constraints public.learning_lessons_position_unique deferred;

  update public.learning_lessons l
     set position = o.ord - 1
    from unnest(lesson_ids) with ordinality as o(id, ord)
   where l.id = o.id;
end;
$$;

comment on function public.learning_reorder_lessons(uuid, uuid[]) is
  'Rewrites every lesson position in a module from a complete ordered list. Admin only (RLS). Never swaps two rows.';

revoke all on function public.learning_reorder_lessons(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.learning_reorder_lessons(uuid, uuid[]) to authenticated;

create or replace function public.learning_reorder_modules(module_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  expected integer;
begin
  if public."current_role"() is distinct from 'admin' then
    raise exception 'Only the barn admin can reorder modules.' using errcode = '42501';
  end if;

  select count(*) into expected from public.learning_modules;

  if module_ids is null
     or cardinality(module_ids) <> expected
     or (select count(distinct x) from unnest(module_ids) as x) <> expected
     or exists (
       select 1 from unnest(module_ids) as x
        where not exists (select 1 from public.learning_modules m where m.id = x)
     )
  then
    raise exception 'The new order must list every module exactly once.' using errcode = '22023';
  end if;

  set constraints public.learning_modules_position_unique deferred;

  update public.learning_modules m
     set position = o.ord - 1
    from unnest(module_ids) with ordinality as o(id, ord)
   where m.id = o.id;
end;
$$;

comment on function public.learning_reorder_modules(uuid[]) is
  'Rewrites every module position from a complete ordered list. Admin only (RLS). Never swaps two rows.';

revoke all on function public.learning_reorder_modules(uuid[]) from public, anon, authenticated;
grant execute on function public.learning_reorder_modules(uuid[]) to authenticated;

-- =============================================================================
-- Policies — learning_modules. Read: the row's own values. Write: admin only.
-- =============================================================================
drop policy if exists "learning_modules: read (audience-scoped)" on public.learning_modules;
create policy "learning_modules: read (audience-scoped)"
  on public.learning_modules for select to authenticated
  using (public.learning_audience_allows(published, audience, audience_level_id));

drop policy if exists "learning_modules: admin insert" on public.learning_modules;
create policy "learning_modules: admin insert"
  on public.learning_modules for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "learning_modules: admin update" on public.learning_modules;
create policy "learning_modules: admin update"
  on public.learning_modules for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "learning_modules: admin delete" on public.learning_modules;
create policy "learning_modules: admin delete"
  on public.learning_modules for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- Policies — learning_lessons. Readable exactly when the module is.
-- =============================================================================
drop policy if exists "learning_lessons: read (module-scoped)" on public.learning_lessons;
create policy "learning_lessons: read (module-scoped)"
  on public.learning_lessons for select to authenticated
  using ((select public.learning_module_is_readable(module_id)));

drop policy if exists "learning_lessons: admin insert" on public.learning_lessons;
create policy "learning_lessons: admin insert"
  on public.learning_lessons for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "learning_lessons: admin update" on public.learning_lessons;
create policy "learning_lessons: admin update"
  on public.learning_lessons for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "learning_lessons: admin delete" on public.learning_lessons;
create policy "learning_lessons: admin delete"
  on public.learning_lessons for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- No storage bucket and no storage.objects policy: video is not in Supabase.

commit;
