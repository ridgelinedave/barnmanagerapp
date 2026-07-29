-- =============================================================================
-- 0010 — horses + horse_riders + feed_plans (Phase 2, slice 1)
--
-- The barn's horses, who is allowed to ride them, and what each one is fed.
--
-- THE CENTRAL PROBLEM THIS MIGRATION SOLVES: horse visibility is not a row
-- rule, it is a COLUMN rule, and RLS is row-level only.
--
--   admin / staff        full read on every horse
--   owner family         full read on the horse they own (breed, dob, notes)
--   riding family        BASICS ONLY — name, barn_name, photo. Never breed,
--                        dob or notes, and later never medical or documents
--   unrelated family     nothing
--
-- A single SELECT policy cannot express "these rows, but only these columns".
-- If the riding family's rows were added to the policy, `select *` would hand
-- them every column, and the only thing standing between them and another
-- family's horse's medical history would be the app remembering to ask for
-- fewer columns. App-side column lists are not a security boundary — the anon
-- key lets anyone write their own query.
--
-- So the base table policy stops at the OWNER. The basics tier is served by
-- public.horses_basics(), a SECURITY DEFINER function that physically cannot
-- return breed, dob or notes because they are not in its return type. The
-- projection is the boundary, and it is enforced by the database.
--
-- WHY A FUNCTION RATHER THAN A VIEW: SPEC §6 suggests a view, and a view would
-- work — but a view over an RLS-protected table has to run as its owner
-- (security_invoker off) to see rows the caller cannot, and that is exactly the
-- shape Supabase's Security Advisor flags as `security_definer_view`. A
-- SECURITY DEFINER function with a pinned empty search_path is the same
-- privilege boundary, is the pattern already used throughout this schema, and
-- the Advisor has no lint against it. Same guarantee, clean Advisor.
--
-- Idempotent, safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- horses
--
-- owner_family_id null = barn-owned. `on delete set null` rather than cascade:
-- deleting a family must not delete a horse, and a horse with no owning family
-- IS a barn horse, which is a narrower visibility, not a wider one.
-- -----------------------------------------------------------------------------
create table if not exists public.horses (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  name            text not null,
  barn_name       text,
  owner_family_id uuid references public.families (id) on delete set null,
  photo_url       text,
  breed           text,
  dob             date,
  active          boolean not null default true,
  notes           text
);

alter table public.horses enable row level security;

create index if not exists horses_owner_family_idx on public.horses (owner_family_id);
create index if not exists horses_active_name_idx on public.horses (active, name);

comment on table public.horses is
  'Barn and family-owned horses. Parents read their OWN horse here; the basics tier for a horse their rider rides is served by public.horses_basics(), never by this table.';
comment on column public.horses.owner_family_id is
  'Null = barn-owned. Non-null grants that family full read on this row.';

-- -----------------------------------------------------------------------------
-- horse_riders — who is allowed/assigned to ride which horse.
--
-- This link is what earns a non-owning family the basics tier, so it is a
-- permission edge, not just a convenience. Cascades both ways: the link is
-- meaningless without either end.
-- -----------------------------------------------------------------------------
create table if not exists public.horse_riders (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  horse_id   uuid not null references public.horses (id) on delete cascade,
  rider_id   uuid not null references public.riders (id) on delete cascade,
  constraint horse_riders_unique_pair unique (horse_id, rider_id)
);

alter table public.horse_riders enable row level security;

create index if not exists horse_riders_horse_idx on public.horse_riders (horse_id);
create index if not exists horse_riders_rider_idx on public.horse_riders (rider_id);

comment on table public.horse_riders is
  'Rider ↔ horse assignment. A row here is what makes a non-owning family eligible for the basics tier via horses_basics().';

-- -----------------------------------------------------------------------------
-- feed_plans — the standing feed chart, per horse per meal.
--
-- At most ONE ACTIVE plan per horse per meal (partial unique index). Two active
-- 'am' rows for the same horse would print the horse twice on the morning feed
-- board with two different instructions, which is how a horse gets fed twice or
-- not at all. Superseded plans stay as active=false rather than being deleted,
-- so a feed change six weeks ago is still legible.
-- -----------------------------------------------------------------------------
create table if not exists public.feed_plans (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  horse_id             uuid not null references public.horses (id) on delete cascade,
  meal                 text not null check (meal in ('am', 'lunch', 'pm')),
  description          text not null default '',
  supplements          text not null default '',
  special_instructions text not null default '',
  active               boolean not null default true
);

alter table public.feed_plans enable row level security;

create index if not exists feed_plans_horse_idx on public.feed_plans (horse_id);
create index if not exists feed_plans_board_idx on public.feed_plans (meal) where active;

create unique index if not exists feed_plans_one_active_per_meal
  on public.feed_plans (horse_id, meal) where active;

comment on table public.feed_plans is
  'Standing feed chart. One active row per horse per meal; superseded plans are kept as active=false.';

-- =============================================================================
-- Policy helpers.
--
-- Both answer only about the CALLER'S OWN family: neither takes a family as an
-- argument, so there is no way to ask "does family X own horse Y". They derive
-- the family from auth.uid() via current_family(), which returns null for
-- staff, admin and anon — so for those callers both helpers are simply false.
--
-- These are policy helpers: an RLS policy's expression is evaluated as the
-- querying user, so a user who cannot EXECUTE them would be denied everything.
-- They therefore stay callable by `authenticated` and are allowlisted in the
-- suite's EXPOSED_BY_DESIGN, exactly like family_owns_rider() before them.
-- Calling them signed-out returns false, which is the same thing anon learns
-- from being denied.
-- =============================================================================

-- Does the calling family OWN this horse?
create or replace function public.family_owns_horse(horse uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.horses h
     where h.id = horse
       and h.owner_family_id is not distinct from public.current_family()
       and public.current_family() is not null
  );
$$;

comment on function public.family_owns_horse(uuid) is
  'True when the calling family owns the given horse. Basis of the owner tier: full read on the horse and its feed plans.';

-- Does one of the calling family's riders RIDE this horse?
create or replace function public.family_rides_horse(horse uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.horse_riders hr
      join public.riders r on r.id = hr.rider_id
     where hr.horse_id = horse
       and r.family_id is not distinct from public.current_family()
       and public.current_family() is not null
  );
$$;

comment on function public.family_rides_horse(uuid) is
  'True when a rider of the calling family is assigned to the given horse. Earns the BASICS tier only — never full read.';

-- =============================================================================
-- horses_basics() — the basics tier, and the only route to it.
--
-- Returns name/barn_name/photo for horses the calling family's riders ride but
-- does NOT own. breed, dob and notes are absent from the return type, so no
-- amount of clever querying by the caller can produce them.
--
-- Owned horses are deliberately EXCLUDED: the family already reads those in
-- full from the table, and keeping the two sets disjoint means the parent UI
-- can render "your horses" and "horses your rider rides" without de-duplicating
-- — and makes the test for the basics tier unambiguous about which row it is
-- looking at.
--
-- Inactive horses are excluded; a retired horse is not on anyone's list.
-- =============================================================================
create or replace function public.horses_basics()
returns table (id uuid, name text, barn_name text, photo_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.name, h.barn_name, h.photo_url
    from public.horses h
   where public.current_family() is not null
     and h.active
     and h.owner_family_id is distinct from public.current_family()
     and public.family_rides_horse(h.id)
   order by h.name;
$$;

comment on function public.horses_basics() is
  'Basics tier (name, barn_name, photo) for horses the calling family rides but does not own. The projection IS the column boundary — breed/dob/notes cannot be returned.';

-- Signed-out callers have no family and would get an empty set anyway; taking
-- the grant away means they do not get to ask. `from public` alone is not
-- enough on Supabase — anon and authenticated carry their own default grants.
revoke all on function public.horses_basics() from public, anon;
grant execute on function public.horses_basics() to authenticated;

-- =============================================================================
-- Policies — horses
--
--   select  admin/staff: all. Parent: only a horse their family owns.
--   write   has_permission('manage_horses') — admin implicitly true, and a
--           senior trainer can be granted the flag without becoming an admin
--           (SPEC §4). Staff hold it false by default, so staff cannot write.
--
-- Note what is absent: the riding family is NOT in the select policy. That
-- omission is the column boundary — see the header. Adding them here would
-- quietly hand out breed, dob and notes.
-- =============================================================================
drop policy if exists "horses: read (admin/staff all, owner family own)" on public.horses;
create policy "horses: read (admin/staff all, owner family own)"
  on public.horses for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (
      owner_family_id is not null
      and owner_family_id = (select public.current_family())
    )
  );

drop policy if exists "horses: manage insert" on public.horses;
create policy "horses: manage insert"
  on public.horses for insert to authenticated
  with check ((select public.has_permission('manage_horses')));

drop policy if exists "horses: manage update" on public.horses;
create policy "horses: manage update"
  on public.horses for update to authenticated
  using ((select public.has_permission('manage_horses')))
  with check ((select public.has_permission('manage_horses')));

drop policy if exists "horses: manage delete" on public.horses;
create policy "horses: manage delete"
  on public.horses for delete to authenticated
  using ((select public.has_permission('manage_horses')));

-- =============================================================================
-- Policies — horse_riders
--
-- A parent sees the links belonging to their OWN riders: which horse their
-- child is on is their business. They never see who else rides it — that would
-- name another family's rider.
-- =============================================================================
drop policy if exists "horse_riders: read (admin/staff all, family own riders)" on public.horse_riders;
create policy "horse_riders: read (admin/staff all, family own riders)"
  on public.horse_riders for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (
      (select public."current_role"()) = 'parent'
      and public.family_owns_rider(rider_id)
    )
  );

drop policy if exists "horse_riders: manage insert" on public.horse_riders;
create policy "horse_riders: manage insert"
  on public.horse_riders for insert to authenticated
  with check ((select public.has_permission('manage_horses')));

drop policy if exists "horse_riders: manage update" on public.horse_riders;
create policy "horse_riders: manage update"
  on public.horse_riders for update to authenticated
  using ((select public.has_permission('manage_horses')))
  with check ((select public.has_permission('manage_horses')));

drop policy if exists "horse_riders: manage delete" on public.horse_riders;
create policy "horse_riders: manage delete"
  on public.horse_riders for delete to authenticated
  using ((select public.has_permission('manage_horses')));

-- =============================================================================
-- Policies — feed_plans
--
-- The owning family reads its own horse's feed chart: a boarder paying for
-- feed is entitled to know what the horse is being fed. A riding family is
-- not — feed and supplements shade into medical, and they do not own the horse.
-- =============================================================================
drop policy if exists "feed_plans: read (admin/staff all, owner family own horse)" on public.feed_plans;
create policy "feed_plans: read (admin/staff all, owner family own horse)"
  on public.feed_plans for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (
      (select public."current_role"()) = 'parent'
      and public.family_owns_horse(horse_id)
    )
  );

drop policy if exists "feed_plans: manage insert" on public.feed_plans;
create policy "feed_plans: manage insert"
  on public.feed_plans for insert to authenticated
  with check ((select public.has_permission('manage_horses')));

drop policy if exists "feed_plans: manage update" on public.feed_plans;
create policy "feed_plans: manage update"
  on public.feed_plans for update to authenticated
  using ((select public.has_permission('manage_horses')))
  with check ((select public.has_permission('manage_horses')));

drop policy if exists "feed_plans: manage delete" on public.feed_plans;
create policy "feed_plans: manage delete"
  on public.feed_plans for delete to authenticated
  using ((select public.has_permission('manage_horses')));

commit;
