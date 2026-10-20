-- =============================================================================
-- 0026 — people model: client status, and a rider optionally linked to a login.
--
-- PRINTED FOR AUDIT, NOT APPLIED (2026-10-20).
--
-- THE MODEL. One structure covers every real case, with no special cases:
--   CLIENT  = public.families. The account that pays. May have riders, may
--             have horses, may ride.
--   RIDER   = public.riders. Takes lessons. OPTIONALLY linked to a login
--             (riders.profile_id, below).
--   HORSE   = public.horses. Optionally owned by a client (owner_family_id).
-- Then, derived from data rather than stored:
--   boarder          a client with horses and no riders
--   lesson family    a client with riders
--   adult amateur    a client whose own profile is linked as a rider
--   working student  a STAFF login linked as a rider on her parents' client
--
-- NAMING. The role VALUE stays 'parent' in the database. It is in the
-- profiles CHECK constraint, in invites, in the dev-role cookie, in roughly
-- forty policies and definer functions across 0003-0023, and in every
-- existing profiles row. Renaming it means rewriting all of those in one
-- transaction against a live barn for no change in behaviour; a miss is a
-- policy that silently stops matching and locks every client out. So the
-- identifier is stable and every USER-FACING string says "client". The
-- table is still `families` for the same reason.
--
-- -----------------------------------------------------------------------------
-- 1. CLIENT STATUS — families.status
-- -----------------------------------------------------------------------------
-- 'active' | 'inactive' | 'on_break'. Admin-set: families already has an
-- admin-only UPDATE policy (0003), so no new policy is needed — a client
-- cannot change their own status.
--
-- WHAT IT AFFECTS
--   lesson generation  book_enrolments() (0025) books only riders whose client
--                      is 'active'. On a break or inactive: no new series
--                      bookings. Bookings already made are left alone — the
--                      admin decides about a lesson that is already on the
--                      board.
--   lists              the client list shows every status; inactive clients
--                      sort last. Nothing is hidden from the admin.
--   reminders          unchanged. A reminder is about a booking that exists;
--                      if the client is on a break and still has a booked
--                      lesson, they should still be reminded of it.
--
-- -----------------------------------------------------------------------------
-- 2. riders.profile_id — the rider's own login, ADMIN-SET ONLY
-- -----------------------------------------------------------------------------
-- Enforced by the DATABASE, not the app:
--
--   (a) A client can never point their own profile at someone else's rider —
--       or at any rider. riders already has admin-only INSERT and UPDATE
--       policies (0003); the guard trigger below is the second lock, refusing
--       any write that sets or changes profile_id unless the caller is admin,
--       so a future policy that widens riders UPDATE (e.g. "a client may edit
--       their rider's photo", Phase 5) cannot silently widen this column with
--       it. Row policy + guard trigger, the house rule for constrained writes.
--   (b) A linked profile sees THEIR OWN rider record and nothing else. One
--       new SELECT policy, gated on profile_id = current_profile() — never on
--       "is staff". A working student is staff, and staff already read every
--       rider, so for her this policy adds nothing; for an adult amateur on a
--       client login it adds exactly one row, which their family path already
--       returns anyway. It grants no lessons, no horses, no family.
--   (c) The existing family path is unchanged: "riders: read (admin/staff all,
--       parent own family)" is not touched. The suite's control proves a
--       client still sees their own riders exactly as now.
--
-- One login, at most one rider: a partial unique index. Two rider records
-- claiming one person is a data error, not a feature.
--
-- Idempotent: if-not-exists / create-or-replace / drop-if-exists.
-- =============================================================================

begin;

-- 1. Client status ------------------------------------------------------------
alter table public.families
  add column if not exists status text not null default 'active';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'families_status_valid') then
    alter table public.families
      add constraint families_status_valid check (status in ('active', 'inactive', 'on_break'));
  end if;
end $$;

create index if not exists families_status_idx on public.families (status);

comment on column public.families.status is
  'Client status: active | inactive | on_break. Admin-set. Only active clients get new series bookings.';

-- 2. riders.profile_id --------------------------------------------------------
alter table public.riders
  add column if not exists profile_id uuid references public.profiles (id) on delete set null;

create unique index if not exists riders_profile_id_unique
  on public.riders (profile_id) where profile_id is not null;

comment on column public.riders.profile_id is
  'The rider''s own login, when they have one (adult amateur, working student). Admin-set only.';

create or replace function public.riders_guard_profile_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- No caller identity: db:seed and migration backfills write riders this way,
  -- so this early return stays.
  -- This trigger does NOT bind the service role, unlike
  -- enforce_at_least_one_admin (0016), which refuses for everyone. Any
  -- server-side path that sets riders.profile_id is UNGUARDED and must
  -- validate its own caller.
  if auth.uid() is null then
    return new;
  end if;

  if (tg_op = 'INSERT' and new.profile_id is not null)
     or (tg_op = 'UPDATE' and new.profile_id is distinct from old.profile_id) then
    if (select public."current_role"()) is distinct from 'admin' then
      raise exception 'Only an admin may link a rider to a login.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.riders_guard_profile_link() is
  'Refuses any non-admin write that sets or changes riders.profile_id.';

revoke all on function public.riders_guard_profile_link() from public, anon, authenticated;

drop trigger if exists riders_guard_profile_link on public.riders;
create trigger riders_guard_profile_link
  before insert or update on public.riders
  for each row execute function public.riders_guard_profile_link();

drop policy if exists "riders: linked profile reads own" on public.riders;
create policy "riders: linked profile reads own"
  on public.riders for select to authenticated
  using (profile_id = (select public.current_profile()));

-- 3. book_enrolments() skips clients who are not active ----------------------
-- Only if 0025 is already applied (the function exists); otherwise 0025's
-- version should be applied AFTER this file with its Phase 4 line uncommented.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'book_enrolments'
  ) then
    execute $f$
      create or replace function public.book_enrolments(from_date date, through_date date)
      returns integer
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      declare
        v_booked integer := 0;
        r record;
      begin
        if (select public."current_role"()) is distinct from 'admin' then
          raise exception 'Only an admin may book enrolments.' using errcode = '42501';
        end if;
        if through_date < from_date then
          return 0;
        end if;
        for r in
          select e.id as enrolment_id, e.rider_id, e.horse_id, li.id as instance_id, li.max_riders
            from public.lesson_enrolments e
            join public.riders rd on rd.id = e.rider_id
            join public.families f on f.id = rd.family_id
            join public.lesson_instances li on li.template_id = e.template_id
           where rd.active
             and f.status = 'active'
             and li.status = 'scheduled'
             and li.date between greatest(from_date, e.anchor_date)
                             and least(through_date, coalesce(e.ends_on, through_date))
             and ((li.date - e.anchor_date) % (7 * e.interval_weeks)) = 0
           order by li.date, li.start_time, e.created_at
        loop
          if (select count(*) from public.lesson_riders lr
               where lr.instance_id = r.instance_id
                 and lr.status in ('booked', 'backfilled')) >= r.max_riders then
            continue;
          end if;
          insert into public.lesson_riders (instance_id, rider_id, status, horse_id, enrolment_id)
          values (r.instance_id, r.rider_id, 'booked', r.horse_id, r.enrolment_id)
          on conflict (instance_id, rider_id) do nothing;
          if found then
            v_booked := v_booked + 1;
          end if;
        end loop;
        return v_booked;
      end;
      $body$;
    $f$;
    execute 'revoke all on function public.book_enrolments(date, date) from public, anon, authenticated';
    execute 'grant execute on function public.book_enrolments(date, date) to authenticated';
  end if;
end $$;

commit;

-- -----------------------------------------------------------------------------
-- SUITE CHANGES THAT LAND WITH IT (tests/policies.test.mjs)
--   control  client (parent fixture) reads their own riders — same ids, same
--            count as before this migration (the family path, unchanged).
--   control  admin links the staff fixture to the control family's rider;
--            the staff login reads that rider (already true via staff read —
--            so the PROOF uses a client login: admin links the parent2
--            fixture's profile to one of parent2's riders and parent2 reads
--            it; then a fresh unlinked rider in ANOTHER family is linked to
--            parent2 and parent2 reads exactly that one extra row, nothing
--            else from that family).
--   deny     client sets profile_id on their own rider → refused (policy and
--            42501 from the guard), re-read unchanged.
--   deny     client sets profile_id on another family's rider → 0 rows,
--            re-read unchanged.
--   deny     staff (non-admin) sets profile_id → 42501, re-read unchanged.
--   deny     a linked client reads the linked rider's FAMILY row, its other
--            riders, its horses → nothing new beyond their own family.
--   status   client updates their own families.status → 0 rows, unchanged;
--            admin sets on_break → book_enrolments skips that client's rider.
--   definer  riders_guard_profile_link is in the internal inventory; anon
--            cannot execute it.
-- -----------------------------------------------------------------------------
