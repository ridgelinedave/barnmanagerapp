-- =============================================================================
-- 0017 — invites (Phase 2, provisioning slice)
--
-- How a new person gets a login. NOT APPLIED YET — printed for audit first.
--
-- WHY A SEPARATE TABLE AND NOT A PRE-CREATED PROFILE:
-- `profiles.user_id` is NOT NULL and references `auth.users`, so a profile
-- cannot exist before its login does. The barn owner still needs to decide the
-- role, the family and the permission flags BEFORE the person has an account —
-- so those decisions have to live somewhere until the account exists. That
-- somewhere is this table. It holds the decision; the profile is created at the
-- moment of claim.
--
-- THE TOKEN IS A BEARER CREDENTIAL, exactly like ical_tokens.token — holding it
-- is the entire authorisation to create an account with the role written on it.
-- Two consequences, both mirrored from migration 0014:
--
--   * the client can never choose it. A caller who could set the token could
--     set one they had already published, or a predictable one. The guard
--     trigger below mints it server-side on insert AND on regeneration.
--   * the claim route runs unauthenticated with the service role, so RLS is not
--     protecting it and the validation in that route IS the boundary. See
--     app/invite/[token]/actions.ts, which re-states every rule.
--
-- WHAT THIS TABLE DELIBERATELY DOES NOT HOLD: a password, or anything derived
-- from one. The invitee sets that at claim time and it goes straight to
-- auth.users. An invite that leaks reveals a name, a role and a barn — not a
-- credential to an existing account.
--
-- Idempotent, safe to re-run.
-- =============================================================================

begin;

create table if not exists public.invites (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  -- Minted by invites_token_guard(), never by the caller. The default is a
  -- backstop for a direct SQL insert; the trigger is what makes it unforgeable.
  token           uuid not null unique default gen_random_uuid(),

  -- The pre-decided identity. Everything here is copied verbatim onto the new
  -- profile at claim time, and NOTHING the claimant posts is allowed to
  -- influence it.
  role            text not null check (role in ('admin', 'staff', 'parent')),
  family_id       uuid references public.families (id) on delete cascade,
  full_name       text not null,
  -- Optional: the barn may not know it. The claimant supplies one if absent,
  -- and it becomes their sign-in identifier either way.
  email           text,
  phone           text,

  manage_shows    boolean not null default false,
  manage_schedule boolean not null default false,
  manage_horses   boolean not null default false,

  created_by      uuid references public.profiles (id) on delete set null,

  -- NOT NULL with NO DEFAULT on purpose. How long an invite lives is a product
  -- rule, not a barn fact and not a database fact — it lives in
  -- INVITE_LIFETIME_DAYS in lib/invites.ts. Giving the column a default would
  -- put the same rule in two places and let them drift.
  expires_at      timestamptz not null,

  -- Status is DERIVED from these three plus expires_at, never stored: a stored
  -- status is a second source of truth that goes stale the moment an invite
  -- expires without anyone touching the row. See inviteStatus() in lib/invites.ts.
  accepted_at     timestamptz,
  revoked_at      timestamptz,

  -- Mirrors profiles_family_only_for_parents exactly. Staff and admin never
  -- belong to a family, so an invite that would create one is refused here
  -- rather than blowing up against the profiles CHECK at claim time — when the
  -- person is already sitting in front of the form.
  constraint invites_family_only_for_parents
    check (role = 'parent' or family_id is null),

  -- Parents hold no permission flags.
  --
  -- This is NOT cosmetic. public.has_permission() short-circuits to true for
  -- admin and otherwise reads the flag column WITHOUT checking that the role is
  -- staff — so a parent row carrying manage_horses = true really would hold
  -- barn-wide write permission. The Team panel never sets a flag on a parent,
  -- but an invite is the one place a profile is created from stored values, so
  -- the table refuses the combination instead of trusting the form.
  constraint invites_flags_only_for_staff
    check (
      role <> 'parent'
      or (manage_shows = false and manage_schedule = false and manage_horses = false)
    ),

  constraint invites_full_name_not_blank
    check (length(btrim(full_name)) > 0)
);

alter table public.invites enable row level security;

create index if not exists invites_created_at_idx on public.invites (created_at desc);
create index if not exists invites_family_id_idx on public.invites (family_id);

comment on table public.invites is
  'A pending login. Holds the role/family/flags an admin decided before the person had an account; the profile is created from these values at claim time. `token` is a BEARER CREDENTIAL — holding it authorises creating an account with the role written on this row.';

-- =============================================================================
-- Policies — admin only, all four verbs.
--
-- There is deliberately NO staff branch and no self-service branch. An invite
-- carries a role, so anyone who can write one can manufacture an admin; that is
-- the barn owner's decision and nobody else's. Staff cannot even READ the
-- table: the token is in it, and a readable token is an account someone else
-- can create.
--
-- The claimant is signed OUT when they use their invite, and anon holds no
-- policy here at all — so the claim path cannot go through RLS. It goes through
-- the service role in a route that re-states every rule. That is the same shape
-- as the iCal feed, and it is called out there too.
-- =============================================================================
drop policy if exists "invites: admin read" on public.invites;
create policy "invites: admin read"
  on public.invites for select to authenticated
  using ((select public."current_role"()) = 'admin');

drop policy if exists "invites: admin insert" on public.invites;
create policy "invites: admin insert"
  on public.invites for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "invites: admin update" on public.invites;
create policy "invites: admin update"
  on public.invites for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "invites: admin delete" on public.invites;
create policy "invites: admin delete"
  on public.invites for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- invites_token_guard() — the token is the database's to mint, not the client's.
--
-- Same shape and same reasoning as ical_token_guard() in migration 0014.
--
-- On INSERT the token is generated here rather than merely defaulted, so a
-- caller supplying one is overwritten instead of obeyed. `created_by` is pinned
-- to the caller for the same reason `logged_by` is pinned on care_events: an
-- attribution the client can choose is not an attribution.
--
-- On UPDATE, any attempt to change the token is read as "regenerate" and
-- answered with a fresh server-minted value — so revoking a leaked link is one
-- action, and the new token is still unguessable.
--
-- `expires_at` is deliberately NOT touched here. The lifetime is a product rule
-- owned by lib/invites.ts; the trigger owning it too would put one rule in two
-- places.
-- =============================================================================
create or replace function public.invites_token_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- No end user in context: the service role, which is the claim route marking
  -- an invite accepted. It has already proven the token by holding it.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.token := gen_random_uuid();
    new.created_by := (select public.current_profile());
    new.accepted_at := null;
    new.revoked_at := null;
    return new;
  end if;

  -- UPDATE: the only meaningful change to a token is "give me a new one".
  if new.token is distinct from old.token then
    new.token := gen_random_uuid();
  end if;

  -- Who created it is history, not a field.
  new.created_by := old.created_by;
  new.created_at := old.created_at;

  return new;
end;
$$;

comment on function public.invites_token_guard() is
  'Forces invites.token to a server-generated uuid on insert and on regeneration, and pins created_by to the caller, so a client can never choose — and therefore never predict or re-use — an invite credential.';

-- -----------------------------------------------------------------------------
-- Close the default grants on the function just created.
--
-- Migration 0015 swept the definer functions that existed WHEN IT RAN; every
-- new one is born open, because Postgres grants EXECUTE to PUBLIC and Supabase
-- layers its own grants to anon and authenticated on top. `db:advisor` lint
-- 0028 tests exactly this, so omitting these three roles turns the gate red.
-- A trigger function needs no grant to fire, so nothing is granted back.
-- -----------------------------------------------------------------------------
revoke all on function public.invites_token_guard() from public, anon, authenticated;

drop trigger if exists invites_token_guard on public.invites;

create trigger invites_token_guard
  before insert or update on public.invites
  for each row
  execute function public.invites_token_guard();

commit;
