-- =============================================================================
-- 0013 — form_templates + form_submissions (Phase 2, slice 4)
--
-- Waivers, liability releases, emergency contacts, boarding agreements. The
-- barn defines a template once; each family gets a submission to fill and sign.
--
-- THE PROPERTY THAT MATTERS: a signature must mean something. Everything here
-- exists to stop a submission being marked complete without one, or being
-- edited after it was signed:
--
--   * a parent may only ever touch their OWN family's submissions   (policy)
--   * they may not move a submission to another family, or point it at another
--     template or another family's rider                            (trigger)
--   * status may only go pending -> complete, and only WITH a signature; the
--     signature timestamp is set by the database, never by the client (trigger)
--   * once complete, a parent cannot edit it at all                 (trigger)
--
-- The row policy decides WHICH rows; the trigger decides which CHANGES. Neither
-- is sufficient alone — this is the same split as profiles, tasks and
-- lesson_riders.
--
-- STAFF SEE NOTHING HERE. These are legal and personal documents between the
-- family and the barn owner; an employee has no reason to read them.
--
-- Idempotent, safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- form_templates — the barn's blank forms.
--
-- `schema` is a jsonb array of field definitions, rendered by the app:
--   [{"key":"emergency_contact","label":"Emergency contact","type":"text",
--     "required":true}, ...]
-- Kept as jsonb rather than modelled as columns because the barn will add
-- fields we have not thought of, and a form field is not a schema change.
-- -----------------------------------------------------------------------------
create table if not exists public.form_templates (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  description text not null default '',
  schema      jsonb not null default '[]'::jsonb,
  -- Required forms are the ones a family must complete to be fully onboarded.
  required    boolean not null default true,
  -- 'family' — one per household. 'rider' — one per rider in the household.
  applies_to  text not null default 'family' check (applies_to in ('family', 'rider')),
  active      boolean not null default true,
  constraint form_templates_schema_is_array check (jsonb_typeof(schema) = 'array')
);

alter table public.form_templates enable row level security;

create index if not exists form_templates_active_idx on public.form_templates (active, name);

comment on table public.form_templates is
  'Blank forms the barn asks families to complete. `schema` is a jsonb array of field definitions rendered by the app.';

-- -----------------------------------------------------------------------------
-- form_submissions — one family's answers to one template.
-- -----------------------------------------------------------------------------
create table if not exists public.form_submissions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  template_id uuid not null references public.form_templates (id) on delete cascade,
  family_id   uuid not null references public.families (id) on delete cascade,
  -- Set only for 'rider' templates.
  rider_id    uuid references public.riders (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  signed_name text,
  signed_at   timestamptz,
  status      text not null default 'pending' check (status in ('pending', 'complete')),
  -- The PDF written to the documents vault on completion. Null until then.
  document_path text,
  -- A completed submission carries a signature. Enforced here as well as in the
  -- trigger, so a service-role script cannot create a signature-less "complete"
  -- row either.
  constraint form_submissions_complete_is_signed check (
    status = 'pending'
    or (signed_at is not null and signed_name is not null and length(btrim(signed_name)) > 0)
  ),
  constraint form_submissions_one_per_scope unique nulls not distinct (template_id, family_id, rider_id)
);

alter table public.form_submissions enable row level security;

create index if not exists form_submissions_family_idx on public.form_submissions (family_id, status);
create index if not exists form_submissions_template_idx on public.form_submissions (template_id);

comment on table public.form_submissions is
  'One family''s answers to one template. Parents fill and sign their own; staff see nothing. Completion requires a signature (CHECK + trigger).';
comment on column public.form_submissions.document_path is
  'Path in the private `documents` bucket of the signed PDF. Written server-side on completion.';

-- =============================================================================
-- Guard trigger — which CHANGES a parent may make.
--
-- The policy already restricts which ROWS they can see and update. This decides
-- what a permitted update is allowed to do, which a row policy cannot express.
-- =============================================================================
create or replace function public.form_submissions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role   text;
  v_family uuid;
begin
  -- Service-role / server-side (the seed, the PDF writer); already outside RLS.
  if auth.uid() is null then
    return new;
  end if;

  select p.role, p.family_id into v_role, v_family
    from public.profiles p where p.user_id = auth.uid();

  if v_role = 'admin' then
    return new;
  end if;

  if v_role is distinct from 'parent' then
    raise exception 'Only the family may complete their own forms.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.family_id is distinct from v_family then
      raise exception 'You can only start a form for your own family.' using errcode = '42501';
    end if;
    -- A form starts blank and unsigned, whatever the client says. Without this
    -- a parent could INSERT a row that is already 'complete' and skip the
    -- signature path entirely.
    new.status := 'pending';
    new.signed_at := null;
    new.signed_name := null;
    new.document_path := null;
    return new;
  end if;

  -- UPDATE from here.
  if old.family_id is distinct from v_family then
    raise exception 'That form belongs to another family.' using errcode = '42501';
  end if;

  -- Immutable identity: a family may answer a form, not re-point it at a
  -- different template, a different household, or another family's rider.
  if new.family_id is distinct from old.family_id
     or new.template_id is distinct from old.template_id
     or new.rider_id is distinct from old.rider_id then
    raise exception 'A form cannot be moved to another family, rider or template.'
      using errcode = '42501';
  end if;

  -- Signed means signed. Corrections are the barn's to make.
  if old.status = 'complete' then
    raise exception 'That form is already signed. Ask the barn if it needs changing.'
      using errcode = '42501';
  end if;

  if new.status = 'complete' then
    if new.signed_name is null or length(btrim(new.signed_name)) = 0 then
      raise exception 'Type your name to sign the form.' using errcode = '42501';
    end if;
    -- The signing time is the database's to state, not the client's.
    new.signed_at := now();
  else
    -- Still in progress: no signature may be recorded.
    new.signed_at := null;
    new.signed_name := null;
  end if;

  -- The PDF path is written server-side after signing, never by the family.
  new.document_path := old.document_path;

  return new;
end;
$$;

comment on function public.form_submissions_guard() is
  'Decides which CHANGES a parent may make to their own submission: identity columns are immutable, completion requires a signature, signed_at is set by the database, and a signed form cannot be edited.';

drop trigger if exists form_submissions_guard on public.form_submissions;

create trigger form_submissions_guard
  before insert or update on public.form_submissions
  for each row
  execute function public.form_submissions_guard();

-- =============================================================================
-- Policies — form_templates
--
--   select  admin, and parents (they have to render the form they are filling)
--   write   admin only
--
-- Staff are absent on purpose.
-- =============================================================================
drop policy if exists "form_templates: read (admin all, parents active)" on public.form_templates;
create policy "form_templates: read (admin all, parents active)"
  on public.form_templates for select to authenticated
  using (
    (select public."current_role"()) = 'admin'
    or ((select public."current_role"()) = 'parent' and active)
  );

drop policy if exists "form_templates: admin insert" on public.form_templates;
create policy "form_templates: admin insert"
  on public.form_templates for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "form_templates: admin update" on public.form_templates;
create policy "form_templates: admin update"
  on public.form_templates for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "form_templates: admin delete" on public.form_templates;
create policy "form_templates: admin delete"
  on public.form_templates for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- Policies — form_submissions
--
--   select  admin all; parent their own family's
--   insert  admin; parent for their own family
--   update  admin; parent for their own family (the trigger decides what a
--           permitted update may actually change)
--   delete  admin only — a family cannot make a signed form disappear
-- =============================================================================
drop policy if exists "form_submissions: read (admin all, parent own family)" on public.form_submissions;
create policy "form_submissions: read (admin all, parent own family)"
  on public.form_submissions for select to authenticated
  using (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'parent'
      and family_id = (select public.current_family())
    )
  );

drop policy if exists "form_submissions: insert (admin, parent own family)" on public.form_submissions;
create policy "form_submissions: insert (admin, parent own family)"
  on public.form_submissions for insert to authenticated
  with check (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'parent'
      and family_id = (select public.current_family())
    )
  );

drop policy if exists "form_submissions: update (admin, parent own family)" on public.form_submissions;
create policy "form_submissions: update (admin, parent own family)"
  on public.form_submissions for update to authenticated
  using (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'parent'
      and family_id = (select public.current_family())
    )
  )
  with check (
    (select public."current_role"()) = 'admin'
    or (
      (select public."current_role"()) = 'parent'
      and family_id = (select public.current_family())
    )
  );

drop policy if exists "form_submissions: admin delete" on public.form_submissions;
create policy "form_submissions: admin delete"
  on public.form_submissions for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- =============================================================================
-- ensure_family_onboarding(family) — admin only, idempotent. Returns rows made.
--
-- Creates one pending submission per required active template for a family:
-- 'family' templates once, 'rider' templates once per active rider. This is
-- what turns "the barn added a new waiver" into "every family sees it on their
-- checklist" without anyone hand-creating rows.
--
-- Idempotent through the unique constraint on (template_id, family_id,
-- rider_id) — NULLS NOT DISTINCT, so a family-scoped row cannot be duplicated
-- by a null rider_id either.
-- =============================================================================
create or replace function public.ensure_family_onboarding(family uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer;
begin
  if (select public."current_role"()) is distinct from 'admin' then
    raise exception 'Only an admin may set up a family''s onboarding.' using errcode = '42501';
  end if;

  insert into public.form_submissions (template_id, family_id, rider_id)
  select t.id, family, null
    from public.form_templates t
   where t.active and t.required and t.applies_to = 'family'
  union all
  select t.id, family, r.id
    from public.form_templates t
    cross join public.riders r
   where t.active and t.required and t.applies_to = 'rider'
     and r.family_id = family and r.active
  on conflict do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

comment on function public.ensure_family_onboarding(uuid) is
  'Creates the pending submissions a family owes: one per required active family template, one per rider for rider templates. Admin-gated, idempotent.';

revoke all on function public.ensure_family_onboarding(uuid) from public, anon;
grant execute on function public.ensure_family_onboarding(uuid) to authenticated;

commit;
