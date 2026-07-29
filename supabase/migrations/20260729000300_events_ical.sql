-- =============================================================================
-- 0014 — events + ical_tokens (Phase 2, slice 5)
--
-- Shows, clinics, farrier and vet days, closures — the things on the barn
-- calendar that are not lessons. Plus the per-user token that lets a family
-- subscribe to their own schedule in Google or Apple Calendar.
--
-- TWO DIFFERENT SECURITY PROBLEMS IN ONE MIGRATION, worth keeping apart:
--
--   `events` is ordinary RLS: admin writes, staff read everything, parents read
--   what is marked visible to everyone. A staff-only event (the vet coming to
--   discuss a lame horse) must not appear on a family's calendar.
--
--   `ical_tokens` is a BEARER CREDENTIAL. Anyone holding the token can read
--   that person's calendar over plain HTTP with no session at all — that is the
--   entire point, because Google Calendar cannot log in. Two consequences:
--
--     * the token is readable ONLY by the person it belongs to. Not by admin,
--       not by staff. A token an employee can read is an employee who can
--       subscribe to a family's schedule forever, and revoking their account
--       would not revoke that.
--     * it must be regenerable, so a leaked URL can be killed. Rotating is an
--       UPDATE of the token column by its owner.
--
-- The feed endpoint itself runs server-side with the service role — it has to,
-- since there is no session — and re-implements the visibility rules in the
-- route handler. That is called out in the route: RLS is not protecting it, so
-- the scoping is the code's job there.
--
-- Idempotent, safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- events
-- -----------------------------------------------------------------------------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  type        text not null default 'other' check (
                type in ('show', 'clinic', 'farrier', 'vet', 'closure', 'other')
              ),
  title       text not null,
  description text not null default '',
  start_at    timestamptz not null,
  end_at      timestamptz,
  location    text not null default '',
  visibility  text not null default 'all' check (visibility in ('all', 'staff')),
  constraint events_ends_after_it_starts check (end_at is null or end_at >= start_at)
);

alter table public.events enable row level security;

create index if not exists events_start_idx on public.events (start_at);
create index if not exists events_visibility_idx on public.events (visibility, start_at);

comment on table public.events is
  'Barn calendar entries that are not lessons. visibility=''staff'' is internal and must never reach a family feed.';

-- -----------------------------------------------------------------------------
-- ical_tokens — one per profile. The token IS the credential.
-- -----------------------------------------------------------------------------
create table if not exists public.ical_tokens (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  token      uuid not null unique default gen_random_uuid(),
  -- Bumped on rotation, so a leaked URL can be shown to have been replaced.
  rotated_at timestamptz
);

alter table public.ical_tokens enable row level security;

create index if not exists ical_tokens_token_idx on public.ical_tokens (token);

comment on table public.ical_tokens is
  'Per-profile calendar subscription token. A BEARER CREDENTIAL: readable only by its owner — never by staff or admin — because holding it grants read access to that person''s schedule with no session.';

-- =============================================================================
-- Policies — events
--
--   select  admin/staff: everything. Parent: visibility='all' only.
--   write   admin, or has_permission('manage_schedule') — the same flag that
--           governs the lesson calendar, since this is the same calendar.
-- =============================================================================
drop policy if exists "events: read (staff all, families public)" on public.events;
create policy "events: read (staff all, families public)"
  on public.events for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (
      (select public."current_role"()) = 'parent'
      and visibility = 'all'
    )
  );

drop policy if exists "events: manage insert" on public.events;
create policy "events: manage insert"
  on public.events for insert to authenticated
  with check ((select public.has_permission('manage_schedule')));

drop policy if exists "events: manage update" on public.events;
create policy "events: manage update"
  on public.events for update to authenticated
  using ((select public.has_permission('manage_schedule')))
  with check ((select public.has_permission('manage_schedule')));

drop policy if exists "events: manage delete" on public.events;
create policy "events: manage delete"
  on public.events for delete to authenticated
  using ((select public.has_permission('manage_schedule')));

-- =============================================================================
-- Policies — ical_tokens: strictly own-row, for everyone.
--
-- There is deliberately NO admin branch on the read policy. An admin who could
-- read a family's token could subscribe to their calendar silently and forever;
-- the barn owner has legitimate access to the same data through the app, and
-- does not need the bearer credential to get it.
-- =============================================================================
drop policy if exists "ical_tokens: read own" on public.ical_tokens;
create policy "ical_tokens: read own"
  on public.ical_tokens for select to authenticated
  using (profile_id = (select public.current_profile()));

drop policy if exists "ical_tokens: create own" on public.ical_tokens;
create policy "ical_tokens: create own"
  on public.ical_tokens for insert to authenticated
  with check (profile_id = (select public.current_profile()));

-- Rotation. The USING half stops someone updating another person's row; the
-- WITH CHECK half stops them re-pointing their own row at another profile.
drop policy if exists "ical_tokens: rotate own" on public.ical_tokens;
create policy "ical_tokens: rotate own"
  on public.ical_tokens for update to authenticated
  using (profile_id = (select public.current_profile()))
  with check (profile_id = (select public.current_profile()));

drop policy if exists "ical_tokens: delete own" on public.ical_tokens;
create policy "ical_tokens: delete own"
  on public.ical_tokens for delete to authenticated
  using (profile_id = (select public.current_profile()));

-- =============================================================================
-- ical_token_guard() — the token is the database's to mint, not the client's.
--
-- Without this, a caller could INSERT their row with a token they chose (say,
-- all zeroes, or one they had already shared) and rotation could set it to a
-- known value. Both are ways to turn an unguessable credential into a guessable
-- one. On insert the column default already generates it; this makes the value
-- unforgeable rather than merely defaulted.
-- =============================================================================
create or replace function public.ical_token_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Service-role / server-side; nothing to attribute or defend against here.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.token := gen_random_uuid();
    new.rotated_at := null;
    return new;
  end if;

  -- UPDATE: the only meaningful change is "give me a new one".
  if new.token is distinct from old.token then
    new.token := gen_random_uuid();
    new.rotated_at := now();
  end if;

  new.profile_id := old.profile_id;

  return new;
end;
$$;

comment on function public.ical_token_guard() is
  'Forces ical_tokens.token to a server-generated uuid on insert and on rotation, so a client can never choose — and therefore never predict or re-use — a calendar credential.';

drop trigger if exists ical_token_guard on public.ical_tokens;

create trigger ical_token_guard
  before insert or update on public.ical_tokens
  for each row
  execute function public.ical_token_guard();

commit;
