-- =============================================================================
-- 0023 — learning modules: learning_modules, learning_lessons, the `learning`
--        video bucket, the visibility helpers and the two reorder functions
--
-- PROPOSED — PRINTED FOR AUDIT, NOT APPLIED. It lives in supabase/proposed/
-- rather than supabase/migrations/ because the policy suite's standing guard
-- parses every file in migrations/ and would expect these functions to exist.
-- On approval: move it to supabase/migrations/, `npm run db:apply -- <file>`,
-- regenerate _ALL, move the two tables and the bucket into db-verify's
-- expected lists, add the suite section, run the gate.
--
-- A MONARCH PRODUCT CAPABILITY, NOT A CROUSE FEATURE (DESIGN-MASTER §8). Every
-- barn gets it and names its own instance — Crouse calls theirs "CE Academy".
-- So nothing here carries a barn's name: not a table, not a column, not the
-- bucket. The label lives in config/barn.ts and nowhere else.
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
-- DRAFTS. A module is `published = false` until the admin says otherwise, so an
-- upload in progress — or a half-written lesson — never reaches a family.
--
-- VIDEO PROVIDER SEAM. A lesson stores (video_provider, video_ref), not a
-- storage path. Today every video is 'supabase' and video_ref is the object
-- name in the private `learning` bucket. The intended home is Cloudflare
-- Stream, where video_ref becomes the Stream video uid. The app resolves a
-- playable URL through ONE function and ONE player component, so moving a
-- lesson is an UPDATE of two columns and moving the barn is a config change.
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
  -- conscious act, not a silent widening (with set null the module would fall
  -- back to... nothing sensible) or a silent loss (cascade).
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
  -- The provider seam. 'supabase': video_ref is an object name in the private
  -- `learning` bucket, and it MUST start with this lesson's module id — that
  -- first path segment is what the storage read policy checks, so a lesson
  -- cannot point at a file under a module the reader is not allowed to see.
  -- 'cloudflare_stream': video_ref is the Stream video uid.
  video_provider   text not null default 'supabase'
                   check (video_provider in ('supabase', 'cloudflare_stream')),
  video_ref        text,
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  constraint learning_lessons_supabase_ref_in_module check (
    video_provider <> 'supabase'
    or video_ref is null
    or video_ref like module_id::text || '/%'
  ),
  constraint learning_lessons_position_unique unique (module_id, position) deferrable initially immediate
);

alter table public.learning_lessons enable row level security;

create index if not exists learning_lessons_module_idx on public.learning_lessons (module_id, position);

comment on table public.learning_lessons is
  'One video plus notes, in a fixed position inside a module. Readable exactly when the module is.';

-- =============================================================================
-- public.learning_module_is_readable(module uuid)
--
-- The ONE place the audience rule lives. Lessons and storage both defer to it,
-- so the three can never disagree about who sees a module.
--
--   admin   every module, drafts included
--   staff   every published module
--   parent  published, and audience 'all' — or audience 'level' with an ACTIVE
--           rider of their own family at that level
--
-- SECURITY DEFINER so the lesson and storage policies can ask about a module
-- without depending on the caller's RLS view of learning_modules or riders —
-- the cross-table policy shape that recurses. It answers only about the
-- caller: the level branch reads current_family(), never an argument.
-- =============================================================================
create or replace function public.learning_module_is_readable(module uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.learning_modules m
     where m.id = module
       and (
         public."current_role"() = 'admin'
         or (
           m.published
           and (
             public."current_role"() = 'staff'
             or (
               public."current_role"() = 'parent'
               and (
                 m.audience = 'all'
                 or (
                   m.audience = 'level'
                   and exists (
                     select 1
                       from public.riders r
                      where r.family_id = public.current_family()
                        and r.active
                        and r.level_id = m.audience_level_id
                   )
                 )
               )
             )
           )
         )
       )
  );
$$;

comment on function public.learning_module_is_readable(uuid) is
  'True when the caller may see the module: admin always; staff when published; parents when published and in its audience.';

-- Born open (0015): all three revoked, then authenticated granted back because
-- RLS policies call it as the querying user.
revoke all on function public.learning_module_is_readable(uuid) from public, anon, authenticated;
grant execute on function public.learning_module_is_readable(uuid) to authenticated;

-- =============================================================================
-- public.learning_object_is_readable(object_name text)
--
-- The bucket equivalent. Object names are '<module_id>/<lesson_id>/<file>'.
-- The uuid is regex-checked BEFORE the cast, as show_banner_is_readable does:
-- a malformed path must be a "no", not an error raised inside a policy.
-- =============================================================================
create or replace function public.learning_object_is_readable(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then public.learning_module_is_readable(split_part(object_name, '/', 1)::uuid)
    else false
  end;
$$;

comment on function public.learning_object_is_readable(text) is
  'True when the caller may read a learning video object, judged by the module id in its first path segment.';

revoke all on function public.learning_object_is_readable(text) from public, anon, authenticated;
grant execute on function public.learning_object_is_readable(text) to authenticated;

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
-- Policies — learning_modules. Read: the helper. Write: admin only.
-- =============================================================================
drop policy if exists "learning_modules: read (audience-scoped)" on public.learning_modules;
create policy "learning_modules: read (audience-scoped)"
  on public.learning_modules for select to authenticated
  using ((select public.learning_module_is_readable(id)));

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

-- =============================================================================
-- Storage — the `learning` bucket. Private, re-asserted on every re-run.
--
-- Members read what their module visibility allows (signed URLs, short-lived);
-- only the admin writes. Every policy pins bucket_id = 'learning': a policy
-- that forgot the bucket would widen access to every other bucket.
--
-- allowed_mime_types is set so the bucket refuses anything that is not a
-- video. file_size_limit is deliberately NOT set here — see the size flag in
-- the printout; it cannot exceed the project-wide limit, and that limit is a
-- dashboard/plan decision, not a migration's.
-- =============================================================================
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('learning', 'learning', false, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update
  set public = false,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "learning: read (module-scoped)" on storage.objects;
create policy "learning: read (module-scoped)"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'learning'
    and (select public.learning_object_is_readable(name))
  );

drop policy if exists "learning: admin insert" on storage.objects;
create policy "learning: admin insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'learning'
    and (select public."current_role"()) = 'admin'
  );

drop policy if exists "learning: admin update" on storage.objects;
create policy "learning: admin update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'learning'
    and (select public."current_role"()) = 'admin'
  )
  with check (
    bucket_id = 'learning'
    and (select public."current_role"()) = 'admin'
  );

drop policy if exists "learning: admin delete" on storage.objects;
create policy "learning: admin delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'learning'
    and (select public."current_role"()) = 'admin'
  );

commit;
