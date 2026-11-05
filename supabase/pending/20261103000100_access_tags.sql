-- 0029 — access tags: admin-managed TAGS on people, and a third course
-- audience, "people with tag X".
--
-- PRINTED FOR AUDIT, NOT APPLIED. Lives in supabase/pending/ until approved;
-- then it moves to supabase/migrations/ and is applied with
-- `npm run db:apply -- <file>`, followed by `npm run db:gate`, with the
-- assertions in supabase/pending/20261103000100_access_tags.test.mjs pasted
-- into tests/policies.test.mjs (Academy section) in the same commit.
--
-- WHY. The barn owner needs to control who sees the Academy (it may become a
-- paid subscription; payment is handled outside the app for now). Tags are
-- GENERIC — a tag is a named group of people, nothing Academy-specific — so
-- email audiences can reuse them later.
--
-- WHAT CHANGES
--   1. public.tags          (id, name)            admin-only, RLS default deny
--   2. public.profile_tags  (tag_id, profile_id)  admin-only, RLS default deny
--   3. learning_modules.audience gains 'tag', with audience_tag_id.
--   4. THE ONE AUDIENCE RULE IS EXTENDED, NOT DUPLICATED:
--      learning_audience_allows(published, audience, level) becomes
--      learning_audience_allows(published, audience, level, tag). Its callers
--      — the learning_modules SELECT policy and learning_module_is_readable —
--      are re-pointed at it, and the 3-argument version is dropped. Every
--      table that is gated by course visibility (sections, lessons, category
--      links, enrolments, progress, covers, and so lesson thumbnails and
--      playback tokens, which the app mints only for a lesson row RLS
--      returned) already goes through learning_module_is_readable, so all of
--      them follow the tag with no further change.
--
-- WHO SEES A COURSE (unchanged except for the new 'tag' line):
--   admin   every course, drafts too
--   staff   every PUBLISHED course
--   client  a published course whose audience is
--             'all'
--             'level' and an ACTIVE rider in their family is at that level
--             'tag'   and THEIR OWN PROFILE carries that tag          <- new
--
-- REMOVING A TAG. Deleting a profile_tags row hides the course on the very
-- next query (RLS is evaluated per query; nothing is cached). Nothing else is
-- deleted: learning_progress and learning_enrolments do not reference
-- profile_tags, so a person's progress is still there if the tag comes back.
--
-- DELETING A TAG that a course uses is refused (on delete restrict), so a
-- course can never silently fall back to a different audience. Deleting a tag
-- no course uses removes its people's memberships with it (cascade).
--
-- Idempotent: safe to re-run.

-- =============================================================================
-- 1. tags
-- =============================================================================
create table if not exists public.tags (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null check (length(btrim(name)) between 1 and 80),
  created_by  uuid references public.profiles (id) on delete set null default public.current_profile()
);

alter table public.tags enable row level security;

-- One tag per name, ignoring case and surrounding spaces.
create unique index if not exists tags_name_unique on public.tags (lower(btrim(name)));

comment on table public.tags is
  'Admin-managed named groups of people (generic: course audiences now, email audiences later). Admin only.';

drop policy if exists "tags: admin read" on public.tags;
create policy "tags: admin read"
  on public.tags for select to authenticated
  using (public."current_role"() = 'admin');

drop policy if exists "tags: admin insert" on public.tags;
create policy "tags: admin insert"
  on public.tags for insert to authenticated
  with check (public."current_role"() = 'admin');

drop policy if exists "tags: admin update" on public.tags;
create policy "tags: admin update"
  on public.tags for update to authenticated
  using (public."current_role"() = 'admin')
  with check (public."current_role"() = 'admin');

drop policy if exists "tags: admin delete" on public.tags;
create policy "tags: admin delete"
  on public.tags for delete to authenticated
  using (public."current_role"() = 'admin');

-- =============================================================================
-- 2. profile_tags — who carries which tag
-- =============================================================================
create table if not exists public.profile_tags (
  tag_id      uuid not null references public.tags (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  added_at    timestamptz not null default now(),
  added_by    uuid references public.profiles (id) on delete set null default public.current_profile(),
  primary key (tag_id, profile_id)
);

alter table public.profile_tags enable row level security;

create index if not exists profile_tags_profile_id_idx on public.profile_tags (profile_id);

comment on table public.profile_tags is
  'Which people carry which tag. Admin only. Removing a row removes the access the tag gave, immediately; progress is untouched.';

drop policy if exists "profile_tags: admin read" on public.profile_tags;
create policy "profile_tags: admin read"
  on public.profile_tags for select to authenticated
  using (public."current_role"() = 'admin');

drop policy if exists "profile_tags: admin insert" on public.profile_tags;
create policy "profile_tags: admin insert"
  on public.profile_tags for insert to authenticated
  with check (public."current_role"() = 'admin');

drop policy if exists "profile_tags: admin delete" on public.profile_tags;
create policy "profile_tags: admin delete"
  on public.profile_tags for delete to authenticated
  using (public."current_role"() = 'admin');

-- No UPDATE policy: a membership is added or removed, never edited.

-- =============================================================================
-- 3. learning_modules: the 'tag' audience
-- =============================================================================
alter table public.learning_modules
  add column if not exists audience_tag_id uuid references public.tags (id) on delete restrict;

create index if not exists learning_modules_audience_tag_id_idx
  on public.learning_modules (audience_tag_id) where audience_tag_id is not null;

-- The column's inline CHECK from 0023 is named learning_modules_audience_check.
alter table public.learning_modules drop constraint if exists learning_modules_audience_check;
alter table public.learning_modules
  add constraint learning_modules_audience_check check (audience in ('all', 'level', 'tag'));

-- Exactly the one target its audience names: a level for 'level', a tag for
-- 'tag', neither for 'all'.
alter table public.learning_modules drop constraint if exists learning_modules_level_matches_audience;
alter table public.learning_modules drop constraint if exists learning_modules_target_matches_audience;
alter table public.learning_modules
  add constraint learning_modules_target_matches_audience check (
    (audience = 'level') = (audience_level_id is not null)
    and (audience = 'tag') = (audience_tag_id is not null)
  );

-- =============================================================================
-- 4. THE AUDIENCE RULE, extended
-- =============================================================================
create or replace function public.learning_audience_allows(
  is_published boolean,
  for_audience text,
  for_level uuid,
  for_tag uuid
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
              or (
                for_audience = 'tag'
                and exists (
                  select 1
                    from public.profile_tags pt
                   where pt.tag_id = for_tag
                     and pt.profile_id = public.current_profile()
                )
              )
            )
          )
        )
      );
$$;

comment on function public.learning_audience_allows(boolean, text, uuid, uuid) is
  'THE learning-course audience rule over a course''s own values: admin always; staff when published; a client when published and audience all, their active rider''s level, or a tag on their own profile. The modules SELECT policy uses it directly; learning_module_is_readable wraps it for every other table.';

-- Born open (0015): all three revoked, then authenticated granted back because
-- RLS policies call it as the querying user.
revoke all on function public.learning_audience_allows(boolean, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.learning_audience_allows(boolean, text, uuid, uuid) to authenticated;

create or replace function public.learning_module_is_readable(module uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select public.learning_audience_allows(m.published, m.audience, m.audience_level_id, m.audience_tag_id)
        from public.learning_modules m
       where m.id = module
    ),
    false
  );
$$;

revoke all on function public.learning_module_is_readable(uuid) from public, anon, authenticated;
grant execute on function public.learning_module_is_readable(uuid) to authenticated;

drop policy if exists "learning_modules: read (audience-scoped)" on public.learning_modules;
create policy "learning_modules: read (audience-scoped)"
  on public.learning_modules for select to authenticated
  using (public.learning_audience_allows(published, audience, audience_level_id, audience_tag_id));

-- The 3-argument rule has no callers left. One rule, not two.
drop function if exists public.learning_audience_allows(boolean, text, uuid);
