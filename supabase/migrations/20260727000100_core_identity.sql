-- =============================================================================
-- 0001 — Core identity tables: families, levels, profiles, riders
--
-- HARD RULE (SPEC §6): every table gets `enable row level security` in the SAME
-- migration that creates it. No exceptions, including lookup tables. With RLS on
-- and no policies yet, these tables are default-deny — policies arrive in 0003,
-- so there is never a window where the tables are readable without a policy.
--
-- NOT APPLIED YET. See README → "Part 2: connect Supabase".
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- families
-- -----------------------------------------------------------------------------
create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  notes       text
);

alter table public.families enable row level security;

comment on table public.families is
  'An account-holding household. Parents are scoped to exactly one family.';

-- -----------------------------------------------------------------------------
-- levels — Belle-assigned formal levels; drives lesson backfill eligibility
-- -----------------------------------------------------------------------------
create table if not exists public.levels (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null unique,
  sort        integer not null default 0
);

alter table public.levels enable row level security;

comment on table public.levels is
  'Lookup of rider levels (Intro, Training, First, ...). RLS on, per SPEC §6.';

-- -----------------------------------------------------------------------------
-- profiles — one row per auth user; `role` drives BOTH the tab bar and RLS
--
-- SPEC §5 models this with user_id as the primary key; the Phase 0 brief
-- requires a uuid surrogate `id` on every table. Both are honoured: `id` is the
-- PK, `user_id` is a NOT NULL UNIQUE FK to auth.users.
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  user_id         uuid not null unique references auth.users (id) on delete cascade,
  role            text not null check (role in ('admin', 'staff', 'parent')),
  full_name       text,
  phone           text,
  -- Fine-grained flags, admin-grantable, all default false (SPEC §4).
  -- Admin implicitly has all of them — see public.has_permission().
  manage_shows    boolean not null default false,
  manage_schedule boolean not null default false,
  manage_horses   boolean not null default false,
  -- Parents belong to a family; staff and admin never do.
  family_id       uuid references public.families (id) on delete set null,
  qbo_customer_id text,
  constraint profiles_family_only_for_parents
    check (role = 'parent' or family_id is null)
);

alter table public.profiles enable row level security;

create index if not exists profiles_family_id_idx on public.profiles (family_id);
create index if not exists profiles_role_idx on public.profiles (role);

comment on table public.profiles is
  'One row per auth user. `role` is the single value that drives both navigation and RLS.';

-- -----------------------------------------------------------------------------
-- riders — minors attached to a family. No logins of their own in v1.
-- -----------------------------------------------------------------------------
create table if not exists public.riders (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  family_id   uuid not null references public.families (id) on delete cascade,
  name        text not null,
  dob         date,
  level_id    uuid references public.levels (id) on delete set null,
  photo_url   text,
  active      boolean not null default true,
  notes       text
);

alter table public.riders enable row level security;

create index if not exists riders_family_id_idx on public.riders (family_id);
create index if not exists riders_level_id_idx on public.riders (level_id);

comment on table public.riders is
  'A rider (usually a minor) belonging to a family. Family-scoped for parents.';

commit;
