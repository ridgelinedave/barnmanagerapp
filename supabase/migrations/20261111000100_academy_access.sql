-- 0032 — Academy access: included for lesson students, ends on their notice
-- date; manual grants for anyone else. One function decides it.
--
-- AUDITED AND APPROVED 2026-11-11 (David). Applied with
-- `npm run db:apply -- <file>` (twice — idempotent), then `npm run db:gate`,
-- with its assertions in tests/policies.test.mjs in the same commit.
--
-- -----------------------------------------------------------------------------
-- WHO IS A LESSON STUDENT (proposed; Belle's rule, 2026-11-11)
-- -----------------------------------------------------------------------------
-- A lesson student is a RIDER that is active, whose client is not marked
-- inactive, and whose lessons-end date is empty or not yet passed. In this
-- app a rider exists only for someone who takes lessons (0026's model:
-- "RIDER = takes lessons"), so the rider record IS the student record.
-- Lesson history (bookings, recurring enrolments) is deliberately NOT used:
-- on 2026-11-11 the live barn has no real riders, enrolments or bookings
-- entered yet, so a history-based rule would give nobody access at launch,
-- and it would flicker off between sessions.
--
--   between sessions     still a student — rider active, no end date: ACCESS
--   on a break           (client status on_break) still a student until Belle
--                        sets a lessons-end date: ACCESS. A break is not
--                        leaving; the notice date is what ends it.
--   makeups only         still a student: ACCESS
--   client inactive      NO access, even with no end date set (safety net)
--   rider "not riding"   (riders.active false) NO access, at once
--   boarder, no riders   NO access (unless granted by hand)
--
-- WHOSE LOGIN GETS IT
--   adult student   a rider linked to a login (riders.profile_id, 0026): that
--                   login only.
--   minor           a rider with no login of their own: every client login on
--                   the rider's family (profiles.family_id).
--   working student a STAFF login linked as a rider: access as a student,
--                   like anyone else.
--   staff           otherwise NO access any more (was: every published
--                   course). Admin keeps full access.
--   anyone          an admin-written manual grant (paying non-students),
--                   optional end.
--
-- WHEN IT ENDS. riders.lessons_end_at and academy_grants.ends_at are
-- timestamptz: the END of the chosen day in the barn's timezone, computed by
-- the APP from config/barn.ts (default today + 30 days, editable). No
-- timezone is written in SQL — the app applies the config value and the
-- database records the instant. Access ends when now() reaches it.
--
-- WHAT FOLLOWS IT. public.academy_access() is the ONE answer. The existing
-- course rule, learning_audience_allows (same signature as 0029, replaced in
-- place), now requires it for everyone but the admin, and drops staff's
-- blanket access. Everything course-gated already goes through that rule —
-- courses (its own policy), sections, lessons, category links, enrolment and
-- progress writes, covers (learning_module_is_readable), and so lesson
-- thumbnails and playback tokens, which the app mints only for a lesson row
-- RLS returned. The per-course audience (all / level / tag) still applies ON
-- TOP of access: tags stay, but a tag no longer opens the Academy to someone
-- without access — it only narrows which courses they see.
--
-- PROGRESS IS KEPT. Nothing here deletes or touches learning_progress or
-- learning_enrolments. When access ends the rows stay; when it returns (a new
-- date, a new grant) they are there.
--
-- Idempotent; one transaction.

begin;

-- =============================================================================
-- 1. riders.lessons_end_at — admin-set only
-- =============================================================================
alter table public.riders
  add column if not exists lessons_end_at timestamptz;

comment on column public.riders.lessons_end_at is
  'When this student''s lessons end (Belle''s 30-day notice): the end of the chosen day in the barn timezone, set by the app. Academy access through this rider ends at this instant. Null: no end set.';

-- riders already has admin-only INSERT/UPDATE policies (0003). This is the
-- second lock (row policy + guard trigger): a future policy that widens
-- riders UPDATE cannot silently widen this column with it.
--
-- The early return on a NULL caller is ON PURPOSE, for db:seed and migration
-- backfills — so, as with riders_guard_profile_link (0026), this does NOT bind
-- the service role: any server-side path that writes lessons_end_at is
-- unguarded and must validate its own caller.
create or replace function public.riders_guard_lessons_end()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.lessons_end_at is not null)
     or (tg_op = 'UPDATE' and new.lessons_end_at is distinct from old.lessons_end_at) then
    if (select public."current_role"()) is distinct from 'admin' then
      raise exception 'Only an admin may set when a student''s lessons end.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.riders_guard_lessons_end() is
  'Refuses any non-admin write that sets or changes riders.lessons_end_at.';

revoke all on function public.riders_guard_lessons_end() from public, anon, authenticated;

drop trigger if exists riders_guard_lessons_end on public.riders;
create trigger riders_guard_lessons_end
  before insert or update on public.riders
  for each row execute function public.riders_guard_lessons_end();

-- =============================================================================
-- 2. academy_grants — access granted by hand
-- =============================================================================
create table if not exists public.academy_grants (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  -- Null: no end. Otherwise the end of the chosen day, barn time (app-computed).
  ends_at     timestamptz,
  granted_by  uuid references public.profiles (id) on delete set null default public.current_profile(),
  note        text check (note is null or length(note) <= 500)
);

alter table public.academy_grants enable row level security;

create index if not exists academy_grants_profile_idx on public.academy_grants (profile_id);

comment on table public.academy_grants is
  'Academy access granted by hand (e.g. a paying non-student; payment is outside the app). Admin writes; a login reads its own. Ended by setting ends_at, not by deleting, so the record stays.';

drop policy if exists "academy_grants: read (own, admin all)" on public.academy_grants;
create policy "academy_grants: read (own, admin all)"
  on public.academy_grants for select to authenticated
  using (
    profile_id = (select public.current_profile())
    or (select public."current_role"()) = 'admin'
  );

drop policy if exists "academy_grants: admin insert" on public.academy_grants;
create policy "academy_grants: admin insert"
  on public.academy_grants for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "academy_grants: admin update" on public.academy_grants;
create policy "academy_grants: admin update"
  on public.academy_grants for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "academy_grants: admin delete" on public.academy_grants;
create policy "academy_grants: admin delete"
  on public.academy_grants for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- 3. academy_access() — THE answer for the current login
-- =============================================================================
create or replace function public.academy_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public."current_role"() = 'admin', false)
      or exists (
        select 1
          from public.academy_grants g
         where g.profile_id = public.current_profile()
           and (g.ends_at is null or g.ends_at > now())
      )
      or exists (
        select 1
          from public.riders r
          join public.families f on f.id = r.family_id
         where r.active
           and f.status <> 'inactive'
           and (r.lessons_end_at is null or r.lessons_end_at > now())
           and (
             r.profile_id = public.current_profile()
             or (r.profile_id is null and r.family_id = public.current_family())
           )
      );
$$;

comment on function public.academy_access() is
  'True when the current login may use the Academy: admin; an open manual grant; or a current lesson student — an active rider (client not inactive, lessons-end not passed) linked to this login, or with no login of their own on this login''s family.';

-- Called by RLS (through learning_audience_allows) and by the app to decide
-- whether the Academy entry shows. Born open (0015): all three revoked, then
-- authenticated granted back.
revoke all on function public.academy_access() from public, anon, authenticated;
grant execute on function public.academy_access() to authenticated;

-- =============================================================================
-- 4. THE COURSE RULE — extended to require access (same signature, in place)
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
        and public.academy_access()
        and (
          for_audience = 'all'
          or (
            for_audience = 'level'
            and exists (
              select 1
                from public.riders r
               where r.active
                 and r.level_id = for_level
                 and (r.profile_id = public.current_profile() or r.family_id = public.current_family())
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
      );
$$;

comment on function public.learning_audience_allows(boolean, text, uuid, uuid) is
  'THE learning-course rule: admin always; anyone else when the course is published AND they have Academy access (academy_access) AND the course''s audience admits them (all; their own or family rider''s level; a tag on their login). Staff have no blanket access.';

revoke all on function public.learning_audience_allows(boolean, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.learning_audience_allows(boolean, text, uuid, uuid) to authenticated;

commit;

-- =============================================================================
-- ASSERTIONS to add with it (tests/policies.test.mjs), control first:
--   academy_access(): admin true; a client whose family has a current rider
--     true (control) -> rider lessons_end_at in the past false -> moved to the
--     future true; client status inactive false; rider active=false false;
--     a family whose only rider is linked to its own login: the family login
--     false, the rider's login true; staff with no rider false; staff linked
--     as a rider true; an open grant true; a grant whose ends_at passed false.
--   courses: with access the client reads a published course, its section,
--     lesson, cover and category link (control); without access none of them,
--     and cannot enrol or record progress; staff without access read none;
--     admin reads all, drafts too.
--   progress kept: a progress row written with access survives losing it
--     (admin re-reads it) and the client reads it again once access returns.
--   guards: a client cannot set lessons_end_at on their own rider (refused,
--     re-read unchanged); a client cannot write academy_grants; a login reads
--     its own grant and not another's.
-- =============================================================================
