-- =============================================================================
-- 0006 — task_templates + tasks (Phase 1, slice 2)
--
-- The barn's daily work. Admin defines recurring templates and assigns work;
-- staff see only what is assigned to them and can do one thing to it: mark it
-- done. Parents never see any of it.
--
-- RLS is enabled in this same migration for both tables, per the standing rule.
--
-- The interesting constraint is staff UPDATE. A row policy alone would let a
-- staff member edit any field of their own task — including reassigning it to
-- someone else, or moving it to another date. So the policy restricts WHICH
-- ROWS they may touch and a trigger restricts WHICH COLUMNS may change, the
-- same split already used on profiles and notifications.
--
-- NOT APPLIED BY THIS REPO. Paste into the Supabase SQL Editor. Safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- task_templates — the recurring work, set up once (SPEC §3.3 "templates +
-- exceptions"). Admin-only in every direction; staff never read these, they
-- only ever see the generated tasks.
-- -----------------------------------------------------------------------------
create table if not exists public.task_templates (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  title            text not null check (length(btrim(title)) > 0),
  description      text not null default '',
  recurrence       text not null check (recurrence in ('daily', 'weekday', 'weekly')),
  -- ISO weekday, 1 = Monday … 7 = Sunday. Required for 'weekly', meaningless
  -- otherwise, so the constraint enforces exactly that.
  weekday          integer check (weekday between 1 and 7),
  default_assignee uuid references public.profiles (id) on delete set null,
  active           boolean not null default true,
  constraint task_templates_weekday_matches_recurrence check (
    (recurrence = 'weekly' and weekday is not null)
    or (recurrence <> 'weekly' and weekday is null)
  )
);

alter table public.task_templates enable row level security;

create index if not exists task_templates_active_idx
  on public.task_templates (active, recurrence);

comment on table public.task_templates is
  'Recurring task definitions. Admin-only; staff see generated tasks, not templates.';

-- -----------------------------------------------------------------------------
-- tasks — one row per job per day.
-- -----------------------------------------------------------------------------
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  template_id  uuid references public.task_templates (id) on delete set null,
  title        text not null check (length(btrim(title)) > 0),
  description  text not null default '',
  date         date not null default current_date,
  assignee     uuid references public.profiles (id) on delete set null,
  status       text not null default 'open' check (status in ('open', 'done')),
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  -- 'done' and the completion stamps travel together or not at all. Without
  -- this a task could read done with no record of who did it, or open while
  -- still carrying a completion.
  constraint tasks_completion_is_consistent check (
    (status = 'done' and completed_at is not null)
    or (status = 'open' and completed_at is null and completed_by is null)
  )
);

alter table public.tasks enable row level security;

-- Staff open their tab to "my tasks for today"; admin opens "everything today".
create index if not exists tasks_assignee_date_idx on public.tasks (assignee, date, status);
create index if not exists tasks_date_idx on public.tasks (date, status);

-- Makes template generation idempotent: one row per template per day. Ad-hoc
-- tasks have a null template_id and are not constrained, so an admin can add
-- the same one twice on purpose.
create unique index if not exists tasks_one_per_template_per_day
  on public.tasks (template_id, date)
  where template_id is not null;

comment on table public.tasks is
  'A single job on a single day. Staff read and complete only their own; parents see none.';

-- =============================================================================
-- Policies — task_templates (admin only, all four verbs)
-- =============================================================================
drop policy if exists "task_templates: admin read" on public.task_templates;
create policy "task_templates: admin read"
  on public.task_templates for select to authenticated
  using ((select public."current_role"()) = 'admin');

drop policy if exists "task_templates: admin insert" on public.task_templates;
create policy "task_templates: admin insert"
  on public.task_templates for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "task_templates: admin update" on public.task_templates;
create policy "task_templates: admin update"
  on public.task_templates for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "task_templates: admin delete" on public.task_templates;
create policy "task_templates: admin delete"
  on public.task_templates for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- Policies — tasks
--   admin  — full CRUD
--   staff  — read ONLY tasks assigned to them; update only those rows
--   parent — nothing (no policy matches them)
--
-- Note the read policy does not mention 'parent' at all. A parent's role never
-- satisfies either branch, so they see zero rows without a special case.
-- =============================================================================
drop policy if exists "tasks: read (admin all, staff own assignments)" on public.tasks;
create policy "tasks: read (admin all, staff own assignments)"
  on public.tasks for select to authenticated
  using (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'staff'
      and assignee = (select public.current_profile())
    )
  );

drop policy if exists "tasks: admin insert" on public.tasks;
create policy "tasks: admin insert"
  on public.tasks for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

-- Staff may update a row that is theirs and must still be theirs afterwards.
-- The WITH CHECK is what stops them handing a task to someone else; the column
-- trigger below stops them changing anything other than completion.
drop policy if exists "tasks: update (admin any, staff own assignments)" on public.tasks;
create policy "tasks: update (admin any, staff own assignments)"
  on public.tasks for update to authenticated
  using (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'staff'
      and assignee = (select public.current_profile())
    )
  )
  with check (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'staff'
      and assignee = (select public.current_profile())
    )
  );

drop policy if exists "tasks: admin delete" on public.tasks;
create policy "tasks: admin delete"
  on public.tasks for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- -----------------------------------------------------------------------------
-- Column guard for staff completions.
--
-- The UPDATE policy above decides which ROWS a staff member may write. This
-- decides which COLUMNS. Without it, "staff may update their own task" also
-- means they may retitle it, move it to next week, or detach it from its
-- template — and, since the WITH CHECK only requires the row still be theirs,
-- they could not give it away but could still rewrite the work itself.
--
-- Staff may set status, completed_at and completed_by, and nothing else. They
-- may also un-complete a task they ticked by mistake.
-- -----------------------------------------------------------------------------
create or replace function public.tasks_guard_staff_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role       text;
  v_profile_id uuid;
begin
  -- No end user in context: a service-role or server-side call, which already
  -- bypasses RLS. Nothing to restrict.
  if auth.uid() is null then
    return new;
  end if;

  select p.role, p.id into v_role, v_profile_id
    from public.profiles p
   where p.user_id = auth.uid();

  if v_role = 'admin' then
    return new;
  end if;

  if new.title       is distinct from old.title
     or new.description is distinct from old.description
     or new.date        is distinct from old.date
     or new.assignee    is distinct from old.assignee
     or new.template_id is distinct from old.template_id
     or new.id          is distinct from old.id
  then
    raise exception 'Staff may only complete a task, not change what it is or who it belongs to.'
      using errcode = '42501';
  end if;

  -- A completion must be attributed to the person doing it.
  if new.status = 'done' and new.completed_by is distinct from v_profile_id then
    raise exception 'A task must be completed by the person marking it done.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.tasks_guard_staff_columns() is
  'Restricts non-admin task updates to the completion columns, and forces completed_by to be the caller.';

drop trigger if exists tasks_guard_staff_columns on public.tasks;

create trigger tasks_guard_staff_columns
  before update on public.tasks
  for each row
  execute function public.tasks_guard_staff_columns();

-- =============================================================================
-- generate_tasks_for_date(target_date) — materialise a day's tasks
--
-- Idempotent by construction: the unique index on (template_id, date) plus
-- ON CONFLICT DO NOTHING means running it twice creates nothing the second
-- time, and it can be re-run safely after adding a template mid-day.
--
-- Returns the number of tasks actually created, so the admin UI can report
-- "3 tasks generated" rather than a silent success.
--
-- TODO (deferred): a scheduled cron should call this nightly. For now the
-- admin triggers it from Manage → Tasks. Nothing schedules itself.
-- =============================================================================
create or replace function public.generate_tasks_for_date(target_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer;
  v_iso_dow integer := extract(isodow from target_date);
begin
  -- Admin-only. This runs as its own owner and writes tasks for everyone, so
  -- it must not be callable by staff or parents.
  if (select public."current_role"()) is distinct from 'admin' then
    raise exception 'Only an admin may generate tasks.' using errcode = '42501';
  end if;

  insert into public.tasks (template_id, title, description, date, assignee, status)
  select t.id, t.title, t.description, target_date, t.default_assignee, 'open'
    from public.task_templates t
   where t.active
     and (
       t.recurrence = 'daily'
       or (t.recurrence = 'weekday' and v_iso_dow between 1 and 5)
       or (t.recurrence = 'weekly' and t.weekday = v_iso_dow)
     )
  on conflict (template_id, date) where template_id is not null do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

comment on function public.generate_tasks_for_date(date) is
  'Creates today''s tasks from active templates. Idempotent; admin-only; returns the count created.';

-- The function is SECURITY DEFINER and gates on role internally, so it is safe
-- to expose. anon has no session, so current_role() is null and it refuses.
revoke all on function public.generate_tasks_for_date(date) from public;
grant execute on function public.generate_tasks_for_date(date) to authenticated;

commit;
