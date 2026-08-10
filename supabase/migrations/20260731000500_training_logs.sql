-- =============================================================================
-- 0020 — training_logs
--
-- NOT APPLIED YET — printed for audit first.
--
-- What a horse worked on, on a given day: dressage, jumping, flatwork,
-- groundwork, hacking, lunging, conditioning. This is the record Belle wants
-- boarders to be able to see for their own horse — "what did my horse actually
-- do this week" — which is why it is readable by the OWNING family and by
-- nobody else outside the barn.
--
-- MODELLED ON care_events (0011) AND DELIBERATELY IDENTICAL IN SHAPE. Training
-- is less sensitive than a medical record, but the visibility question is the
-- same question — whose horse is it — and answering it two different ways in
-- two tables is how one of them ends up wrong. So the same three rules carry
-- over:
--
--   1. NO BASICS TIER. A family whose rider merely RIDES this horse sees zero
--      rows. The parent branch of the SELECT policy is family_owns_horse() and
--      must NEVER become family_rides_horse(). A lesson kid's family has no
--      business reading another family's horse's work.
--
--   2. STAFF INSERT, AND ONLY INSERT. No UPDATE and no DELETE policy reachable
--      by a plain staff member; corrections are the barn's. Same append-only
--      discipline as punches and care_events — a log the writer can quietly
--      rewrite afterwards is not a log.
--
--   3. performed_at IS NOT PINNED TO now(). A training day is routinely
--      written up after the fact ("Tuesday's hack"), so a past date is the
--      normal case rather than an attack — exactly the reasoning in 0011, and
--      exactly the opposite of punches.punched_at, where a client-supplied
--      time is a way to invent paid hours. `logged_by` IS forced to the
--      caller, because attribution is the whole value of the record.
--
-- Idempotent, safe to re-run.
-- =============================================================================

begin;

create table if not exists public.training_logs (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  horse_id     uuid not null references public.horses (id) on delete cascade,

  -- The day the work happened. Routinely in the past; see the header.
  performed_at date not null,

  discipline   text not null default 'other' check (
                 discipline in ('dressage', 'jumping', 'flatwork', 'groundwork',
                                'hacking', 'lunging', 'conditioning', 'other')
               ),

  -- What was actually worked on: "shoulder-in both reins", "grid work 2'6".
  focus        text,
  notes        text not null default '',

  -- Null when nobody timed it, which is most of the time.
  duration_min integer,

  -- Forced to the caller by the trigger below. Nullable because the seed and
  -- future server-side jobs run without a profile.
  logged_by    uuid references public.profiles (id) on delete set null
);

alter table public.training_logs enable row level security;

create index if not exists training_logs_horse_time_idx
  on public.training_logs (horse_id, performed_at desc);

comment on table public.training_logs is
  'Per-horse training history. Staff may INSERT only; there is no UPDATE or DELETE policy for staff. A family whose rider merely rides the horse sees NOTHING here — no basics tier exists for training, exactly as for care_events.';
comment on column public.training_logs.performed_at is
  'The day the work happened — legitimately in the past, so unlike punches.punched_at it is NOT pinned to now().';
comment on column public.training_logs.logged_by is
  'Forced to the calling profile by training_logs_guard_insert(). Never trust a client-supplied value here.';

-- =============================================================================
-- Insert guard — the same two jobs as care_events_guard_insert().
--
--   * pin `logged_by` to the caller. A client can put any profile id in the
--     column, and "who schooled this horse" is the whole point of the row.
--     Overwritten rather than rejected: the app has no reason to send it, and
--     a mismatch is not something the person on the yard can fix.
--   * restate the insert rule, so a WITH CHECK loosened in a later migration
--     cannot fail open silently.
--
-- performed_at is deliberately left alone. See the file header.
-- =============================================================================
create or replace function public.training_logs_guard_insert()
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
    raise exception 'Only the barn may log training for a horse.' using errcode = '42501';
  end if;

  new.logged_by := v_profile;

  return new;
end;
$$;

comment on function public.training_logs_guard_insert() is
  'Forces training_logs.logged_by to the calling profile and restates the insert rule, so attribution cannot be spoofed and a loosened WITH CHECK cannot fail open.';

-- -----------------------------------------------------------------------------
-- Close the default grants on the function just created.
--
-- Migration 0015 swept the SECURITY DEFINER functions that existed WHEN IT RAN.
-- Every new one is born open: Postgres grants EXECUTE to PUBLIC and Supabase
-- layers its own grants to anon and authenticated on top. `db:advisor` lint
-- 0028 tests exactly this, so omitting these three roles turns the gate red.
-- A trigger function needs no grant to fire, so nothing is granted back.
-- -----------------------------------------------------------------------------
revoke all on function public.training_logs_guard_insert() from public, anon, authenticated;

drop trigger if exists training_logs_guard_insert on public.training_logs;

create trigger training_logs_guard_insert
  before insert on public.training_logs
  for each row
  execute function public.training_logs_guard_insert();

-- =============================================================================
-- Policies — mirrored from care_events, verb for verb.
--
--   select  admin/staff: all. Parent: only for a horse their family OWNS.
--   insert  admin and staff — the barn logs the work.
--   update  has_permission('manage_horses')
--   delete  has_permission('manage_horses')
--
-- Note what is absent: no UPDATE and no DELETE reachable by a plain staff
-- member, who holds manage_horses false. They log; the barn corrects.
-- =============================================================================
drop policy if exists "training_logs: read (admin/staff all, owner family own horse)" on public.training_logs;
create policy "training_logs: read (admin/staff all, owner family own horse)"
  on public.training_logs for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (
      (select public."current_role"()) = 'parent'
      -- OWNS, never rides. Changing this to family_rides_horse() would hand a
      -- riding family another family's horse's training history.
      and public.family_owns_horse(horse_id)
    )
  );

drop policy if exists "training_logs: barn insert" on public.training_logs;
create policy "training_logs: barn insert"
  on public.training_logs for insert to authenticated
  with check ((select public."current_role"()) in ('admin', 'staff'));

drop policy if exists "training_logs: manage update" on public.training_logs;
create policy "training_logs: manage update"
  on public.training_logs for update to authenticated
  using ((select public.has_permission('manage_horses')))
  with check ((select public.has_permission('manage_horses')));

drop policy if exists "training_logs: manage delete" on public.training_logs;
create policy "training_logs: manage delete"
  on public.training_logs for delete to authenticated
  using ((select public.has_permission('manage_horses')));

commit;
