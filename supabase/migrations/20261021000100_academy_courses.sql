-- =============================================================================
-- 0028 — the Academy, restructured to Circle's shape:
--        course -> section -> lesson, with categories, enrolment and progress,
--        and course covers in a private bucket.
--
-- PRINTED FOR AUDIT, NOT APPLIED (2026-10-21).
--
-- NAMING — "course" ON SCREEN, `learning_modules` IN THE SCHEMA. The table 0023
-- called a module IS the course. It is not renamed, for the same reason
-- `families` was not renamed to clients (CLAUDE.md): two definer functions,
-- four policies, the Stream seed script, the privacy check, the app and ~40
-- suite assertions name it, a rename buys nothing the barn can see, and a
-- rename-plus-redefine against a live barn has more ways to half-fail. So
-- every new table carries `module_id`, and only user-facing words say course.
--
-- WHAT 0023 KEEPS, UNTOUCHED: the audience rule (learning_audience_allows /
-- learning_module_is_readable, all / named level, drafts admin-only), Stream
-- as the only provider (video_provider + video_id, 32-hex check), signed
-- playback minted server-side for a lesson row RLS returned, notes, and
-- duration_seconds. Nothing in this file reads or writes a Cloudflare value.
--
-- THE MODEL
--   learning_modules           the COURSE. Gains cover_path. Title,
--                              description, audience, published and
--                              position (sort order) are 0023's.
--   learning_sections          NEW. Belong to a course; title, position.
--   learning_lessons           gain section_id (NOT NULL after backfill). A
--                              composite FK (section_id, module_id) makes it
--                              impossible for a lesson's section to belong to
--                              a different course than the lesson.
--   learning_categories        NEW, barn-defined, editable rows. Seeded with
--                              the barn owner's seven.
--   learning_module_categories NEW, many-to-many course <-> category.
--   learning_enrolments        NEW. One login, one course.
--   learning_progress          NEW. One login completes one lesson, stamped.
--
-- PROGRESS IS PER LOGIN, NOT PER RIDER — DECIDED. The person watching is the
-- person signed in. Tracking per rider would mean asking "who is watching?"
-- on every play, and a parent with two children would be guessing. A family
-- that shares one login shares one progress line; a rider old enough to care
-- about their own progress gets their own login (riders.profile_id, 0026),
-- which is the model's existing answer to "this person is separate".
--
-- WHO SEES ENROLMENT AND PROGRESS
--   the viewer       their OWN rows, always: profile_id = current_profile()
--   admin            every row — the barn owner wants to see who is watching
--   anyone else      nothing. Staff see their own only. A client can never
--                    read another client's rows, and cannot write any row
--                    that is not their own (with check on current_profile()).
-- WHAT A VIEWER MAY ENROL IN / COMPLETE: only a course the audience policy
-- already lets them see (learning_module_is_readable), and only a lesson whose
-- course they can see (learning_lesson_is_readable). Enforced in the
-- policies' WITH CHECK, so a hand-built API call cannot enrol in a draft or in
-- another level's course. No UPDATE policy on either: a row is created or
-- deleted (un-enrol, un-complete), never edited.
--
-- ORDERING: whole-list rewrites only, as 0023. learning_reorder_sections
-- rewrites every section of a course; learning_reorder_section rewrites every
-- lesson of a section and may bring lessons IN from another section of the
-- same course (a drag across sections). Positions are UNIQUE per parent and
-- DEFERRABLE, so the rewrite can pass through duplicates mid-statement. The
-- old module-level learning_reorder_lessons is DROPPED — positions are now per
-- section, so its meaning no longer exists. (The suite's function-inventory
-- parser learns to honour `drop function` in the same change that applies
-- this file; until then it would expect the dropped function to be callable.)
--
-- COVERS: bucket `learning-covers`, PRIVATE, created public=false and
-- re-asserted private on every re-run, object names '<module_id>/<file>',
-- every policy pinned to its bucket_id. READABILITY FOLLOWS THE COURSE'S
-- AUDIENCE by the 0027 announcement pattern: a SECURITY INVOKER function asks
-- whether the CALLER can read the course row, so the course's own policy
-- decides and the rule is not restated. A draft's cover is therefore invisible
-- to members by construction.
--
-- THUMBNAILS are Stream's, signed by the app exactly as playback is — no SQL.
-- DURATION comes from Stream once processed; null means "processing" and the
-- app says so. No new column.
--
-- MIGRATING "ADJUSTING STIRRUPS". Every course that has lessons but no
-- section gets ONE section, titled with the course's own title, holding all
-- its lessons in their existing order. Positions carry over unchanged (they
-- were unique per course, so they are unique per section). Nothing is
-- deleted, no lesson id changes, no video id is touched — playback links and
-- notes survive. Run twice, it does nothing the second time.
--
-- Definer functions: search_path = '', fully qualified, three-role revoke,
-- re-granted to authenticated only where a policy or the app must call them.
-- Idempotent throughout.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- learning_modules (the course): a cover
-- -----------------------------------------------------------------------------
alter table public.learning_modules add column if not exists cover_path text;

comment on column public.learning_modules.cover_path is
  'Object name in the private learning-covers bucket: <module_id>/<file>. Readable exactly when the course is.';

-- -----------------------------------------------------------------------------
-- learning_sections
-- -----------------------------------------------------------------------------
create table if not exists public.learning_sections (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  module_id  uuid not null references public.learning_modules (id) on delete cascade,
  title      text not null check (length(trim(title)) > 0),
  position   integer not null check (position >= 0),
  constraint learning_sections_position_unique unique (module_id, position) deferrable initially immediate,
  -- The target of the lessons' composite FK below.
  constraint learning_sections_id_module_unique unique (id, module_id)
);

alter table public.learning_sections enable row level security;

create index if not exists learning_sections_module_idx on public.learning_sections (module_id, position);

comment on table public.learning_sections is
  'A course''s sections, in order. Readable exactly when the course is; admin writes.';

drop policy if exists "learning_sections: read (course-scoped)" on public.learning_sections;
create policy "learning_sections: read (course-scoped)"
  on public.learning_sections for select to authenticated
  using (public.learning_module_is_readable(module_id));

drop policy if exists "learning_sections: admin insert" on public.learning_sections;
create policy "learning_sections: admin insert"
  on public.learning_sections for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "learning_sections: admin update" on public.learning_sections;
create policy "learning_sections: admin update"
  on public.learning_sections for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "learning_sections: admin delete" on public.learning_sections;
create policy "learning_sections: admin delete"
  on public.learning_sections for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- -----------------------------------------------------------------------------
-- learning_lessons: a section, and ordering per section
-- -----------------------------------------------------------------------------
alter table public.learning_lessons add column if not exists section_id uuid;

-- Backfill: one section per course that has lessons and no section yet.
insert into public.learning_sections (module_id, title, position)
select m.id, m.title, 0
  from public.learning_modules m
 where exists (select 1 from public.learning_lessons l where l.module_id = m.id)
   and not exists (select 1 from public.learning_sections s where s.module_id = m.id);

update public.learning_lessons l
   set section_id = s.id
  from public.learning_sections s
 where l.section_id is null
   and s.module_id = l.module_id
   and s.position = (select min(s2.position) from public.learning_sections s2 where s2.module_id = l.module_id);

alter table public.learning_lessons alter column section_id set not null;

-- The section must belong to the lesson's own course. Deleting a section
-- deletes its lessons (the screen confirms, naming the count).
alter table public.learning_lessons drop constraint if exists learning_lessons_section_in_module;
alter table public.learning_lessons add constraint learning_lessons_section_in_module
  foreign key (section_id, module_id)
  references public.learning_sections (id, module_id)
  on delete cascade;

-- Positions are per SECTION now. The per-course uniqueness goes; the
-- per-section one replaces it (positions carry over unchanged, so the
-- backfilled rows already satisfy it).
alter table public.learning_lessons drop constraint if exists learning_lessons_position_unique;
alter table public.learning_lessons drop constraint if exists learning_lessons_section_position_unique;
alter table public.learning_lessons add constraint learning_lessons_section_position_unique
  unique (section_id, position) deferrable initially immediate;

create index if not exists learning_lessons_section_idx on public.learning_lessons (section_id, position);

-- -----------------------------------------------------------------------------
-- learning_lesson_is_readable(lesson) — for the progress policy
-- -----------------------------------------------------------------------------
create or replace function public.learning_lesson_is_readable(lesson uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select public.learning_module_is_readable(l.module_id) from public.learning_lessons l where l.id = lesson),
    false
  );
$$;

comment on function public.learning_lesson_is_readable(uuid) is
  'True when the caller may see the lesson''s course (0023''s audience rule). False when the lesson does not exist.';

revoke all on function public.learning_lesson_is_readable(uuid) from public, anon, authenticated;
grant execute on function public.learning_lesson_is_readable(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Categories (barn-defined) and course <-> category
-- -----------------------------------------------------------------------------
create table if not exists public.learning_categories (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text not null check (length(trim(name)) > 0),
  position   integer not null default 0 check (position >= 0),
  constraint learning_categories_name_unique unique (name)
);

alter table public.learning_categories enable row level security;

comment on table public.learning_categories is
  'The barn''s own course categories (filter chips). Editable rows; every signed-in member reads them; admin writes.';

drop policy if exists "learning_categories: read (members)" on public.learning_categories;
create policy "learning_categories: read (members)"
  on public.learning_categories for select to authenticated
  using (true);

drop policy if exists "learning_categories: admin insert" on public.learning_categories;
create policy "learning_categories: admin insert"
  on public.learning_categories for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "learning_categories: admin update" on public.learning_categories;
create policy "learning_categories: admin update"
  on public.learning_categories for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "learning_categories: admin delete" on public.learning_categories;
create policy "learning_categories: admin delete"
  on public.learning_categories for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- The barn owner's seven, as editable rows. ON CONFLICT DO NOTHING: re-running
-- never resets a name she has edited. (A category she has DELETED would come
-- back on a re-run — see the note at the foot.)
insert into public.learning_categories (name, position) values
  ('Veterinary', 0),
  ('Groundwork', 1),
  ('Dressage', 2),
  ('Horse Care', 3),
  ('Horsemanship', 4),
  ('Riding', 5),
  ('Tack', 6)
on conflict (name) do nothing;

create table if not exists public.learning_module_categories (
  module_id   uuid not null references public.learning_modules (id) on delete cascade,
  category_id uuid not null references public.learning_categories (id) on delete cascade,
  primary key (module_id, category_id)
);

alter table public.learning_module_categories enable row level security;

create index if not exists learning_module_categories_category_idx on public.learning_module_categories (category_id);

drop policy if exists "learning_module_categories: read (course-scoped)" on public.learning_module_categories;
create policy "learning_module_categories: read (course-scoped)"
  on public.learning_module_categories for select to authenticated
  using (public.learning_module_is_readable(module_id));

drop policy if exists "learning_module_categories: admin insert" on public.learning_module_categories;
create policy "learning_module_categories: admin insert"
  on public.learning_module_categories for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "learning_module_categories: admin delete" on public.learning_module_categories;
create policy "learning_module_categories: admin delete"
  on public.learning_module_categories for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- -----------------------------------------------------------------------------
-- Enrolment — the viewer, for themselves, in a course they can see
-- -----------------------------------------------------------------------------
create table if not exists public.learning_enrolments (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  module_id  uuid not null references public.learning_modules (id) on delete cascade,
  profile_id uuid not null default public.current_profile() references public.profiles (id) on delete cascade,
  constraint learning_enrolments_one_per_login unique (module_id, profile_id)
);

alter table public.learning_enrolments enable row level security;

create index if not exists learning_enrolments_profile_idx on public.learning_enrolments (profile_id);

comment on table public.learning_enrolments is
  'A login enrolled in a course. Written by the viewer for themselves only, into a course they can see. Admin reads all.';

drop policy if exists "learning_enrolments: read (own, admin all)" on public.learning_enrolments;
create policy "learning_enrolments: read (own, admin all)"
  on public.learning_enrolments for select to authenticated
  using (
    profile_id = (select public.current_profile())
    or (select public."current_role"()) = 'admin'
  );

drop policy if exists "learning_enrolments: insert own, visible course" on public.learning_enrolments;
create policy "learning_enrolments: insert own, visible course"
  on public.learning_enrolments for insert to authenticated
  with check (
    profile_id = (select public.current_profile())
    and public.learning_module_is_readable(module_id)
  );

drop policy if exists "learning_enrolments: delete own" on public.learning_enrolments;
create policy "learning_enrolments: delete own"
  on public.learning_enrolments for delete to authenticated
  using (profile_id = (select public.current_profile()));

-- -----------------------------------------------------------------------------
-- Progress — the viewer, for themselves, on a lesson they can see
-- -----------------------------------------------------------------------------
create table if not exists public.learning_progress (
  id           uuid primary key default gen_random_uuid(),
  completed_at timestamptz not null default now(),
  lesson_id    uuid not null references public.learning_lessons (id) on delete cascade,
  profile_id   uuid not null default public.current_profile() references public.profiles (id) on delete cascade,
  constraint learning_progress_one_per_login unique (lesson_id, profile_id)
);

alter table public.learning_progress enable row level security;

create index if not exists learning_progress_profile_idx on public.learning_progress (profile_id);

comment on table public.learning_progress is
  'One login completed one lesson, stamped. Per LOGIN, not per rider (see 0028 header). Own rows only; admin reads all.';

drop policy if exists "learning_progress: read (own, admin all)" on public.learning_progress;
create policy "learning_progress: read (own, admin all)"
  on public.learning_progress for select to authenticated
  using (
    profile_id = (select public.current_profile())
    or (select public."current_role"()) = 'admin'
  );

drop policy if exists "learning_progress: insert own, visible lesson" on public.learning_progress;
create policy "learning_progress: insert own, visible lesson"
  on public.learning_progress for insert to authenticated
  with check (
    profile_id = (select public.current_profile())
    and public.learning_lesson_is_readable(lesson_id)
  );

drop policy if exists "learning_progress: delete own" on public.learning_progress;
create policy "learning_progress: delete own"
  on public.learning_progress for delete to authenticated
  using (profile_id = (select public.current_profile()));

-- -----------------------------------------------------------------------------
-- Ordering — whole-list rewrites only
-- -----------------------------------------------------------------------------
drop function if exists public.learning_reorder_lessons(uuid, uuid[]);

create or replace function public.learning_reorder_sections(module uuid, section_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  expected integer;
begin
  if public."current_role"() is distinct from 'admin' then
    raise exception 'Only the barn admin can reorder sections.' using errcode = '42501';
  end if;

  select count(*) into expected from public.learning_sections where module_id = module;

  if section_ids is null
     or cardinality(section_ids) <> expected
     or (select count(distinct x) from unnest(section_ids) as x) <> expected
     or exists (
       select 1 from unnest(section_ids) as x
        where not exists (select 1 from public.learning_sections s where s.id = x and s.module_id = module)
     )
  then
    raise exception 'The new order must list every section in this course exactly once.' using errcode = '22023';
  end if;

  set constraints public.learning_sections_position_unique deferred;

  update public.learning_sections s
     set position = o.ord - 1
    from unnest(section_ids) with ordinality as o(id, ord)
   where s.id = o.id;
end;
$$;

comment on function public.learning_reorder_sections(uuid, uuid[]) is
  'Rewrites every section position in a course from a complete ordered list. Admin only (RLS). Never swaps two rows.';

revoke all on function public.learning_reorder_sections(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.learning_reorder_sections(uuid, uuid[]) to authenticated;

-- The COMPLETE new order of one section. It must contain every lesson
-- currently in the section; it may also contain lessons from ANOTHER section
-- of the same course, which move in (a drag across sections). A lesson from a
-- different course is refused.
create or replace function public.learning_reorder_section(section uuid, lesson_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_module uuid;
begin
  if public."current_role"() is distinct from 'admin' then
    raise exception 'Only the barn admin can reorder lessons.' using errcode = '42501';
  end if;

  select s.module_id into v_module from public.learning_sections s where s.id = section;
  if v_module is null then
    raise exception 'That section does not exist.' using errcode = '22023';
  end if;

  if lesson_ids is null
     or (select count(distinct x) from unnest(lesson_ids) as x) <> cardinality(lesson_ids)
     or exists (
       -- every lesson now in the section must be listed
       select 1 from public.learning_lessons l
        where l.section_id = section and not (l.id = any (lesson_ids))
     )
     or exists (
       -- and every listed lesson must belong to this course
       select 1 from unnest(lesson_ids) as x
        where not exists (select 1 from public.learning_lessons l where l.id = x and l.module_id = v_module)
     )
  then
    raise exception 'The new order must list every lesson in this section exactly once, from this course only.'
      using errcode = '22023';
  end if;

  set constraints public.learning_lessons_section_position_unique deferred;

  update public.learning_lessons l
     set section_id = section,
         position = o.ord - 1
    from unnest(lesson_ids) with ordinality as o(id, ord)
   where l.id = o.id;
end;
$$;

comment on function public.learning_reorder_section(uuid, uuid[]) is
  'Rewrites every lesson position in a section from a complete ordered list, moving lessons in from the same course. Admin only (RLS). Never swaps two rows.';

revoke all on function public.learning_reorder_section(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.learning_reorder_section(uuid, uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- Covers — private bucket, readability follows the course
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('learning-covers', 'learning-covers', false, 6291456,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- SECURITY INVOKER on purpose (the 0027 announcement-image pattern): the
-- exists() runs under the CALLER's RLS on learning_modules, so a draft course
-- or another level's course hides its cover by the same policy that hides the
-- course. Not a definer function, so nothing to revoke; granted so the
-- storage policy can call it as the caller.
create or replace function public.learning_cover_is_readable(object_name text)
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
  return exists (select 1 from public.learning_modules m where m.id = public.object_owner_id(object_name));
end;
$$;

grant execute on function public.learning_cover_is_readable(text) to authenticated;

drop policy if exists "learning-covers: read (course-scoped)" on storage.objects;
create policy "learning-covers: read (course-scoped)"
  on storage.objects for select to authenticated
  using (bucket_id = 'learning-covers' and public.learning_cover_is_readable(name));

drop policy if exists "learning-covers: admin insert" on storage.objects;
create policy "learning-covers: admin insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'learning-covers' and (select public."current_role"()) = 'admin');

drop policy if exists "learning-covers: admin update" on storage.objects;
create policy "learning-covers: admin update"
  on storage.objects for update to authenticated
  using (bucket_id = 'learning-covers' and (select public."current_role"()) = 'admin')
  with check (bucket_id = 'learning-covers' and (select public."current_role"()) = 'admin');

drop policy if exists "learning-covers: admin delete" on storage.objects;
create policy "learning-covers: admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'learning-covers' and (select public."current_role"()) = 'admin');

commit;

-- -----------------------------------------------------------------------------
-- NOTE ON THE CATEGORY SEED. ON CONFLICT (name) DO NOTHING means a re-run
-- never overwrites a renamed category, but WOULD re-insert one of the seven if
-- the barn owner deleted it and the file is re-applied. Re-applying a
-- migration after she has curated the list is not a normal event; if it
-- becomes one, move the seed to db:seed / a one-off script.
--
-- SUITE CHANGES THAT LAND WITH IT (tests/policies.test.mjs), control first:
--   migration  Adjusting Stirrups has exactly one section titled with the
--              course title; both lessons are in it, same ids, same video_id,
--              same notes, same order.
--   structure  a lesson cannot point at a section of another course (23503).
--   enrol      client enrols self in a visible published course; reads it.
--   deny       client enrols ANOTHER profile → refused; enrols in a draft →
--              refused; enrols in another level's course → refused.
--   deny       client2 reads client's enrolment / progress → nothing; cannot
--              delete them → 0 rows, re-read unchanged.
--   admin      reads every enrolment and progress row.
--   progress   client completes a visible lesson; cannot complete a lesson of
--              a draft; cannot write a row for another profile.
--   order      reorder_sections / reorder_section refuse a partial list, a
--              duplicate, a foreign id; a cross-section move within the course
--              works; staff and client are refused (42501).
--   draft      a member reads none of a draft course's sections, lessons,
--              categories links, or cover.
--   cover      admin uploads a cover; a member in the audience reads it; a
--              member outside it does not; the public URL with no session
--              does not serve.
--   definer    learning_lesson_is_readable and the two reorder functions are
--              entry points; learning_cover_is_readable is invoker; anon
--              executes none of them; the dropped learning_reorder_lessons is
--              gone (parser honours drop function).
-- -----------------------------------------------------------------------------
