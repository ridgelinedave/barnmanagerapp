-- =============================================================================
-- 0008 — backfill engine + lesson reminders (Phase 1, slice 3b)
--
-- When a family cancels, the released seat is offered to eligible riders and
-- the first parent to accept gets it. Everything that decides who gets the seat
-- runs inside the database, because two parents tapping Accept at the same
-- moment is a race, and a race adjudicated in application code is a race with
-- extra steps.
--
-- THREE THINGS IN HERE ARE SUBTLE. Read these before changing anything.
--
--   1. LOCK ORDER (instance first, then offer). Accepting locks the lesson
--      instance and then the offer. Doing it the other way round deadlocks:
--      transaction A holds offer_A and wants the instance; B holds offer_B and
--      wants the instance; whoever wins the instance then tries to expire the
--      other's offer and blocks on a lock the loser is still holding. Locking
--      the instance first makes the whole critical section single-file, so by
--      the time a second accept gets in, it simply finds no seat.
--
--   2. THE GUARD BYPASS. lesson_riders_guard_parent_updates() refuses any
--      parent-driven transition to 'backfilled'. That is correct and must
--      stay — but the engine writes exactly that row while auth.uid() is still
--      the accepting parent, because SECURITY DEFINER changes the executing
--      role, not the JWT. The engine therefore raises a transaction-local flag
--      the guard honours. A parent still cannot reach 'backfilled' directly:
--      the flag is only ever set inside these functions, and set_config lives
--      in pg_catalog, which PostgREST does not expose.
--
--   3. CAPACITY LIVES ON THE INSTANCE, not the template. See the max_riders
--      note below.
--
-- NOT APPLIED BY THIS REPO. Paste into the Supabase SQL Editor. Safe to re-run.
-- =============================================================================

begin;

-- =============================================================================
-- lesson_instances gains the two facts backfill needs to make a decision.
--
-- Both are copied from the template rather than read through it. A template can
-- be paused, edited or deleted after its instances exist — and the FK is
-- ON DELETE SET NULL — so reading capacity or level "through" template_id would
-- make a lesson's own rules change retroactively, or vanish entirely.
--
-- max_riders is not in the slice brief; it is required. "Is there a seat free"
-- is capacity minus active riders, and without it a one-off lesson (which has
-- no template at all) has no capacity to compare against.
-- =============================================================================
alter table public.lesson_instances
  add column if not exists level_id uuid references public.levels (id) on delete set null;

alter table public.lesson_instances
  add column if not exists max_riders integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lesson_instances_max_riders_positive'
  ) then
    alter table public.lesson_instances
      add constraint lesson_instances_max_riders_positive check (max_riders >= 1);
  end if;
end $$;

-- Backfill existing rows from their template. Idempotent: only fills gaps.
update public.lesson_instances li
   set level_id = t.level_id
  from public.lesson_templates t
 where li.template_id = t.id
   and li.level_id is null
   and t.level_id is not null;

update public.lesson_instances li
   set max_riders = t.max_riders
  from public.lesson_templates t
 where li.template_id = t.id
   and li.max_riders is distinct from t.max_riders;

create index if not exists lesson_instances_level_idx on public.lesson_instances (level_id);

comment on column public.lesson_instances.level_id is
  'Eligibility filter for backfill. Null means any level may fill a released seat.';
comment on column public.lesson_instances.max_riders is
  'Seat count for this lesson, copied from the template at generation time.';

-- =============================================================================
-- backfill_offers — "a seat opened, do you want it?"
-- =============================================================================
create table if not exists public.backfill_offers (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  instance_id  uuid not null references public.lesson_instances (id) on delete cascade,
  rider_id     uuid not null references public.riders (id) on delete cascade,
  offered_by   uuid references public.profiles (id) on delete set null,
  status       text not null default 'sent'
                 check (status in ('sent', 'accepted', 'declined', 'expired')),
  responded_at timestamptz
);

alter table public.backfill_offers enable row level security;

-- At most one OUTSTANDING offer per rider per lesson. Partial, so the history
-- of declined and expired offers is kept — re-offering a seat to someone who
-- declined last week is legitimate.
create unique index if not exists backfill_offers_one_outstanding
  on public.backfill_offers (instance_id, rider_id)
  where status = 'sent';

create index if not exists backfill_offers_instance_idx
  on public.backfill_offers (instance_id, status);
create index if not exists backfill_offers_rider_idx
  on public.backfill_offers (rider_id, status);

comment on table public.backfill_offers is
  'Offers of a released lesson seat. Parents respond via respond_to_backfill_offer(), never by writing here.';

-- -----------------------------------------------------------------------------
-- Policies. Parents may READ their own riders' offers so the app can show them;
-- every write goes through the engine, which is why there is no parent
-- insert/update/delete policy at all.
-- -----------------------------------------------------------------------------
drop policy if exists "backfill_offers: read (admin/staff all, parent own riders)" on public.backfill_offers;
create policy "backfill_offers: read (admin/staff all, parent own riders)"
  on public.backfill_offers for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (
      (select public."current_role"()) = 'parent'
      and public.family_owns_rider(rider_id)
    )
  );

drop policy if exists "backfill_offers: admin insert" on public.backfill_offers;
create policy "backfill_offers: admin insert"
  on public.backfill_offers for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "backfill_offers: admin update" on public.backfill_offers;
create policy "backfill_offers: admin update"
  on public.backfill_offers for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "backfill_offers: admin delete" on public.backfill_offers;
create policy "backfill_offers: admin delete"
  on public.backfill_offers for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- The guard bypass (trap 2 in the header).
--
-- Replaces the slice-3a guard, adding one early return. Everything else is
-- unchanged: a parent still may only cancel, still may not move a booking, and
-- still may not set 'backfilled' through the API.
-- =============================================================================
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

  -- The backfill engine is writing. Only the SECURITY DEFINER functions in this
  -- migration ever raise this flag, and they clear it immediately afterwards;
  -- it is transaction-local, so it cannot leak into another request. A client
  -- cannot set it: PostgREST exposes only the `public` schema, and set_config
  -- is in pg_catalog.
  if coalesce(current_setting('app.backfill_engine', true), '') = '1' then
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

  if new.status is distinct from old.status and new.status <> 'cancelled' then
    raise exception 'A family may only cancel a booking. Contact the barn to rebook.'
      using errcode = '42501';
  end if;

  if new.status = 'cancelled' and new.cancelled_at is null then
    new.cancelled_at := now();
  end if;

  return new;
end;
$$;

-- =============================================================================
-- family_sees_instance gains a second reason to say yes.
--
-- Slice 3a only granted a family sight of a lesson one of their riders was
-- already IN. A backfill offer is exactly the case where they are NOT in it
-- yet — so without this, the offer card would arrive with no lesson to show:
-- the parent could read the offer row but not its date, time or instructor.
--
-- Visibility lasts only while the offer is outstanding. Accept and the first
-- branch takes over; decline or let it expire and the lesson goes back to being
-- none of their business.
-- =============================================================================
create or replace function public.family_sees_instance(instance uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.current_family() is not null
    and (
      exists (
        select 1
          from public.lesson_riders lr
          join public.riders r on r.id = lr.rider_id
         where lr.instance_id = instance
           and r.family_id = public.current_family()
      )
      or exists (
        select 1
          from public.backfill_offers o
          join public.riders r on r.id = o.rider_id
         where o.instance_id = instance
           and o.status = 'sent'
           and r.family_id = public.current_family()
      )
    );
$$;

-- =============================================================================
-- Internal helpers
-- =============================================================================

-- Notify every parent of a rider's family.
create or replace function public.notify_rider_family(
  rider uuid, kind text, title text, body text, link_path text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (profile_id, type, title, body, link_path)
  select p.id, kind, title, body, link_path
    from public.riders r
    join public.profiles p on p.family_id = r.family_id and p.role = 'parent'
   where r.id = rider;
$$;

-- Notify every admin.
create or replace function public.notify_admins(
  kind text, title text, body text, link_path text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (profile_id, type, title, body, link_path)
  select p.id, kind, title, body, link_path
    from public.profiles p
   where p.role = 'admin';
$$;

-- Seats currently taken. 'cancelled' rows are not taken; 'booked' and
-- 'backfilled' both are.
create or replace function public.instance_taken_seats(instance uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.lesson_riders lr
   where lr.instance_id = instance
     and lr.status in ('booked', 'backfilled');
$$;

-- Riders who could take a released seat: active, right level, not already in.
create or replace function public.eligible_backfill_riders(instance uuid)
returns table (id uuid, name text, level_id uuid, family_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.name, r.level_id, r.family_id
    from public.riders r
    cross join lateral (
      select li.level_id as instance_level
        from public.lesson_instances li
       where li.id = instance
    ) inst
   where (select public."current_role"()) in ('admin', 'staff')
     and r.active
     -- A lesson with no level set is open to anyone.
     and (inst.instance_level is null or r.level_id = inst.instance_level)
     and not exists (
       select 1 from public.lesson_riders lr
        where lr.instance_id = instance
          and lr.rider_id = r.id
          and lr.status in ('booked', 'backfilled')
     )
   order by r.name;
$$;

comment on function public.eligible_backfill_riders(uuid) is
  'Riders eligible to fill a released seat. Returns nothing unless the caller is admin or staff.';

revoke all on function public.eligible_backfill_riders(uuid) from public;
grant execute on function public.eligible_backfill_riders(uuid) to authenticated;

-- =============================================================================
-- Booking primitive, shared by the accept path and the direct-assign path.
--
-- Upserts so a rider who cancelled and is re-offered the same lesson is
-- restored rather than colliding with their old row. Raises if the lesson is
-- already full, so no caller can overfill by forgetting to check.
--
-- The caller must already hold the instance lock.
-- =============================================================================
create or replace function public.backfill_book_rider(instance uuid, rider uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity integer;
begin
  select li.max_riders into v_capacity
    from public.lesson_instances li where li.id = instance;

  if v_capacity is null then
    raise exception 'That lesson no longer exists.' using errcode = 'P0002';
  end if;

  if public.instance_taken_seats(instance) >= v_capacity then
    raise exception 'That lesson is already full.' using errcode = 'P0001';
  end if;

  -- Trap 2: let the guard know this is the engine, not a parent freelancing.
  perform set_config('app.backfill_engine', '1', true);

  insert into public.lesson_riders (instance_id, rider_id, status, cancelled_at)
  values (instance, rider, 'backfilled', null)
  on conflict (instance_id, rider_id)
  do update set status = 'backfilled', cancelled_at = null;

  perform set_config('app.backfill_engine', '', true);
end;
$$;

-- =============================================================================
-- Lock down the internal primitives.
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and PostgREST
-- exposes every function in `public` as an RPC endpoint. Left alone, a parent
-- could call backfill_book_rider() directly and seat any rider in any lesson,
-- skipping offers, eligibility and the seat race entirely — the engine's whole
-- purpose, bypassed by one HTTP call. These three are internal: only the gated
-- functions above may call them, and SECURITY DEFINER means they still run with
-- the privileges they need when called from inside.
-- =============================================================================
revoke all on function public.backfill_book_rider(uuid, uuid) from public;
revoke all on function public.notify_rider_family(uuid, text, text, text, text) from public;
revoke all on function public.notify_admins(text, text, text, text) from public;

-- Read-only seat count. Harmless to expose and used by the admin UI, so this
-- one stays callable.
grant execute on function public.instance_taken_seats(uuid) to authenticated;

-- =============================================================================
-- send_backfill_offers(instance, rider_ids) — admin only. Returns count sent.
-- =============================================================================
create or replace function public.send_backfill_offers(instance uuid, rider_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sent      integer := 0;
  v_profile   uuid;
  v_date      date;
  v_start     time;
  v_rider     uuid;
begin
  if (select public."current_role"()) is distinct from 'admin' then
    raise exception 'Only an admin may offer a lesson seat.' using errcode = '42501';
  end if;

  select li.date, li.start_time into v_date, v_start
    from public.lesson_instances li where li.id = instance;

  if v_date is null then
    raise exception 'That lesson no longer exists.' using errcode = 'P0002';
  end if;

  v_profile := (select public.current_profile());

  for v_rider in
    select r.id
      from public.riders r
     where r.id = any(rider_ids)
       -- Eligibility is re-checked here, not trusted from the UI.
       and r.id in (select e.id from public.eligible_backfill_riders(instance) e)
  loop
    insert into public.backfill_offers (instance_id, rider_id, offered_by, status)
    values (instance, v_rider, v_profile, 'sent')
    on conflict do nothing;

    if found then
      v_sent := v_sent + 1;
      perform public.notify_rider_family(
        v_rider,
        'backfill_offer',
        'A lesson spot opened up',
        to_char(v_date, 'Dy DD Mon') || ' at ' || to_char(v_start, 'HH12:MI am') ||
          ' — tap to accept or decline.',
        '/lessons'
      );
    end if;
  end loop;

  return v_sent;
end;
$$;

comment on function public.send_backfill_offers(uuid, uuid[]) is
  'Offers a released seat to eligible riders and notifies their families. Admin only; returns the number sent.';

revoke all on function public.send_backfill_offers(uuid, uuid[]) from public;
grant execute on function public.send_backfill_offers(uuid, uuid[]) to authenticated;

-- =============================================================================
-- respond_to_backfill_offer(offer, accept) — the race-safe heart of the slice.
--
-- Returns one of: 'accepted' | 'declined' | 'full' | 'unavailable'.
-- =============================================================================
create or replace function public.respond_to_backfill_offer(offer uuid, accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_instance_id uuid;
  v_offer       public.backfill_offers%rowtype;
  v_capacity    integer;
  v_status      text;
  v_date        date;
  v_start       time;
  v_rider_name  text;
  v_role        text;
  v_expired     integer := 0;
  sibling       record;
begin
  select o.instance_id into v_instance_id
    from public.backfill_offers o where o.id = offer;

  if v_instance_id is null then
    raise exception 'That offer no longer exists.' using errcode = 'P0002';
  end if;

  -- TRAP 1: lock the INSTANCE before the OFFER. Taking these in the other order
  -- deadlocks two simultaneous accepts. See the file header.
  select li.status, li.max_riders, li.date, li.start_time
    into v_status, v_capacity, v_date, v_start
    from public.lesson_instances li
   where li.id = v_instance_id
     for update;

  select * into v_offer
    from public.backfill_offers o
   where o.id = offer
     for update;

  v_role := (select public."current_role"());

  if v_role is distinct from 'admin'
     and not (v_role = 'parent' and public.family_owns_rider(v_offer.rider_id))
  then
    raise exception 'That offer belongs to another family.' using errcode = '42501';
  end if;

  -- Already answered, expired, or superseded. Not an error the parent caused.
  if v_offer.status <> 'sent' then
    return v_offer.status;
  end if;

  select r.name into v_rider_name from public.riders r where r.id = v_offer.rider_id;

  -- ---- decline -------------------------------------------------------------
  if not accept then
    update public.backfill_offers
       set status = 'declined', responded_at = now()
     where id = offer;

    perform public.notify_admins(
      'backfill_result',
      coalesce(v_rider_name, 'A rider') || ' declined a spot',
      to_char(v_date, 'Dy DD Mon') || ' at ' || to_char(v_start, 'HH12:MI am'),
      '/schedule'
    );
    return 'declined';
  end if;

  -- ---- accept --------------------------------------------------------------
  if v_status = 'cancelled' then
    update public.backfill_offers
       set status = 'expired', responded_at = now()
     where id = offer;
    perform public.notify_rider_family(
      v_offer.rider_id, 'backfill_result', 'That lesson was cancelled',
      'The barn cancelled the lesson, so the spot is no longer available.', '/lessons'
    );
    return 'unavailable';
  end if;

  if public.instance_taken_seats(v_instance_id) >= v_capacity then
    update public.backfill_offers
       set status = 'expired', responded_at = now()
     where id = offer;
    perform public.notify_rider_family(
      v_offer.rider_id, 'backfill_result', 'That spot was already taken',
      'Another rider accepted first. We''ll let you know next time one opens.', '/lessons'
    );
    return 'full';
  end if;

  perform public.backfill_book_rider(v_instance_id, v_offer.rider_id);

  update public.backfill_offers
     set status = 'accepted', responded_at = now()
   where id = offer;

  -- If that was the last seat, nobody else's outstanding offer can be honoured.
  if public.instance_taken_seats(v_instance_id) >= v_capacity then
    for sibling in
      select o.id, o.rider_id
        from public.backfill_offers o
       where o.instance_id = v_instance_id
         and o.status = 'sent'
         and o.id <> offer
    loop
      update public.backfill_offers
         set status = 'expired', responded_at = now()
       where id = sibling.id;

      perform public.notify_rider_family(
        sibling.rider_id, 'backfill_result', 'That spot has been filled',
        'Another rider took the ' || to_char(v_start, 'HH12:MI am') || ' spot on ' ||
          to_char(v_date, 'Dy DD Mon') || '.',
        '/lessons'
      );
      v_expired := v_expired + 1;
    end loop;
  end if;

  perform public.notify_rider_family(
    v_offer.rider_id, 'backfill_result', 'You got the spot',
    to_char(v_date, 'Dy DD Mon') || ' at ' || to_char(v_start, 'HH12:MI am') || ' is confirmed.',
    '/lessons'
  );

  perform public.notify_admins(
    'backfill_result',
    coalesce(v_rider_name, 'A rider') || ' accepted a spot',
    to_char(v_date, 'Dy DD Mon') || ' at ' || to_char(v_start, 'HH12:MI am') ||
      case when v_expired > 0 then ' — ' || v_expired || ' other offer(s) expired.' else '' end,
    '/schedule'
  );

  return 'accepted';
end;
$$;

comment on function public.respond_to_backfill_offer(uuid, boolean) is
  'Accept or decline a backfill offer. First accept wins, enforced by locking the lesson instance. Admin or the owning family only.';

revoke all on function public.respond_to_backfill_offer(uuid, boolean) from public;
grant execute on function public.respond_to_backfill_offer(uuid, boolean) to authenticated;

-- =============================================================================
-- admin_assign_backfill(instance, rider) — skip the offers, just place someone.
-- =============================================================================
create or replace function public.admin_assign_backfill(instance uuid, rider uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity integer;
  v_date     date;
  v_start    time;
  sibling    record;
begin
  if (select public."current_role"()) is distinct from 'admin' then
    raise exception 'Only an admin may assign a lesson seat.' using errcode = '42501';
  end if;

  select li.max_riders, li.date, li.start_time
    into v_capacity, v_date, v_start
    from public.lesson_instances li
   where li.id = instance
     for update;

  if v_capacity is null then
    raise exception 'That lesson no longer exists.' using errcode = 'P0002';
  end if;

  perform public.backfill_book_rider(instance, rider);

  update public.backfill_offers
     set status = 'accepted', responded_at = now()
   where instance_id = instance and rider_id = rider and status = 'sent';

  if public.instance_taken_seats(instance) >= v_capacity then
    for sibling in
      select o.id, o.rider_id from public.backfill_offers o
       where o.instance_id = instance and o.status = 'sent'
    loop
      update public.backfill_offers
         set status = 'expired', responded_at = now()
       where id = sibling.id;

      perform public.notify_rider_family(
        sibling.rider_id, 'backfill_result', 'That spot has been filled',
        'The barn filled the ' || to_char(v_start, 'HH12:MI am') || ' spot on ' ||
          to_char(v_date, 'Dy DD Mon') || '.',
        '/lessons'
      );
    end loop;
  end if;

  perform public.notify_rider_family(
    rider, 'backfill_result', 'You have a lesson spot',
    to_char(v_date, 'Dy DD Mon') || ' at ' || to_char(v_start, 'HH12:MI am') || ' is confirmed.',
    '/lessons'
  );

  return 'assigned';
end;
$$;

revoke all on function public.admin_assign_backfill(uuid, uuid) from public;
grant execute on function public.admin_assign_backfill(uuid, uuid) to authenticated;

-- =============================================================================
-- enqueue_lesson_reminders(target_date) — admin only, idempotent.
--
-- Idempotency is by (profile_id, type, link_path): the link carries the
-- instance id, so re-running never sends a family the same reminder twice.
--
-- TODO (deferred): a nightly cron should call this for tomorrow. For now the
-- admin triggers it from the Schedule screen.
-- TODO (deferred): email mirror via Resend, honouring notification_prefs.
-- =============================================================================
create or replace function public.enqueue_lesson_reminders(target_date date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer;
begin
  if (select public."current_role"()) is distinct from 'admin' then
    raise exception 'Only an admin may send lesson reminders.' using errcode = '42501';
  end if;

  insert into public.notifications (profile_id, type, title, body, link_path)
  select p.id,
         'lesson_reminder',
         r.name || ' has a lesson tomorrow',
         to_char(li.date, 'Dy DD Mon') || ' at ' || to_char(li.start_time, 'HH12:MI am'),
         '/lessons?instance=' || li.id
    from public.lesson_instances li
    join public.lesson_riders lr
      on lr.instance_id = li.id and lr.status in ('booked', 'backfilled')
    join public.riders r on r.id = lr.rider_id
    join public.profiles p on p.family_id = r.family_id and p.role = 'parent'
   where li.date = target_date
     and li.status = 'scheduled'
     and not exists (
       select 1 from public.notifications n
        where n.profile_id = p.id
          and n.type = 'lesson_reminder'
          and n.link_path = '/lessons?instance=' || li.id
     );

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

revoke all on function public.enqueue_lesson_reminders(date) from public;
grant execute on function public.enqueue_lesson_reminders(date) to authenticated;

-- =============================================================================
-- generate_lesson_instances — now carries level and capacity onto instances.
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
    (template_id, date, start_time, duration_min, type, instructor_id, status, level_id, max_riders)
  select t.id, d::date, t.start_time, t.duration_min, t.type, t.instructor_id, 'scheduled',
         t.level_id, t.max_riders
    from public.lesson_templates t
    cross join generate_series(from_date::timestamp, through_date::timestamp, interval '1 day') as d
   where t.active
     and extract(isodow from d) = t.weekday
  on conflict (template_id, date) where template_id is not null do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

commit;
