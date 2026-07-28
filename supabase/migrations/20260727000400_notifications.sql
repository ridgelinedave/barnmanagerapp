-- =============================================================================
-- 0004 — notifications (Phase 0 brief §2: "notifications table + bell icon")
--
-- The in-app notification feed behind the bell badge. Phase 0 ships the table
-- and its policies only; senders are wired per feature in Phases 1–3 (SPEC §8).
-- RLS is enabled in this same migration, per the hard rule.
--
-- NOT APPLIED YET. See README → "Part 2: connect Supabase".
-- =============================================================================

begin;

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  link_path   text,
  read_at     timestamptz
);

alter table public.notifications enable row level security;

-- Powers the unread badge query: own rows, unread first.
create index if not exists notifications_profile_unread_idx
  on public.notifications (profile_id, read_at, created_at desc);

comment on table public.notifications is
  'In-app notification feed. One row per recipient. Inserted server-side only.';

-- -----------------------------------------------------------------------------
-- Policies: a user sees only their own notifications. Nobody but an admin can
-- create them from a client; in practice they are inserted by server-side jobs
-- using the service role, which bypasses RLS.
-- -----------------------------------------------------------------------------
drop policy if exists "notifications: read own" on public.notifications;
create policy "notifications: read own"
  on public.notifications for select to authenticated
  using (profile_id = (select public.current_profile()));

drop policy if exists "notifications: mark own read" on public.notifications;
create policy "notifications: mark own read"
  on public.notifications for update to authenticated
  using (profile_id = (select public.current_profile()))
  with check (profile_id = (select public.current_profile()));

drop policy if exists "notifications: admin insert" on public.notifications;
create policy "notifications: admin insert"
  on public.notifications for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

-- No DELETE policy: the feed is append-only from a client's point of view.

-- -----------------------------------------------------------------------------
-- Column-level protection. RLS is row-level, so without this a recipient could
-- rewrite the title or body of a notification they received. The only column a
-- client ever needs to write is read_at.
-- -----------------------------------------------------------------------------
revoke update on public.notifications from authenticated;
grant  update (read_at) on public.notifications to authenticated;

commit;
