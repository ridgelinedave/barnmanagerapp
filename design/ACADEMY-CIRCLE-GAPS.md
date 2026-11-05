# Academy ↔ Circle — gap list

Written 2026-11-05 for Belle's move off Circle (Nov 8). Ranked by **"would a
member or Belle notice on day one"**. One line per gap.

**SOURCE — read this first.** There are **no Circle screenshots in this repo**
(searched `design/`, `assets/`, the whole tree and git history; the only
screenshots, in `competitor research/barn ops/`, are of a different barn app).
So no line below is "from the screenshots". Each says one of:

- **Docs** — Circle's own help centre describes it (help.circle.so, course
  setup and lesson settings pages, read 2026-11-05).
- **Inferred** — not in the pages read; assumed from how course platforms
  usually behave. Belle should confirm.

Put Belle's screenshots in `design/circle/` and this list gets re-checked
screen by screen.

**Out of scope, deliberately:** Circle's Spaces, Events, Members and messaging
(her community doesn't use them).

`SQL` = needs a migration (printed to `supabase/pending/` for audit).

| # | Gap | Who notices | Circle | Monarch today | SQL | Status |
|---|-----|-------------|--------|---------------|-----|--------|
| 1 | **Next lesson at the end of a video** — Circle auto-advances 10 s after the video ends, with a countdown the member can cancel | member, every lesson | Docs | Video ends; member must find Next | no | |
| 2 | **Resume a video where you left off** | member, any long lesson | Inferred | Starts from 0 every time | no (this device) · yes (across devices) | |
| 3 | **Lesson attachments (PDFs)** — Circle: up to 15 files per lesson, a Files icon members tap to download | Belle while loading; members | Docs | None | yes | |
| 4 | **Draft / published per lesson** — Circle hides a draft lesson from members inside a published course | Belle while loading over three days | Docs | Draft is per course only | yes | |
| 5 | **Formatted lesson description** — Circle's lesson editor has rich text, links, images, embeds | members, Belle | Docs | Plain-text notes under the video; links are not clickable | no (Markdown in the existing notes column) | |
| 6 | **Course complete state** — a finished course reads as finished | member who finishes | Inferred | 100% bar and "Watch again"; nothing says complete | no | |
| 7 | **Course and section totals with duration** ("12 lessons · 1 h 40 min") | member choosing a course | Inferred | "N sections · M lessons", per-section counts; no durations | no | |
| 8 | **Preview as a member** — Circle's "View as student" | Belle before publishing | Docs | Admin sees the editor, not the member view | no | |
| 9 | Enrolled-member count on a course card | Belle | Docs (open courses) | Admin sees "Who is watching" on the course page; members see no count | yes (a count members may read) | |
| 10 | Featured media can be audio, not only video | Belle, if she has audio lessons | Docs | Video only | no | |
| 11 | Lesson comments | members, if her community used them | Docs | None | yes | not planned unless asked |
| 12 | Quizzes | members, if she used them | Docs | None | yes | not planned unless asked |
| 13 | Drip schedules (structured / scheduled courses) | members of a dripped course | Docs | All lessons open at once | yes | not planned unless asked |
| 14 | Access by tag (who may see a course) | Belle | — (requested 2026-11-03) | Everyone or one level | yes — `pending/20261103000100_access_tags.sql` | SQL printed |

**Already at parity** (no gap): course grid with cover and category filter
(Circle's topic bar), Enroll on the card, course outline with collapsible
sections and lesson counts, completion circles, mark complete by hand,
automatic completion at 90% watched (Circle's "enforce video completion" is
the same 90%), progress percent, Continue to the next incomplete lesson,
drafts per course, signed private video and thumbnails, bulk upload in
filename order.

**Questions for Belle** (they change the rank of 10–13): did any of her Circle
lessons have audio-only media, comments in use, quizzes, or a drip schedule?
