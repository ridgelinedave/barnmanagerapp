# Feed board as a whiteboard — layout proposal (2026-10-20)

**Status: PROPOSED, not built.** Needs David's (and Belle's) yes before code.

The board replaces a physical whiteboard in the aisle. It is read standing,
often at arm's length, often with a bucket in one hand. Today it is a list of
horses that each open a chart — right for "tell me about this horse", wrong for
"what goes in every bucket this morning".

## The grid

**Rows are horses, columns are meals.** The same grid a barn draws on a real
whiteboard, so it needs no learning.

```
              AM                 MIDDAY            PM
CHAPPELL      2 qt Senior        —                 2 qt Senior
              ½ scoop SmartPak                     1 flake alfalfa
TURBO         1 qt ration bal.   1 flake           1 qt ration bal.
  ● Bute 1 g · day 2 of 3 · next due Thu Oct 22
FIXTURE ...
```

- **The meal that is next is the one that is loud.** The current/next meal
  column (by the barn's clock: before 10:00 AM, before 2:00 PM, then PM) sits
  on the white surface; the others recede to muted ink. At arm's length the eye
  goes straight to "what do I do now". Meal cut-off times would be new values
  in `config/barn.ts`.
- **Horse name in Marcellus at 22px**, the barn name if there is one; the
  photo circle is dropped here — on a whiteboard the name is the key, and the
  width is needed for feed.
- **Feed in Barlow at body size, one line per item**, quantity first
  (`2 qt Senior`) because the quantity is what gets measured into the bucket.
- **An empty cell is an em dash**, never blank — blank reads as "forgot".
- **Special instructions and recent care** (5.2, built) run full-width under
  the horse's row in accent-text: "Bute 1 g · day 2 of 3 · next due Thu".
  Anything due today gets the gold-tint band so it cannot be missed.

## Widths

- **Desktop / a tablet on a wall (≥ 768px):** the full grid, all three meals.
  This is the real whiteboard and the main target.
- **Phone (320–767px):** one meal at a time — a three-way segmented control
  (AM / Midday / PM) opening on the current meal, horses as rows under it. Three
  columns of feed at 320px would either scroll sideways (banned) or wrap into
  noise.
- **Wall mode:** a `?wall=1` view with no chrome, larger type and an auto
  refresh every few minutes, for a tablet mounted in the aisle. Optional; only
  if Belle wants a mounted screen.

## What stays the same

Tapping a horse still opens its full chart. The data is the existing
`feedBoardByHorse()` plus `careRecentByHorse()` — no new SQL.

## Open questions for the barn

1. Meal cut-off times (when does "AM" stop being the loud column)?
2. Is a wall-mounted tablet real, or is it always a phone in a pocket?
3. Should a horse with no chart for a meal show "—" or be hidden from that
   meal's phone view?
