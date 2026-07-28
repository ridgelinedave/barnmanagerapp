-- =============================================================================
-- 0009 — punches + pay_periods + timesheet_approvals (Phase 1, slice 4)
--
-- Staff clock in and out; the barn reviews the week and approves it. This is
-- the table that decides what people get paid, so it is built as an APPEND-ONLY
-- LEDGER, not an editable record.
--
-- THE CENTRAL RULE: a punch is never updated and never deleted, by anybody.
-- There is no UPDATE policy and no DELETE policy on `punches` for any role —
-- not staff, not admin. A mistake is corrected by INSERTING an adjusting row
-- that points at the original (source='admin_adjustment', adjusts_punch_id,
-- note). The original stays. That is what makes the ledger worth trusting when
-- someone disputes their hours six weeks later: nothing that was recorded can
-- quietly stop being true.
--
-- The geofence deliberately does NOT live here. barn.geofence is per-barn
-- config; hard-coding coordinates in SQL would give a clone a second place to
-- change and a silent way to get it wrong. The app decides what is flagged; the
-- database just records lat/lng, or null when the phone declined.
--
-- NOT APPLIED BY THIS REPO WHEN PASTED BY HAND. Idempotent, safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- punches — the ledger.
-- -----------------------------------------------------------------------------
create table if not exists public.punches (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  direction        text not null check (direction in ('in', 'out')),
  punched_at       timestamptz not null default now(),
  -- Null when the phone refused location. Recorded, never required: a punch
  -- must never fail because someone denied GPS, it is only flagged.
  lat              numeric,
  lng              numeric,
  source           text not null default 'self' check (source in ('self', 'admin_adjustment')),
  adjusts_punch_id uuid references public.punches (id) on delete set null,
  note             text not null default '',
  -- An adjustment says what it is correcting and why; a self punch does
  -- neither. Without this an "adjustment" could appear from nowhere with no
  -- explanation, which is exactly what an audit trail must not allow.
  constraint punches_adjustment_shape check (
    (source = 'admin_adjustment' and adjusts_punch_id is not null and length(btrim(note)) > 0)
    or (source = 'self' and adjusts_punch_id is null)
  )
);

alter table public.punches enable row level security;

create index if not exists punches_profile_time_idx on public.punches (profile_id, punched_at desc);
create index if not exists punches_time_idx on public.punches (punched_at desc);
create index if not exists punches_adjusts_idx on public.punches (adjusts_punch_id);

comment on table public.punches is
  'Append-only time clock ledger. No UPDATE or DELETE policy exists for any role; corrections are new adjusting rows.';

-- -----------------------------------------------------------------------------
-- pay_periods
-- -----------------------------------------------------------------------------
create table if not exists public.pay_periods (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  start_date date not null,
  end_date   date not null,
  status     text not null default 'open' check (status in ('open', 'approved', 'synced')),
  constraint pay_periods_dates_ordered check (end_date >= start_date),
  constraint pay_periods_unique_span unique (start_date, end_date)
);

alter table public.pay_periods enable row level security;

create index if not exists pay_periods_status_idx on public.pay_periods (status, start_date desc);

-- -----------------------------------------------------------------------------
-- timesheet_approvals — one row per employee per period.
-- -----------------------------------------------------------------------------
create table if not exists public.timesheet_approvals (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  period_id     uuid not null references public.pay_periods (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  total_minutes integer not null default 0 check (total_minutes >= 0),
  approved_by   uuid references public.profiles (id) on delete set null,
  approved_at   timestamptz,
  -- The QuickBooks seam. QBO returns TimeActivity ids on sync; storing them
  -- here is what makes a re-sync update rather than duplicate. Nothing writes
  -- it yet — the API integration is deferred.
  external_ref  jsonb,
  constraint timesheet_approvals_one_per_person_per_period unique (period_id, profile_id)
);

alter table public.timesheet_approvals enable row level security;

create index if not exists timesheet_approvals_profile_idx
  on public.timesheet_approvals (profile_id, period_id);

comment on column public.timesheet_approvals.external_ref is
  'QuickBooks TimeActivity ids, for idempotent re-sync. Deferred; nothing writes this yet.';

-- =============================================================================
-- Policies — punches
--
--   admin  — SELECT all, INSERT corrections only
--   staff  — SELECT own, INSERT own self-punches only
--   parent — nothing
--
-- Note what is absent: no UPDATE, no DELETE, for anyone. That absence is the
-- feature. Adding either later would silently turn an audit trail into a
-- spreadsheet.
-- =============================================================================
drop policy if exists "punches: read (admin all, staff own)" on public.punches;
create policy "punches: read (admin all, staff own)"
  on public.punches for select to authenticated
  using (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'staff'
      and profile_id = (select public.current_profile())
    )
  );

-- Staff may only ever add their own self-punch. The WITH CHECK pins the
-- profile to the caller and the shape to 'self'; the trigger below re-states
-- it, because a WITH CHECK that is edited later would fail open and silently.
drop policy if exists "punches: staff insert own self-punch" on public.punches;
create policy "punches: staff insert own self-punch"
  on public.punches for insert to authenticated
  with check (
    (select public."current_role"()) = 'staff'
    and profile_id = (select public.current_profile())
    and source = 'self'
    and adjusts_punch_id is null
  );

-- Admin may only ever add a correction. An admin who wants to punch for
-- themselves is a staff-shaped action and is not what this policy is for.
drop policy if exists "punches: admin insert correction" on public.punches;
create policy "punches: admin insert correction"
  on public.punches for insert to authenticated
  with check (
    (select public."current_role"()) = 'admin'
    and source = 'admin_adjustment'
    and adjusts_punch_id is not null
  );

-- =============================================================================
-- Policies — pay_periods: admin CRUD, staff read (they need to see the span
-- their approved hours belong to).
-- =============================================================================
drop policy if exists "pay_periods: read (admin/staff)" on public.pay_periods;
create policy "pay_periods: read (admin/staff)"
  on public.pay_periods for select to authenticated
  using ((select public."current_role"()) in ('admin', 'staff'));

drop policy if exists "pay_periods: admin insert" on public.pay_periods;
create policy "pay_periods: admin insert"
  on public.pay_periods for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "pay_periods: admin update" on public.pay_periods;
create policy "pay_periods: admin update"
  on public.pay_periods for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "pay_periods: admin delete" on public.pay_periods;
create policy "pay_periods: admin delete"
  on public.pay_periods for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- Policies — timesheet_approvals: admin CRUD, staff read only their own.
-- =============================================================================
drop policy if exists "timesheet_approvals: read (admin all, staff own)" on public.timesheet_approvals;
create policy "timesheet_approvals: read (admin all, staff own)"
  on public.timesheet_approvals for select to authenticated
  using (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'staff'
      and profile_id = (select public.current_profile())
    )
  );

drop policy if exists "timesheet_approvals: admin insert" on public.timesheet_approvals;
create policy "timesheet_approvals: admin insert"
  on public.timesheet_approvals for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "timesheet_approvals: admin update" on public.timesheet_approvals;
create policy "timesheet_approvals: admin update"
  on public.timesheet_approvals for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "timesheet_approvals: admin delete" on public.timesheet_approvals;
create policy "timesheet_approvals: admin delete"
  on public.timesheet_approvals for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- Insert guard.
--
-- Restates the policy rules as a trigger. Two reasons that is not redundant:
-- a WITH CHECK edited later fails open with no noise, and a trigger can say
-- WHY in language the admin reading the logs will understand. It also pins
-- `profile_id` for staff even if a future policy is loosened.
-- =============================================================================
create or replace function public.punches_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role    text;
  v_profile uuid;
begin
  -- Service-role / server-side call; already bypasses RLS.
  if auth.uid() is null then
    return new;
  end if;

  select p.role, p.id into v_role, v_profile
    from public.profiles p where p.user_id = auth.uid();

  if v_role = 'admin' then
    if new.source <> 'admin_adjustment' or new.adjusts_punch_id is null then
      raise exception 'An admin may only add a correction, which must reference the punch it adjusts.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if v_role is distinct from 'staff' then
    raise exception 'Only staff may clock in and out.' using errcode = '42501';
  end if;

  if new.profile_id is distinct from v_profile then
    raise exception 'You can only clock in for yourself.' using errcode = '42501';
  end if;

  if new.source <> 'self' or new.adjusts_punch_id is not null then
    raise exception 'Staff punches are self-recorded; corrections are made by the barn.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.punches_guard_insert() is
  'Restates the punches INSERT policies as a trigger, so a loosened WITH CHECK cannot fail open silently.';

drop trigger if exists punches_guard_insert on public.punches;

create trigger punches_guard_insert
  before insert on public.punches
  for each row
  execute function public.punches_guard_insert();

commit;
