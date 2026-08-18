-- =============================================================================
-- 0022 — barn ops: supply_items, water_sources, blanket_plans, turnout_plans,
--                  maintenance_requests
--
-- The five day-to-day records behind the Barn tab, from Belle's own spec. One
-- migration because they share one shape — small tables, one new family-scope
-- helper between them, no new permission flag — and splitting them would give
-- five near-identical policy blocks five chances to drift.
--
-- WHO CAN SEE WHAT, IN ONE PLACE:
--
--   barn-only          water_sources, maintenance_requests
--   barn + own family  supply_items (a parent sees ONLY their own household's
--                      'boarder' items, never a 'barn' one)
--   barn + own horse   blanket_plans, turnout_plans (family_owns_horse — the
--                      OWNER tier, not family_rides_horse: what rug a horse
--                      wears is the owner's business, not every rider's)
--
-- THE ONE THING WORTH READING TWICE — supply_items carries two different
-- meanings in one table. scope='barn' is Crouse's own stock and is internal;
-- scope='boarder' is a request TO a household and is theirs to see. A single
-- read policy has to get both right, and the CHECK constraints below make the
-- states that would confuse it unrepresentable: a barn item cannot carry a
-- family, and a boarder item cannot exist without one.
--
-- NO NEW PERMISSION FLAG. manage_barn_ops would mean altering profiles AND
-- invites AND the team UI AND the invite-claim path for five tables nobody has
-- asked to delegate yet. Staff log and read; resolving a maintenance request
-- gates on has_permission('manage_horses'), which already returns true for
-- admin (helpers migration 0002) — so that policy IS "admin or the flag".
--
-- NO updated_at COLUMNS. Nothing else in this schema has one, and adding them
-- here would mean either a new shared trigger or five places for the app to
-- forget. Status transitions carry the meaning that matters.
--
-- WEATHER AUTOMATION IS OUT OF SCOPE, per the brief. blanket_plans stores the
-- RULES; nothing reads a forecast. The future hook is noted on the table.
--
-- Idempotent, safe to re-run.
-- =============================================================================

begin;


-- -----------------------------------------------------------------------------
-- 1. supply_items — "things that are about to run out"
-- -----------------------------------------------------------------------------
create table if not exists public.supply_items (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  name              text not null,
  category          text not null default '',
  -- 'barn'    = Crouse's own stock. Internal.
  -- 'boarder' = a request to a household. Visible to that family, and the
  --             only kind that notifies anyone.
  scope             text not null check (scope in ('barn', 'boarder')),
  quantity          numeric(10, 2),
  unit              text not null default '',
  -- Optional. "Running low" is quantity <= this, OR status = 'needed'; both
  -- are computed at read time because a generated column cannot depend on
  -- now() and this one does not need to.
  reorder_threshold numeric(10, 2),
  status            text not null default 'needed'
                      check (status in ('needed', 'ordered', 'received')),
  notes             text not null default '',
  -- Forced to the caller by the insert guard below; never trusted from a client.
  requested_by      uuid references public.profiles (id) on delete set null,
  -- The household a 'boarder' item is addressed to.
  family_id         uuid references public.families (id) on delete cascade,
  -- Optional: which horse it is for. Narrowing, not scoping — family_id is
  -- what decides who can read the row.
  horse_id          uuid references public.horses (id) on delete set null,

  -- The two states that would confuse the read policy, made unrepresentable.
  constraint supply_items_boarder_has_family check (
    (scope = 'boarder' and family_id is not null)
    or (scope = 'barn' and family_id is null and horse_id is null)
  ),
  constraint supply_items_quantity_not_negative check (
    quantity is null or quantity >= 0
  ),
  constraint supply_items_threshold_not_negative check (
    reorder_threshold is null or reorder_threshold >= 0
  )
);

alter table public.supply_items enable row level security;

create index if not exists supply_items_scope_idx on public.supply_items (scope, status);
create index if not exists supply_items_family_idx on public.supply_items (family_id)
  where family_id is not null;

-- =============================================================================
-- public.family_owns_supply_item(item uuid)
--
-- DEFINED AFTER THE TABLE, and it has to be: a `language sql` body is parsed
-- and validated at CREATE time, so declaring it above supply_items fails with
-- "relation does not exist" rather than deferring the way a plpgsql body does.
--
-- "Is this supply item addressed to my household?" — the family half of the
-- supply read rule, in one function so the read policy stays legible.
--
-- SECURITY DEFINER so the policy can ask without the caller reading
-- public.supply_items through its own RLS, which is the shape that recurses.
-- Answers only about the CALLER'S family: current_family() is null for staff,
-- admin and anon, so for them it is simply false — they are covered by the
-- role branch of the policy instead.
-- =============================================================================
create or replace function public.family_owns_supply_item(item uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.supply_items s
     where s.id = item
       and s.scope = 'boarder'
       and s.family_id is not distinct from public.current_family()
       and public.current_family() is not null
  );
$$;

comment on function public.family_owns_supply_item(uuid) is
  'True when the given supply item is a boarder request addressed to the calling family. False for barn-scoped stock, and for anyone with no family.';

revoke all on function public.family_owns_supply_item(uuid) from public, anon, authenticated;
grant execute on function public.family_owns_supply_item(uuid) to authenticated;

comment on table public.supply_items is
  'Things running low. scope=barn is Crouse own stock and is internal; scope=boarder is a request to one household and is readable by that family.';

-- -----------------------------------------------------------------------------
-- 2. water_sources — trough timers
-- -----------------------------------------------------------------------------
create table if not exists public.water_sources (
  id                     uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  name                   text not null,
  location               text not null default '',
  last_checked_at        timestamptz,
  -- How often it must be looked at. Days rather than hours: this is a trough,
  -- not a medication.
  reminder_interval_days integer not null default 1
                           check (reminder_interval_days > 0),
  notes                  text not null default ''
);

alter table public.water_sources enable row level security;

comment on table public.water_sources is
  'Water troughs and their check intervals. Overdue is computed at read time — it depends on now(), which is not immutable, so it cannot be a generated column.';

-- -----------------------------------------------------------------------------
-- 3. blanket_plans — blanketing and fly care, one plan per horse
-- -----------------------------------------------------------------------------
create table if not exists public.blanket_plans (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  horse_id      uuid not null unique references public.horses (id) on delete cascade,
  -- An ARRAY of {min_f, max_f, layer} objects. jsonb rather than a rules table
  -- for the same reason form_templates.schema is jsonb: the shape is authored
  -- by one screen, read by one screen, and a rule is not a schema change.
  -- Constrained only to be an array; the app validates the objects.
  blanket_rules jsonb not null default '[]'::jsonb,
  fly_mask      boolean not null default false,
  fly_sheet     boolean not null default false,
  fly_spray     boolean not null default false,
  notes         text not null default '',
  constraint blanket_plans_rules_is_array check (jsonb_typeof(blanket_rules) = 'array')
);

alter table public.blanket_plans enable row level security;

comment on table public.blanket_plans is
  'Per-horse blanketing and fly care. FUTURE HOOK: a weather job would read blanket_rules against a forecast to pre-fill the nightly board. Nothing reads a forecast today — the rules and the board are hand-driven this pass.';

-- -----------------------------------------------------------------------------
-- 4. turnout_plans — one plan per horse
-- -----------------------------------------------------------------------------
create table if not exists public.turnout_plans (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  horse_id      uuid not null unique references public.horses (id) on delete cascade,
  paddock       text not null default '',
  turnout_group text not null default '',
  -- 'none' is a real answer: a horse on stall rest is ON the board, marked not
  -- going out, which is the thing staff must not have to remember.
  pattern       text not null default 'daily'
                  check (pattern in ('am', 'pm', 'daily', 'none')),
  notes         text not null default ''
);

alter table public.turnout_plans enable row level security;

comment on table public.turnout_plans is
  'Per-horse turnout: where, with whom, and when. pattern=none means deliberately not turned out, which is different from having no plan.';

-- -----------------------------------------------------------------------------
-- 5. maintenance_requests
-- -----------------------------------------------------------------------------
create table if not exists public.maintenance_requests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  title       text not null,
  description text not null default '',
  priority    text not null default 'normal'
                check (priority in ('low', 'normal', 'high')),
  status      text not null default 'open'
                check (status in ('open', 'in_progress', 'done')),
  assignee_id uuid references public.profiles (id) on delete set null,
  -- Forced to the caller by the insert guard below. An unattributed issue log
  -- is worth very little.
  raised_by   uuid references public.profiles (id) on delete set null
);

alter table public.maintenance_requests enable row level security;

create index if not exists maintenance_requests_status_idx
  on public.maintenance_requests (status, priority, created_at desc);

comment on table public.maintenance_requests is
  'Broken things. Staff raise and read; resolving is gated on has_permission(manage_horses), which is admin-or-the-flag.';

-- =============================================================================
-- Insert guards.
--
-- RLS is row-level only. Where the ROW is allowed but one column must not be
-- client-supplied, the policy decides the row and a BEFORE trigger decides the
-- rest — the same split as care_events and punches.
--
-- Both restate their insert rule as well as pinning attribution, so a WITH
-- CHECK loosened in a later migration cannot fail open silently.
-- =============================================================================
create or replace function public.supply_items_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role    text;
  v_profile uuid;
begin
  -- Service-role / server-side call (the seed, a future cron): already outside
  -- RLS, and has no profile to attribute to.
  if auth.uid() is null then
    return new;
  end if;

  select p.role, p.id into v_role, v_profile
    from public.profiles p where p.user_id = auth.uid();

  if v_role is null or v_role not in ('admin', 'staff') then
    raise exception 'Only the barn may add a supply item.' using errcode = '42501';
  end if;

  new.requested_by := v_profile;
  return new;
end;
$$;

comment on function public.supply_items_guard_insert() is
  'Forces supply_items.requested_by to the calling profile and restates the barn-only insert rule.';

revoke all on function public.supply_items_guard_insert() from public, anon, authenticated;

drop trigger if exists supply_items_guard_insert on public.supply_items;
create trigger supply_items_guard_insert
  before insert on public.supply_items
  for each row execute function public.supply_items_guard_insert();

create or replace function public.maintenance_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role    text;
  v_profile uuid;
begin
  if auth.uid() is null then
    return new;
  end if;

  select p.role, p.id into v_role, v_profile
    from public.profiles p where p.user_id = auth.uid();

  if v_role is null or v_role not in ('admin', 'staff') then
    raise exception 'Only the barn may raise a maintenance request.' using errcode = '42501';
  end if;

  new.raised_by := v_profile;
  -- A request cannot be born resolved: closing one is an UPDATE, which is
  -- gated on the manage permission. Without this line a staff member could
  -- insert a row already marked done and skip that gate entirely.
  new.status := 'open';
  return new;
end;
$$;

comment on function public.maintenance_guard_insert() is
  'Forces maintenance_requests.raised_by to the caller and status to open, so a request cannot be created already-resolved and bypass the update gate.';

revoke all on function public.maintenance_guard_insert() from public, anon, authenticated;

drop trigger if exists maintenance_guard_insert on public.maintenance_requests;
create trigger maintenance_guard_insert
  before insert on public.maintenance_requests
  for each row execute function public.maintenance_guard_insert();

-- =============================================================================
-- Column guard — water_sources.
--
-- Staff mark a trough checked. They do not rename it, move it, or change how
-- often it is due: an interval a staff member can widen is a reminder that can
-- be silenced rather than answered.
-- =============================================================================
create or replace function public.water_sources_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    return new;
  end if;

  select p.role into v_role from public.profiles p where p.user_id = auth.uid();

  if v_role = 'admin' then
    return new;
  end if;

  if new.name is distinct from old.name
     or new.location is distinct from old.location
     or new.reminder_interval_days is distinct from old.reminder_interval_days
     or new.notes is distinct from old.notes
     or new.id is distinct from old.id
  then
    raise exception 'Staff may record a check, but only an admin may change a water source.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.water_sources_guard_update() is
  'Staff may write last_checked_at and nothing else on a water source. Admin is unrestricted.';

revoke all on function public.water_sources_guard_update() from public, anon, authenticated;

drop trigger if exists water_sources_guard_update on public.water_sources;
create trigger water_sources_guard_update
  before update on public.water_sources
  for each row execute function public.water_sources_guard_update();

-- =============================================================================
-- Policies — supply_items
--
--   select  admin/staff: everything. Parent: their own family's BOARDER items
--           only, via the definer helper. A parent never sees a 'barn' row.
--   write   admin/staff. Families do not add to their own list; the barn
--           notices what is running out, which is the whole point of the
--           feature.
-- =============================================================================
drop policy if exists "supply_items: read (barn all, family own boarder)" on public.supply_items;
create policy "supply_items: read (barn all, family own boarder)"
  on public.supply_items for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (select public.family_owns_supply_item(id))
  );

drop policy if exists "supply_items: barn insert" on public.supply_items;
create policy "supply_items: barn insert"
  on public.supply_items for insert to authenticated
  with check ((select public."current_role"()) in ('admin', 'staff'));

drop policy if exists "supply_items: barn update" on public.supply_items;
create policy "supply_items: barn update"
  on public.supply_items for update to authenticated
  using ((select public."current_role"()) in ('admin', 'staff'))
  with check ((select public."current_role"()) in ('admin', 'staff'));

drop policy if exists "supply_items: barn delete" on public.supply_items;
create policy "supply_items: barn delete"
  on public.supply_items for delete to authenticated
  using ((select public."current_role"()) in ('admin', 'staff'));

-- =============================================================================
-- Policies — water_sources: barn-only, all four verbs.
--
-- No parent branch anywhere. A family has no business knowing which trough was
-- last topped up, and the column guard above narrows what staff may write.
-- =============================================================================
drop policy if exists "water_sources: barn read" on public.water_sources;
create policy "water_sources: barn read"
  on public.water_sources for select to authenticated
  using ((select public."current_role"()) in ('admin', 'staff'));

drop policy if exists "water_sources: admin insert" on public.water_sources;
create policy "water_sources: admin insert"
  on public.water_sources for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "water_sources: barn update" on public.water_sources;
create policy "water_sources: barn update"
  on public.water_sources for update to authenticated
  using ((select public."current_role"()) in ('admin', 'staff'))
  with check ((select public."current_role"()) in ('admin', 'staff'));

drop policy if exists "water_sources: admin delete" on public.water_sources;
create policy "water_sources: admin delete"
  on public.water_sources for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- Policies — blanket_plans and turnout_plans
--
-- Identical shape: the barn manages, the OWNER reads their own horse's plan.
-- family_owns_horse, not family_rides_horse — a lesson rider is not entitled
-- to the rug rules for a horse they borrow.
-- =============================================================================
drop policy if exists "blanket_plans: read (barn all, owner own horse)" on public.blanket_plans;
create policy "blanket_plans: read (barn all, owner own horse)"
  on public.blanket_plans for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (select public.family_owns_horse(horse_id))
  );

drop policy if exists "blanket_plans: barn insert" on public.blanket_plans;
create policy "blanket_plans: barn insert"
  on public.blanket_plans for insert to authenticated
  with check ((select public."current_role"()) in ('admin', 'staff'));

drop policy if exists "blanket_plans: barn update" on public.blanket_plans;
create policy "blanket_plans: barn update"
  on public.blanket_plans for update to authenticated
  using ((select public."current_role"()) in ('admin', 'staff'))
  with check ((select public."current_role"()) in ('admin', 'staff'));

drop policy if exists "blanket_plans: barn delete" on public.blanket_plans;
create policy "blanket_plans: barn delete"
  on public.blanket_plans for delete to authenticated
  using ((select public."current_role"()) in ('admin', 'staff'));

drop policy if exists "turnout_plans: read (barn all, owner own horse)" on public.turnout_plans;
create policy "turnout_plans: read (barn all, owner own horse)"
  on public.turnout_plans for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or (select public.family_owns_horse(horse_id))
  );

drop policy if exists "turnout_plans: barn insert" on public.turnout_plans;
create policy "turnout_plans: barn insert"
  on public.turnout_plans for insert to authenticated
  with check ((select public."current_role"()) in ('admin', 'staff'));

drop policy if exists "turnout_plans: barn update" on public.turnout_plans;
create policy "turnout_plans: barn update"
  on public.turnout_plans for update to authenticated
  using ((select public."current_role"()) in ('admin', 'staff'))
  with check ((select public."current_role"()) in ('admin', 'staff'));

drop policy if exists "turnout_plans: barn delete" on public.turnout_plans;
create policy "turnout_plans: barn delete"
  on public.turnout_plans for delete to authenticated
  using ((select public."current_role"()) in ('admin', 'staff'));

-- =============================================================================
-- Policies — maintenance_requests
--
--   select/insert  admin/staff. Anyone on the yard can report a broken gate.
--   update/delete  has_permission('manage_horses'), which already returns true
--                  for admin — so this IS "admin or the flag", written the way
--                  every other write gate in this schema is written. Closing a
--                  request is a decision; raising one is an observation.
-- =============================================================================
drop policy if exists "maintenance_requests: barn read" on public.maintenance_requests;
create policy "maintenance_requests: barn read"
  on public.maintenance_requests for select to authenticated
  using ((select public."current_role"()) in ('admin', 'staff'));

drop policy if exists "maintenance_requests: barn insert" on public.maintenance_requests;
create policy "maintenance_requests: barn insert"
  on public.maintenance_requests for insert to authenticated
  with check ((select public."current_role"()) in ('admin', 'staff'));

drop policy if exists "maintenance_requests: manage update" on public.maintenance_requests;
create policy "maintenance_requests: manage update"
  on public.maintenance_requests for update to authenticated
  using ((select public.has_permission('manage_horses')))
  with check ((select public.has_permission('manage_horses')));

drop policy if exists "maintenance_requests: manage delete" on public.maintenance_requests;
create policy "maintenance_requests: manage delete"
  on public.maintenance_requests for delete to authenticated
  using ((select public.has_permission('manage_horses')));

-- =============================================================================
-- public.enqueue_boarder_supply_notices() — barn-triggered, idempotent.
--
-- Tells a household the barn has added something to THEIR supply list. Barn
-- items notify nobody, by construction: the WHERE clause never leaves
-- scope='boarder'.
--
-- Idempotency is by (profile_id, type, link_path), and the link carries the
-- item id — so re-running never tells the same family about the same bag of
-- shavings twice. Same key shape as enqueue_care_due_digest().
--
-- Every PARENT in the family is notified, not "the" parent: a household can
-- have two logins and there is no notion of a primary one.
--
-- TODO (deferred, matching the rest of the notification surface): call this
-- from the insert path rather than a button, once the cron/trigger story is
-- settled. A trigger here would fire inside the writer's transaction and make
-- an insert fail if notification failed, which is the wrong trade for a
-- shopping list.
-- =============================================================================
create or replace function public.enqueue_boarder_supply_notices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer;
begin
  if (select public."current_role"()) not in ('admin', 'staff') then
    raise exception 'Only the barn may send supply notices.' using errcode = '42501';
  end if;

  insert into public.notifications (profile_id, type, title, body, link_path)
  select p.id,
         'supply_boarder',
         'Supplies needed for your horse',
         s.name
           || case when s.quantity is not null
                   then ' — ' || trim(to_char(s.quantity, 'FM9999990.99'))
                        || case when s.unit <> '' then ' ' || s.unit else '' end
                   else '' end
           || '.',
         '/barn/supplies?item=' || s.id
    from public.supply_items s
    join public.profiles p
      on p.family_id = s.family_id
     and p.role = 'parent'
   where s.scope = 'boarder'
     and s.status <> 'received'
     and not exists (
       select 1 from public.notifications n
        where n.profile_id = p.id
          and n.type = 'supply_boarder'
          and n.link_path = '/barn/supplies?item=' || s.id
     );

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

comment on function public.enqueue_boarder_supply_notices() is
  'Notifies each parent in a family of boarder-scoped supply items addressed to them. Idempotent per item per profile. Barn-scoped items notify nobody. Barn-gated internally.';

-- Entry point: gated internally on role, so it is granted to authenticated and
-- taken away from everyone else. `from public` alone is not enough on Supabase
-- — anon and authenticated each carry their own default grant (migration 0015).
revoke all on function public.enqueue_boarder_supply_notices() from public, anon, authenticated;
grant execute on function public.enqueue_boarder_supply_notices() to authenticated;

commit;
