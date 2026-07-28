-- =============================================================================
-- 0005 — announcements (Phase 1, slice 1)
--
-- Barn news. Admin writes; staff and parents read, filtered by audience.
-- RLS is enabled in this same migration, per the standing rule.
--
-- Audience is the whole security story here: an announcement marked 'staff' is
-- internal (rota changes, pay period notes) and a parent must never see it.
-- That is enforced by the RLS policy, not by a WHERE clause in the app — the
-- app's query is unfiltered on purpose, so a forgotten filter cannot leak.
--
-- NOT APPLIED BY THIS REPO. Paste into the Supabase SQL Editor. Safe to re-run.
-- =============================================================================

begin;

create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  title       text not null check (length(btrim(title)) > 0),
  -- Named body_md per SPEC §5. Phase 1 renders it as plain text with line
  -- breaks; the rich-text editor arrives with the content admin surfaces.
  body_md     text not null default '',
  pinned      boolean not null default false,
  notify      boolean not null default false,
  audience    text not null default 'all' check (audience in ('all', 'staff')),
  author      uuid references public.profiles (id) on delete set null,
  posted_at   timestamptz not null default now(),
  -- Set by the fan-out trigger below the first time notifications go out.
  -- Makes the fan-out idempotent: editing an announcement afterwards must not
  -- re-notify everyone.
  notified_at timestamptz
);

alter table public.announcements enable row level security;

-- Home lists pinned first, then newest. Audience is in the index because every
-- parent read filters on it.
create index if not exists announcements_feed_idx
  on public.announcements (audience, pinned desc, posted_at desc);

create index if not exists announcements_author_idx on public.announcements (author);

comment on table public.announcements is
  'Barn announcements. audience=staff is internal and never visible to parents.';

-- -----------------------------------------------------------------------------
-- Policies
--   admin  — full CRUD
--   staff  — read every announcement, both audiences
--   parent — read audience='all' only
--
-- A signed-in user with no profiles row has no role, so the read policy matches
-- nothing for them. Being authenticated is not enough; you need a role.
-- -----------------------------------------------------------------------------
drop policy if exists "announcements: read (audience-scoped)" on public.announcements;
create policy "announcements: read (audience-scoped)"
  on public.announcements for select to authenticated
  using (
    (select public."current_role"()) in ('admin', 'staff')
    or ((select public."current_role"()) = 'parent' and audience = 'all')
  );

drop policy if exists "announcements: admin insert" on public.announcements;
create policy "announcements: admin insert"
  on public.announcements for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "announcements: admin update" on public.announcements;
create policy "announcements: admin update"
  on public.announcements for update to authenticated
  using ((select public."current_role"()) = 'admin')
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "announcements: admin delete" on public.announcements;
create policy "announcements: admin delete"
  on public.announcements for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- -----------------------------------------------------------------------------
-- Notification fan-out.
--
-- Runs in the database rather than in a route handler so that posting an
-- announcement and notifying its audience are one atomic act. There is no code
-- path that can create an announcement with notify=true and silently skip the
-- notifications — including a future CSV import or an admin working directly in
-- the SQL Editor.
--
-- BEFORE (not AFTER) so notified_at can be set on the row being written instead
-- of issuing a second UPDATE, which would re-enter this trigger.
--
-- SECURITY DEFINER because it inserts into notifications on behalf of other
-- users, which the caller's own RLS policies rightly forbid.
--
-- TODO (deferred, SPEC §8): mirror each notification to email via Resend, honouring
-- notification_prefs. In-app only for now — nothing here sends mail.
-- -----------------------------------------------------------------------------
create or replace function public.announcements_fan_out_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only fan out once, and only when asked to.
  if new.notify is not true or new.notified_at is not null then
    return new;
  end if;

  insert into public.notifications (profile_id, type, title, body, link_path)
  select p.id,
         'announcement',
         new.title,
         -- Preview only; the full text lives on the announcement itself.
         left(coalesce(new.body_md, ''), 280),
         '/home'
    from public.profiles p
   where p.id is distinct from new.author        -- don't notify the author
     and (
       new.audience = 'all'
       or (new.audience = 'staff' and p.role in ('admin', 'staff'))
     );

  new.notified_at := now();
  return new;
end;
$$;

comment on function public.announcements_fan_out_notifications() is
  'Writes one notifications row per recipient when an announcement is posted with notify=true. Idempotent via announcements.notified_at.';

drop trigger if exists announcements_fan_out_notifications on public.announcements;

create trigger announcements_fan_out_notifications
  before insert or update on public.announcements
  for each row
  execute function public.announcements_fan_out_notifications();

commit;
