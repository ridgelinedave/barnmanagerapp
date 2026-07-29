-- =============================================================================
-- 0011 — care_events (Phase 2, slice 2)
--
-- Every vaccine, Coggins, dental, worming, farrier visit, vet call, medication
-- and wound, per horse, with what is due next.
--
-- THIS IS THE MOST SENSITIVE TABLE IN THE APP. A horse's medical history is
-- the owner's business and the barn's business, and nobody else's. Two rules
-- follow from that, and both are deliberately stricter than the horses table:
--
--   1. THERE IS NO BASICS TIER. A family whose rider merely rides a horse sees
--      ZERO care rows. Not a redacted view, not names-only — nothing. Horse
--      visibility needed a projection function because "some columns" is not
--      expressible as a row policy; care needs no such thing, because the
--      answer is not "fewer columns", it is "no rows". The parent branch of the
--      SELECT policy is family_owns_horse() and must NEVER become
--      family_rides_horse().
--
--   2. STAFF INSERT, AND ONLY INSERT. No UPDATE policy and no DELETE policy for
--      staff, the same append-only discipline as `punches`: a care log that the
--      person who wrote it can quietly rewrite is not a medical record. A
--      correction is made by the barn.
--
-- WHAT IS DELIBERATELY NOT COPIED FROM `punches`: performed_at is NOT pinned to
-- now(). A punch is an assertion about the present and a client-supplied time
-- is a way to invent paid hours; a care event is routinely logged after the
-- fact ("the vet came Tuesday"), so a past date is the normal case, not an
-- attack. `logged_by` IS forced to the caller, because attribution is what
-- makes the record worth anything.
--
-- Idempotent, safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- care_events
-- -----------------------------------------------------------------------------
create table if not exists public.care_events (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  horse_id     uuid not null references public.horses (id) on delete cascade,
  type         text not null check (
                 type in ('vaccine', 'coggins', 'dental', 'deworm',
                          'farrier', 'vet', 'medication', 'wound', 'other')
               ),
  description  text not null default '',
  -- The day the care happened. Routinely in the past; see the header.
  performed_at date not null,
  -- When it next falls due. Null for one-off events (a wound, a vet call).
  due_next     date,
  -- Forced to the caller by the trigger below. Nullable because the seed and
  -- future server-side jobs run without a profile.
  logged_by    uuid references public.profiles (id) on delete set null
);

alter table public.care_events enable row level security;

create index if not exists care_events_horse_time_idx
  on public.care_events (horse_id, performed_at desc);

-- Partial: only rows that HAVE a due date are ever scanned by the due-soon
-- surface, and most of the table eventually will not.
create index if not exists care_events_due_next_idx
  on public.care_events (due_next) where due_next is not null;

comment on table public.care_events is
  'Per-horse care and medical history. Staff may INSERT only; there is no UPDATE or DELETE policy for staff. A family whose rider merely rides the horse sees NOTHING here — no basics tier exists for care.';
comment on column public.care_events.performed_at is
  'The day the care happened — legitimately in the past, so unlike punches.punched_at it is NOT pinned to now().';
comment on column public.care_events.logged_by is
  'Forced to the calling profile by care_events_guard_insert(). Never trust a client-supplied value here.';

-- =============================================================================
-- Insert guard.
--
-- Two jobs:
--   * pin `logged_by` to the caller. "Who logged this medication" is the whole
--     value of the attribution, and a client can put any profile id in the
--     column. Overwritten rather than rejected — the app has no reason to send
--     it, and a mismatch is not something the person on the yard can fix.
--   * restate the insert rule, so a WITH CHECK loosened in a later migration
--     cannot fail open silently. Same reasoning as punches_guard_insert().
--
-- performed_at is deliberately left alone. See the file header.
-- =============================================================================
create or replace function public.care_events_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role    text;
  v_profile uuid;
begin
  -- Service-role / server-side call (the seed, a future cron); already outside
  -- RLS, and has no profile to attribute to.
  if auth.uid() is null then
    return new;
  end if;

  select p.role, p.id into v_role, v_profile
    from public.profiles p where p.user_id = auth.uid();

  if v_role is null or v_role not in ('admin', 'staff') then
    raise exception 'Only the barn may log care for a horse.' using errcode = '42501';
  end if;

  new.logged_by := v_profile;

  return new;
end;
$$;

comment on function public.care_events_guard_insert() is
  'Forces care_events.logged_by to the calling profile and restates the insert rule, so attribution cannot be spoofed and a loosened WITH CHECK cannot fail open.';

drop trigger if exists care_events_guard_insert on public.care_events;

create trigger care_events_guard_insert
  before insert on public.care_events
  for each row
  execute function public.care_events_guard_insert();

-- =============================================================================
-- Policies — care_events
--
--   select  admin/staff: all. Parent: only for a horse their family OWNS.
--   insert  admin and staff — the barn logs care.
--   update  has_permission('manage_horses')
--   delete  has_permission('manage_horses')
--
-- Note what is absent: no UPDATE and no DELETE reachable by a plain staff
-- member, who holds manage_horses false. They log; the barn corrects.
-- =============================================================================
drop policy if exists "care_events: read (admin/staff all, owner family own horse)" on public.care_events;
create policy "care_events: read (admin/staff all, owner family own horse)"
  on public.care_events for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (
      (select public."current_role"()) = 'parent'
      -- OWNS, never rides. Changing this to family_rides_horse() would hand a
      -- riding family another family's horse's medical history.
      and public.family_owns_horse(horse_id)
    )
  );

drop policy if exists "care_events: barn insert" on public.care_events;
create policy "care_events: barn insert"
  on public.care_events for insert to authenticated
  with check ((select public."current_role"()) in ('admin', 'staff'));

drop policy if exists "care_events: manage update" on public.care_events;
create policy "care_events: manage update"
  on public.care_events for update to authenticated
  using ((select public.has_permission('manage_horses')))
  with check ((select public.has_permission('manage_horses')));

drop policy if exists "care_events: manage delete" on public.care_events;
create policy "care_events: manage delete"
  on public.care_events for delete to authenticated
  using ((select public.has_permission('manage_horses')));

-- =============================================================================
-- enqueue_care_due_digest() — admin only, idempotent. Returns rows created.
--
-- Notifies every admin of care falling due in the next 30 days, AND of anything
-- already overdue. Idempotency is by (profile_id, type, link_path), and the
-- link carries the care event id, so re-running never tells an admin the same
-- Coggins is due twice.
--
-- THERE IS NO LOWER BOUND ON due_next, deliberately (amended after review). An
-- item that lapses is the one most worth telling someone about; excluding the
-- past would have meant the digest went quiet at exactly the moment the care
-- became overdue. The screen and the digest now agree on what counts as
-- outstanding.
--
-- THE 30-DAY WINDOW IS ALSO IN THE APP, in lib/care.ts. Two homes for one
-- number is a drift risk and is called out in both places; it is not in
-- config/barn.ts because that file is for barn-specific FACTS (colours,
-- timezone, geofence), not product rules a clone would keep.
--
-- SEMANTICS WORTH KNOWING: idempotency is per care item FOREVER, not per
-- digest cycle — matching enqueue_lesson_reminders(). Once an admin has been
-- told a Coggins is due, they are not told again. That is right for an
-- admin-triggered button and WRONG for the weekly digest SPEC §8 describes:
-- a weekly job on this function goes quiet after the first week. Revisit when
-- the cron lands — most likely by scoping the idempotency key to the week.
--
-- TODO (deferred): the nightly/weekly cron. Admin-triggered for now.
-- TODO (deferred): email mirror via Resend, honouring notification_prefs.
-- =============================================================================
create or replace function public.enqueue_care_due_digest()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer;
begin
  if (select public."current_role"()) is distinct from 'admin' then
    raise exception 'Only an admin may send the care digest.' using errcode = '42501';
  end if;

  insert into public.notifications (profile_id, type, title, body, link_path)
  select p.id,
         'care_due',
         h.name || ' — ' || ce.type || ' due',
         'Due ' || to_char(ce.due_next, 'Dy DD Mon') || '.',
         '/manage/care?event=' || ce.id
    from public.care_events ce
    join public.horses h on h.id = ce.horse_id and h.active
    join public.profiles p on p.role = 'admin'
   where ce.due_next is not null
     -- No lower bound: overdue care is included. See the header.
     and ce.due_next <= current_date + 30
     and not exists (
       select 1 from public.notifications n
        where n.profile_id = p.id
          and n.type = 'care_due'
          and n.link_path = '/manage/care?event=' || ce.id
     );

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

comment on function public.enqueue_care_due_digest() is
  'Notifies admins of care due within 30 days. Idempotent per care item. Admin-gated internally; the cron that should call it is deferred.';

-- Entry point: gated internally on role, so it is granted to authenticated and
-- taken away from everyone else. `from public` alone is not enough on Supabase
-- — anon carries its own default grant.
revoke all on function public.enqueue_care_due_digest() from public, anon;
grant execute on function public.enqueue_care_due_digest() to authenticated;

commit;
