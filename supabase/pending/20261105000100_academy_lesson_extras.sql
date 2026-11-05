-- 0030 — Academy lesson extras for Circle parity (design/ACADEMY-CIRCLE-GAPS.md
-- #2, #3, #4): draft lessons, lesson attachments, and resume-where-you-left-off
-- across devices.
--
-- PRINTED FOR AUDIT, NOT APPLIED. Independent of 0029 (access tags): either may
-- be applied first. After approval it moves to supabase/migrations/, is applied
-- with `npm run db:apply -- <file>`, then `npm run db:gate`, with its assertions
-- added to tests/policies.test.mjs in the same commit (listed at the end).
--
-- 1. DRAFT LESSONS (gap #4). learning_lessons.published, default TRUE so every
--    existing lesson stays exactly as visible as it is now. A draft lesson is
--    seen by the admin only — not staff, not clients (Circle: "visible only to
--    the course space moderator and admins"). Enforced in ONE place,
--    learning_lesson_is_readable, which the lessons policy now calls; progress,
--    positions and attachments already gate on it, and the app mints thumbnail
--    and playback tokens only for a lesson row RLS returned — so a draft
--    lesson's video, thumbnail, files and progress all follow.
--
-- 2. LESSON ATTACHMENTS (gap #3). public.learning_lesson_files + a PRIVATE
--    bucket, learning-files. Up to 15 files per lesson (Circle's limit; the app
--    enforces it and a guard trigger refuses the 16th for everyone). A file is
--    readable exactly when its lesson is (storage policy -> invoker function ->
--    the caller's own RLS on learning_lesson_files -> learning_lesson_is_readable).
--    Admin writes only. Not video: video stays in Cloudflare Stream.
--
-- 3. RESUME ACROSS DEVICES (gap #2). public.learning_positions: one row per
--    person per lesson, the second they reached. Own rows only, for lessons the
--    person may see; the admin reads none of them (a playhead is not progress,
--    and "who is watching" does not need it). Not an audit ledger — it is
--    overwritten as they watch, so it has an UPDATE policy on purpose.
--
-- Idempotent: safe to re-run.

begin;

-- =============================================================================
-- 1. Draft lessons
-- =============================================================================
alter table public.learning_lessons
  add column if not exists published boolean not null default true;

create or replace function public.learning_lesson_is_readable(lesson uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select public.learning_module_is_readable(l.module_id)
             and (l.published or public."current_role"() = 'admin')
        from public.learning_lessons l
       where l.id = lesson
    ),
    false
  );
$$;

comment on function public.learning_lesson_is_readable(uuid) is
  'True when the caller may see the lesson: its course is readable (the audience rule) and the lesson is published, or the caller is the admin. False when it does not exist.';

revoke all on function public.learning_lesson_is_readable(uuid) from public, anon, authenticated;
grant execute on function public.learning_lesson_is_readable(uuid) to authenticated;

-- The lessons policy reads the row's own columns rather than calling
-- learning_lesson_is_readable (which would query learning_lessons from inside
-- its own policy): same rule, written over the row.
drop policy if exists "learning_lessons: read (module-scoped)" on public.learning_lessons;
create policy "learning_lessons: read (module-scoped)"
  on public.learning_lessons for select to authenticated
  using (
    (select public.learning_module_is_readable(module_id))
    and (published or (select public."current_role"()) = 'admin')
  );

-- =============================================================================
-- 2. Lesson attachments
-- =============================================================================
create table if not exists public.learning_lesson_files (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  lesson_id     uuid not null references public.learning_lessons (id) on delete cascade,
  -- The object in the learning-files bucket: "<lesson_id>/<uuid>-<name>".
  path          text not null unique,
  name          text not null check (length(btrim(name)) between 1 and 200),
  size_bytes    bigint not null check (size_bytes > 0),
  content_type  text not null,
  position      integer not null default 0 check (position >= 0)
);

alter table public.learning_lesson_files enable row level security;

create index if not exists learning_lesson_files_lesson_idx on public.learning_lesson_files (lesson_id, position);

comment on table public.learning_lesson_files is
  'Downloadable files on a lesson (PDFs and the like; never video). Readable exactly when the lesson is; admin writes. Max 15 per lesson.';

drop policy if exists "learning_lesson_files: read (lesson-scoped)" on public.learning_lesson_files;
create policy "learning_lesson_files: read (lesson-scoped)"
  on public.learning_lesson_files for select to authenticated
  using ((select public.learning_lesson_is_readable(lesson_id)));

drop policy if exists "learning_lesson_files: admin insert" on public.learning_lesson_files;
create policy "learning_lesson_files: admin insert"
  on public.learning_lesson_files for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "learning_lesson_files: admin update" on public.learning_lesson_files;
create policy "learning_lesson_files: admin update"
  on public.learning_lesson_files for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "learning_lesson_files: admin delete" on public.learning_lesson_files;
create policy "learning_lesson_files: admin delete"
  on public.learning_lesson_files for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- 15 per lesson, for everyone (service role included — a guard that spares a
-- null caller would leave db:seed and any server path unguarded).
create or replace function public.learning_lesson_files_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.learning_lesson_files f where f.lesson_id = new.lesson_id) >= 15 then
    raise exception 'A lesson holds at most 15 files.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.learning_lesson_files_limit() from public, anon, authenticated;

drop trigger if exists learning_lesson_files_limit on public.learning_lesson_files;
create trigger learning_lesson_files_limit
  before insert on public.learning_lesson_files
  for each row execute function public.learning_lesson_files_limit();

-- The bucket: private, 50 MB a file, documents and images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('learning-files', 'learning-files', false, 52428800,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'text/plain'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- SECURITY INVOKER on purpose (the covers pattern, 0028): the exists() runs
-- under the CALLER's RLS on learning_lesson_files, so a file is readable
-- exactly when its row is — which is exactly when its lesson is.
create or replace function public.learning_file_is_readable(object_name text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.learning_lesson_files f where f.path = object_name);
$$;

grant execute on function public.learning_file_is_readable(text) to authenticated;

drop policy if exists "learning-files: read (lesson-scoped)" on storage.objects;
create policy "learning-files: read (lesson-scoped)"
  on storage.objects for select to authenticated
  using (bucket_id = 'learning-files' and public.learning_file_is_readable(name));

drop policy if exists "learning-files: admin insert" on storage.objects;
create policy "learning-files: admin insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'learning-files' and (select public."current_role"()) = 'admin');

drop policy if exists "learning-files: admin delete" on storage.objects;
create policy "learning-files: admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'learning-files' and (select public."current_role"()) = 'admin');

-- =============================================================================
-- 3. Resume positions
-- =============================================================================
create table if not exists public.learning_positions (
  profile_id  uuid not null default public.current_profile() references public.profiles (id) on delete cascade,
  lesson_id   uuid not null references public.learning_lessons (id) on delete cascade,
  seconds     integer not null check (seconds >= 0),
  updated_at  timestamptz not null default now(),
  primary key (profile_id, lesson_id)
);

alter table public.learning_positions enable row level security;

comment on table public.learning_positions is
  'Where each person reached in each lesson, so it resumes on any device. Own rows only; overwritten as they watch.';

drop policy if exists "learning_positions: read own" on public.learning_positions;
create policy "learning_positions: read own"
  on public.learning_positions for select to authenticated
  using (profile_id = (select public.current_profile()));

drop policy if exists "learning_positions: insert own, visible lesson" on public.learning_positions;
create policy "learning_positions: insert own, visible lesson"
  on public.learning_positions for insert to authenticated
  with check (
    profile_id = (select public.current_profile())
    and (select public.learning_lesson_is_readable(lesson_id))
  );

drop policy if exists "learning_positions: update own, visible lesson" on public.learning_positions;
create policy "learning_positions: update own, visible lesson"
  on public.learning_positions for update to authenticated
  using (profile_id = (select public.current_profile()))
  with check (
    profile_id = (select public.current_profile())
    and (select public.learning_lesson_is_readable(lesson_id))
  );

drop policy if exists "learning_positions: delete own" on public.learning_positions;
create policy "learning_positions: delete own"
  on public.learning_positions for delete to authenticated
  using (profile_id = (select public.current_profile()));

commit;

-- =============================================================================
-- ASSERTIONS to add with it (tests/policies.test.mjs, Academy section) —
-- each deny preceded by its positive control:
--   draft lesson: control admin reads it; a client and staff CANNOT read it;
--     a client CANNOT insert progress or a position for it; publishing it makes
--     it readable to the client (re-read).
--   files: control admin inserts a row + object; a client in the audience reads
--     both; a client outside the audience, and anon, read neither; a client
--     CANNOT insert a row or upload an object; the 16th file is refused for the
--     admin AND the service role; the public URL serves nothing.
--   positions: control a client writes and reads their own; another client
--     CANNOT read it, update it or delete it (re-read unchanged); a client
--     CANNOT write a position for another profile or a lesson they cannot see;
--     the admin reads none.
-- =============================================================================
