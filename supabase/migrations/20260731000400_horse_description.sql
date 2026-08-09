-- =============================================================================
-- 0019 — colour, sex and height on `horses`
--
-- NOT APPLIED YET — printed for audit first.
--
-- WHY: the feed board's list row reads "Bay gelding · 16.2h" (see
-- design/mockups/feedboard.html). None of those three facts has a column
-- today, so lib/horse-display.ts currently reads the descriptive half out of
-- `breed` and PARSES THE HEIGHT OUT OF THE FRONT OF `notes` with a regex.
--
-- That works and it is wrong: a free-text field being mined for a structured
-- value breaks the first time someone writes a note starting with a number,
-- and it cannot be sorted, filtered or validated. These are three of the most
-- basic facts about a horse and they deserve columns.
--
-- NO RLS WORK IS NEEDED. `horses` already has its policies (migration 0010)
-- and they are row-level; adding columns does not change who can see a row.
-- There is no new function, so nothing to revoke and no advisor surface.
--
-- `height_hands` is numeric(3,1), not text: hands are measured in whole hands
-- plus inches expressed as a decimal (16.2 = sixteen hands two inches), and the
-- CHECK keeps the inches part inside 0–3 the way the notation actually works —
-- there is no such height as 16.7h.
--
-- Idempotent, safe to re-run.
-- =============================================================================

begin;

alter table public.horses add column if not exists colour       text;
alter table public.horses add column if not exists sex          text;
alter table public.horses add column if not exists height_hands numeric(3,1);

alter table public.horses drop constraint if exists horses_sex_known;
alter table public.horses
  add constraint horses_sex_known
  check (sex is null or sex in ('mare', 'gelding', 'stallion', 'filly', 'colt'));

-- 16.2h is sixteen hands and two inches. The fractional part is inches, so it
-- can only be 0-3; 16.7h is not a height, it is a typo.
alter table public.horses drop constraint if exists horses_height_is_hands;
alter table public.horses
  add constraint horses_height_is_hands
  check (
    height_hands is null
    or (
      height_hands > 0
      and height_hands < 30
      and (height_hands * 10)::int % 10 <= 3
    )
  );

comment on column public.horses.colour is
  'Coat colour as the barn says it — "Bay", "Chestnut", "Grey". Display only.';
comment on column public.horses.sex is
  'mare / gelding / stallion / filly / colt.';
comment on column public.horses.height_hands is
  'Height in hands, inches as the decimal: 16.2 = 16 hands 2 inches. Fractional part is 0-3.';

commit;
