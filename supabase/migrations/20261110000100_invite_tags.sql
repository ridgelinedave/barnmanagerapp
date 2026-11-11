-- 0031 — tags on an invite: the person is tagged the moment they accept.
--
-- APPROVED 2026-11-10 (David) and applied as printed. Lives in
-- supabase/migrations/; applied with `npm run db:apply -- <file>`, then
-- `npm run db:gate`, with its assertions in tests/policies.test.mjs.
--
-- WHY. Belle is bringing her Circle members into the Academy. Without this,
-- giving one access is two steps with a wait between: invite them, then — only
-- after they have accepted and so exist as a login — add them to the tag. With
-- it, she picks the tag ON THE INVITE and they arrive with access.
--
-- WHAT. public.invite_tags (invite_id, tag_id): which tags an invite carries.
-- Admin only, RLS in this migration, default deny for everyone else (an invitee
-- never reads it — the claim runs server-side). Deleting an invite or a tag
-- deletes the link.
--
-- THE CLAIM (app/invite/[token]/actions.ts) is the only reader besides the
-- admin. It runs with the service role, so RLS does not guard it; its own rule
-- 1 does: the tags are read from invite_tags for THIS invite, never from
-- anything the claimant posts — exactly like role and family_id. If copying
-- them onto the new profile fails, the account is rolled back and the invite
-- released (the same as a failed profile insert), so nobody ends up with a
-- login but without the access they were promised.
--
-- No function, no trigger: nothing new for the standing guard to classify.
-- Idempotent: safe to re-run.

begin;

create table if not exists public.invite_tags (
  invite_id  uuid not null references public.invites (id) on delete cascade,
  tag_id     uuid not null references public.tags (id) on delete cascade,
  primary key (invite_id, tag_id)
);

alter table public.invite_tags enable row level security;

create index if not exists invite_tags_tag_id_idx on public.invite_tags (tag_id);

comment on table public.invite_tags is
  'Tags an invite carries; copied onto the new profile at claim (server-side, from this table only). Admin only.';

drop policy if exists "invite_tags: admin read" on public.invite_tags;
create policy "invite_tags: admin read"
  on public.invite_tags for select to authenticated
  using ((select public."current_role"()) = 'admin');

drop policy if exists "invite_tags: admin insert" on public.invite_tags;
create policy "invite_tags: admin insert"
  on public.invite_tags for insert to authenticated
  with check ((select public."current_role"()) = 'admin');

drop policy if exists "invite_tags: admin delete" on public.invite_tags;
create policy "invite_tags: admin delete"
  on public.invite_tags for delete to authenticated
  using ((select public."current_role"()) = 'admin');

-- No UPDATE policy: a link is added or removed, never edited.

commit;

-- =============================================================================
-- ASSERTIONS to add with it (tests/policies.test.mjs), control first:
--   control: admin links a tag to an invite and reads it back;
--   a client and staff CANNOT read invite_tags; a client CANNOT add a link
--   (to their own or any invite) nor delete one (re-read unchanged); anon
--   reads nothing; deleting the tag removes the link; deleting the invite
--   removes the link.
-- And behaviourally, on a production build: an invite carrying a tag, claimed
-- through /invite/<token> by a new test login, lands with that tag and sees a
-- course for that tag at once; the test login is deleted afterwards.
-- =============================================================================
