-- =============================================================================
-- 0007 — lesson_templates + lesson_instances + lesson_riders (Phase 1, slice 3a)
--
-- The weekly riding schedule. Belle builds the recurring pattern once as
-- templates, a generator materialises real dated instances from it, and riders
-- are booked into those instances.
--
-- RLS is enabled in this same migration for all three tables.
--
-- Two things make this slice harder than tasks, and both are handled with
-- SECURITY DEFINER helpers rather than nested policy subqueries:
--
--   1. A parent may see a lesson instance only if one of THEIR riders is in it.
--      That is a fact about lesson_riders ⋈ riders, read from a policy on
--      lesson_instances — three tables, each with its own RLS. Expressed
--      inline it either recurses or silently returns nothing depending on
--      evaluation order. family_sees_instance() answers the question once, with
--      RLS suspended, and the policy just calls it.
--   2. The same applies to "is this lesson_riders row one of my family's?" —
--      family_owns_rider().
--
-- NOT APPLIED BY THIS REPO. Paste into the Supabase SQL Editor. Safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- lesson_templates — the recurring weekly schedule, built once via the wizard.
-- -----------------------------------------------------------------------------
create table if not exists public.lesson_templates (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  -- ISO weekday, 1 = Monday … 7 = Sunday.
  weekday       integer not null check (weekday between 1 and 7),
  start_time    time not null,
  duration_min  integer not null check (duration_min in (45, 60)),
  type          text not null check (type in ('private', 'group')),
  instructor_id uuid references public.profiles (id) on delete set null,
  max_riders    integer not null default 1 check (max_riders >= 1),
  level_id      uuid references public.levels (id) on delete set null,
  active        boolean not null default true
);

alter table public.lesson_templates enable row level security;

create index if not exists lesson_templates_active_idx
  on public.lesson_templates (active, weekday, start_time);
create index if not exists lesson_templates_instructor_idx
  on public.lesson_templates (instructor_id);
create index if not exists lesson_templates_level_idx
  on public.lesson_templates (level_id);

comment on table public.lesson_templates is
  'The recurring weekly lesson pattern. Instances are materialised from these.';

-- -----------------------------------------------------------------------------
-- lesson_instances — a real lesson on a real date. A null template_id means a
-- one-off that was not generated from the weekly pattern.
-- -----------------------------------------------------------------------------
create table if not exists public.lesson_instances (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  template_id   uuid references public.lesson_templates (id) on delete set null,
  date          date not null,
  start_time    time not null,
  duration_min  integer not null check (duration_min in (45, 60)),
  type          text not null check (type in ('private', 'group')),
  instructor_id uuid references public.profiles (id) on delete set null,
  status        text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  notes         text not null default ''
);

alter table public.lesson_instances enable row level security;

create index if not exists lesson_instances_date_idx
  on public.lesson_instances (date, start_time);
create index if not exists lesson_instances_instructor_idx
  on public.lesson_instances (instructor_id);

-- Makes materialisation idempotent: one instance per template per day. One-off
-- lessons have a null template_id and are deliberately unconstrained, so an
-- admin can add two at the same time if they mean to.
create unique index if not exists lesson_instances_one_per_template_per_day
  on public.lesson_instances (template_id, date)
  where template_id is not null;

comment on table public.lesson_instances is
  'A dated lesson. Generated from a template, or one-off when template_id is null.';

-- -----------------------------------------------------------------------------
-- lesson_riders — who is in which lesson.
-- -----------------------------------------------------------------------------
create table if not exists public.lesson_riders (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  instance_id  uuid not null references public.lesson_instances (id) on delete cascade,
  rider_id     uuid not null references public.riders (id) on delete cascade,
  status       text not null default 'booked' check (status in ('booked', 'cancelled', 'backfilled')),
  cancelled_at timestamptz,
  -- One booking per rider per lesson. Without this a double-tap on the admin
  -- booking control silently books the same child twice.
  constraint lesson_riders_no_double_booking unique (instance_id, rider_id)
);

alter table public.lesson_riders enable row level security;

create index if not exists lesson_riders_instance_idx on public.lesson_riders (instance_id, status);
create index if not exists lesson_riders_rider_idx on public.lesson_riders (rider_id, status);

comment on table public.lesson_riders is
  'A rider''s place in a lesson. Cancelling is the only write a parent has here.';

-- =============================================================================
-- SECURITY DEFINER helpers — see the header note on why these exist.
-- =============================================================================

-- Does the calling family have a rider in this lesson instance?
create or replace function public.family_sees_instance(instance uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.lesson_riders lr
      join public.riders r on r.id = lr.rider_id
     where lr.instance_id = instance
       and r.family_id is not distinct from public.current_family()
       and public.current_family() is not null
  );
$$;

comment on function public.family_sees_instance(uuid) is
  'True when one of the calling family''s riders is in the given lesson instance. SECURITY DEFINER to avoid cross-table RLS recursion.';

-- Does this rider belong to the calling family?
create or replace function public.family_owns_rider(rider uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.riders r
     where r.id = rider
       and r.family_id is not distinct from public.current_family()
       and public.current_family() is not null
  );
$$;

comment on function public.family_owns_rider(uuid) is
  'True when the given rider belongs to the calling family. Supporting helper for lesson_riders policies.';

-- =============================================================================
-- Policies — lesson_templates: admin CRUD, staff read, parents nothing.
-- =============================================================================
drop policy if exists "lesson_templates: read (admin/staff)" on public.lesson_templates;
create policy "lesson_templates: read (admin/staff)"
  on public.lesson_templates for select to authenticated
  using ((select public."current_role"()) in ('admin', 'staff'));

drop policy if exists "lesson_templates: admin insert" on public.lesson_templates;
create policy "lesson_templates: admin insert"
  on public.lesson_templates for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "lesson_templates: admin update" on public.lesson_templates;
create policy "lesson_templates: admin update"
  on public.lesson_templates for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "lesson_templates: admin delete" on public.lesson_templates;
create policy "lesson_templates: admin delete"
  on public.lesson_templates for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- Policies — lesson_instances: admin CRUD, staff read all, parents read only
-- the instances one of their own riders is in.
-- =============================================================================
drop policy if exists "lesson_instances: read (admin/staff all, parent own riders)" on public.lesson_instances;
create policy "lesson_instances: read (admin/staff all, parent own riders)"
  on public.lesson_instances for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (
      (select public."current_role"()) = 'parent'
      and public.family_sees_instance(id)
    )
  );

drop policy if exists "lesson_instances: admin insert" on public.lesson_instances;
create policy "lesson_instances: admin insert"
  on public.lesson_instances for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "lesson_instances: admin update" on public.lesson_instances;
create policy "lesson_instances: admin update"
  on public.lesson_instances for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "lesson_instances: admin delete" on public.lesson_instances;
create policy "lesson_instances: admin delete"
  on public.lesson_instances for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- Policies — lesson_riders
--   admin  — full CRUD
--   staff  — read all
--   parent — read their own family's rows; UPDATE them only to cancel
--
-- The row policy decides WHICH ROWS a parent may write. The trigger below
-- decides WHICH COLUMNS and WHICH STATUS TRANSITIONS, because a row policy
-- alone would let a parent flip a cancellation back to 'booked', or promote it
-- to 'backfilled', or move the booking to a different lesson.
-- =============================================================================
drop policy if exists "lesson_riders: read (admin/staff all, parent own family)" on public.lesson_riders;
create policy "lesson_riders: read (admin/staff all, parent own family)"
  on public.lesson_riders for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (
      (select public."current_role"()) = 'parent'
      and public.family_owns_rider(rider_id)
    )
  );

drop policy if exists "lesson_riders: admin insert" on public.lesson_riders;
create policy "lesson_riders: admin insert"
  on public.lesson_riders for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "lesson_riders: update (admin any, parent own riders)" on public.lesson_riders;
create policy "lesson_riders: update (admin any, parent own riders)"
  on public.lesson_riders for update to authenticated
  using (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'parent'
      and public.family_owns_rider(rider_id)
    )
  )
  with check (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'parent'
      and public.family_owns_rider(rider_id)
    )
  );

drop policy if exists "lesson_riders: admin delete" on public.lesson_riders;
create policy "lesson_riders: admin delete"
  on public.lesson_riders for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- -----------------------------------------------------------------------------
-- Column and transition guard for parent cancellations.
-- -----------------------------------------------------------------------------
create or replace function public.lesson_riders_guard_parent_updates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  -- Service-role / server-side call; already bypasses RLS.
  if auth.uid() is null then
    return new;
  end if;

  v_role := (select public."current_role"());

  if v_role = 'admin' then
    return new;
  end if;

  if v_role is distinct from 'parent' then
    raise exception 'Only an admin or the rider''s own family may change a booking.'
      using errcode = '42501';
  end if;

  if new.instance_id is distinct from old.instance_id
     or new.rider_id is distinct from old.rider_id
     or new.id       is distinct from old.id
  then
    raise exception 'A booking cannot be moved to a different rider or lesson.'
      using errcode = '42501';
  end if;

  -- Cancelling is the only transition a parent has. Notably this blocks
  -- 'cancelled' -> 'booked' (re-booking a released slot behind the barn's back)
  -- and anything -> 'backfilled' (that is the barn's decision, in slice 3b).
  if new.status is distinct from old.status and new.status <> 'cancelled' then
    raise exception 'A family may only cancel a booking. Contact the barn to rebook.'
      using errcode = '42501';
  end if;

  -- Stamp the cancellation so the admin view and the future backfill engine
  -- can tell when the slot was released.
  if new.status = 'cancelled' and new.cancelled_at is null then
    new.cancelled_at := now();
  end if;

  return new;
end;
$$;

comment on function public.lesson_riders_guard_parent_updates() is
  'Restricts parent updates on lesson_riders to cancelling their own rider''s booking.';

drop trigger if exists lesson_riders_guard_parent_updates on public.lesson_riders;

create trigger lesson_riders_guard_parent_updates
  before update on public.lesson_riders
  for each row
  execute function public.lesson_riders_guard_parent_updates();

-- -----------------------------------------------------------------------------
-- Notify the barn when a family cancels.
--
-- In the database rather than the server action so the admin finds out no
-- matter which path released the slot. The CUTOFF decision — whether this
-- cancellation is late enough to skip backfill — deliberately does NOT live
-- here: backfillCutoffMinutes is a per-barn config value, and duplicating it in
-- SQL would give it a second home that a clone would forget to change. The
-- trigger reports the fact and the lesson time; the app applies the policy.
--
-- TODO (slice 3b): the backfill engine hooks in here — on a cancellation
-- outside the cutoff, open the slot and create backfill_offers.
-- TODO (deferred): email mirror via Resend, honouring notification_prefs.
-- -----------------------------------------------------------------------------
create or replace function public.lesson_riders_notify_cancellation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider_name text;
  v_date       date;
  v_start      time;
begin
  -- Only on a genuine transition into 'cancelled', and only when a real user
  -- did it (an admin cancelling on the phone does not need to notify herself).
  if new.status <> 'cancelled' or old.status = 'cancelled' then
    return new;
  end if;

  if (select public."current_role"()) is distinct from 'parent' then
    return new;
  end if;

  select r.name into v_rider_name from public.riders r where r.id = new.rider_id;
  select li.date, li.start_time into v_date, v_start
    from public.lesson_instances li where li.id = new.instance_id;

  insert into public.notifications (profile_id, type, title, body, link_path)
  select p.id,
         'lesson_cancelled',
         coalesce(v_rider_name, 'A rider') || ' cancelled a lesson',
         to_char(v_date, 'Dy DD Mon') || ' at ' || to_char(v_start, 'HH12:MI am'),
         '/schedule'
    from public.profiles p
   where p.role = 'admin';

  return new;
end;
$$;

comment on function public.lesson_riders_notify_cancellation() is
  'Notifies admins when a family cancels a booking. Cutoff policy lives in the app, not here.';

drop trigger if exists lesson_riders_notify_cancellation on public.lesson_riders;

create trigger lesson_riders_notify_cancellation
  after update on public.lesson_riders
  for each row
  execute function public.lesson_riders_notify_cancellation();

-- =============================================================================
-- generate_lesson_instances(through_date, from_date) — materialise the schedule
--
-- Idempotent via the partial unique index plus ON CONFLICT DO NOTHING, so it is
-- safe to run repeatedly and correctly reports 0 when there is nothing new.
--
-- from_date exists because current_date is UTC. For a barn on America/New_York
-- anything after 20:00 local is already tomorrow in UTC, so defaulting the
-- start to current_date would quietly skip the rest of today. The app passes
-- the barn's own calendar date; the default is a fallback for manual SQL use.
--
-- TODO (deferred): a nightly cron should call this. For now the admin triggers
-- it from the Schedule screen.
-- =============================================================================
create or replace function public.generate_lesson_instances(
  through_date date default (current_date + 28),
  from_date    date default current_date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer;
begin
  if (select public."current_role"()) is distinct from 'admin' then
    raise exception 'Only an admin may generate lesson instances.' using errcode = '42501';
  end if;

  if through_date < from_date then
    return 0;
  end if;

  insert into public.lesson_instances
    (template_id, date, start_time, duration_min, type, instructor_id, status)
  select t.id, d::date, t.start_time, t.duration_min, t.type, t.instructor_id, 'scheduled'
    from public.lesson_templates t
    cross join generate_series(from_date::timestamp, through_date::timestamp, interval '1 day') as d
   where t.active
     and extract(isodow from d) = t.weekday
  on conflict (template_id, date) where template_id is not null do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

comment on function public.generate_lesson_instances(date, date) is
  'Materialises lesson_instances from active templates across a date range. Idempotent; admin-only; returns the count created.';

revoke all on function public.generate_lesson_instances(date, date) from public;
grant execute on function public.generate_lesson_instances(date, date) to authenticated;

commit;
