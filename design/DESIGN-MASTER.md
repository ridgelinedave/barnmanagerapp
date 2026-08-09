# Crouse App — Design & Build Master Doc (v1)

The running source of truth for the aesthetic/personality pass. David reviews section-by-section; this records every decision and hands Claude Code discrete jobs. Keep it updated as we lock things.

---

## 0. Through-lines (apply everywhere, every screen)

- **No emojis. Anywhere.** Remove every generic emoji/glyph across all pages. Icons come from ONE line-icon set (see §Icons), never emoji.
- **Kill the chatter.** Strip the long explanatory/demo copy that's on screens now. This is a real tool, not a tutorial. Labels short, one line max. If a screen explains itself, it's over-explaining.
- **Color = black / white / gold. No cream, no beige.** Retire the cream tokens entirely. (Light vs dark for the app body is the one open decision — see §1.)
- **Personality comes from craft, not decoration:** type, spacing, motion, voice — not stock imagery or flourishes.
- **Two brand layers:** "Crouse skin" (name, logo, colors) swaps per barn; "product character" (buttons, motion, icons, empty-state voice, layout) stays. Tag new work as one or the other.

---

## 1. Color system — DECISION PENDING

Retire cream. Palette is black, white, gold (`#DABC51` / deep `#C9AA3F`), with charcoal `#1C1B18` for near-black.

**DECIDED — Light app, dark chrome.** Paper-white content for daylight/barn readability; black top bar + bottom nav + gold accents echo the login so it reads as one product. Retire cream; content areas white with hairline dividers, near-black `#1C1B18` chrome, gold accents. Login stays dark (§2). (David deferred the call to Web Architect; locked on field-first readability.)

---

## 2. Sign-in — LOCKED

- Single **email + password**. No magic-link / "email link" option.
- Barn wordmark at top (placeholder monogram + CROUSE / EQUESTRIAN until Belle's real logo lands — this block is "Crouse skin," swaps per barn).
- Email field, Password field **with show/hide eye toggle**.
- Gold **Sign In** button.
- **"Forgot my password"** at the bottom.
- Black screen, white text, gold accent. This is the ONE dark screen; it opens into the (light or dark — see §1) app.
- **Field style: Option B** — ghost/dark fields with a hairline that turns gold on focus. (Chosen over white fields.)
- **Button refinement (de-AI the button):** the generic look = full pill + flat fill + centered label. Move toward: sharper corner radius (~4px, not a pill), Barlow Condensed uppercase tracked label (keep), a subtle tactile press state (1px depress + deeper gold), optionally a hairline gold keyline or a small trailing "→". Web Architect to mock 2–3 button treatments for David to pick.

---

## 3. Loading / splash

- Current: content just pops in; a logo sits on grey. David dislikes the grey.
- **New:** black background + logo, calm fade/scale-in. Real **skeleton loaders** for content areas (not spinners, not instant pop). Loading should feel intentional and branded.

---

## 4. Demo / seed data — DO THIS FIRST

- Nothing past the login can be judged empty. Seed a **realistic demo dataset** behind a dev/demo flag: several horses (with photos), riders/families, staff, a week of lessons, tasks, care events, a couple of forms, 2–3 past shows with results, announcements.
- This makes empty states, cards, feed board, calendar, and home all reviewable for real.
- Keep it clearly a demo seed (flag-gated), never mixed into real barn data.

---

## 5. Forms — FIX + RESTYLE (functional gaps + look)

Current problems David hit:
- No way to **create/edit templates** (page shows "Templates" but you can't add one).
- No way to **issue/assign** a form to a family/rider.
- "Still to sign → nobody" empty state + the overall format feels off.

Build:
- **Template authoring UI** (admin): create a form, name it, add fields, mark required, family- vs rider-scoped, activate.
- **Issue flow:** assign a template to a family/rider (or "everyone"), which creates their pending submission.
- **Restyle** (Web Architect direction): think **checklist-of-cards**, not a table. Each outstanding form = a card with who owes it, what it is, and a status chip (Awaiting / Signed). Admin view groups by "Needs signature" vs "Complete." Calm, roomy, one action per card. No legal-heavy density.

---

## 6. Calendar — BUILD A REAL CALENDAR

- Concern: there's no actual calendar view; it says "generate the next 4 weeks."
- Build a proper calendar with a **Month / List toggle** (and consider Week). Parents default to a readable month grid; staff/admin can list. Aggregates lessons + events + care-due + shows into one view. Tap a day → what's on it.

---

## 7. Shows / Show-Team Hub — BUILD (admin can't add anything today)

Current: nothing addable under the Shows tab. Build the hub David + research already scoped:
- **Admin can create a show** and add: info/details, roster (who's going, which horse, classes), ride times.
- **Polls & questions** to the team ("who needs a braider?", RSVPs).
- **Announcements/info** per show (pinned, pushes for time-sensitive).
- **Show history:** past show names + **ribbon/placing counts** per rider/horse (a season record that doubles as recognition).
- **Galleries by show** — a photo set attached to each show (this is the one "gallery" that has a purpose: it belongs to a specific show).
- Presented as the "This Weekend" hub: my next ride time, next departure, latest update in zero taps.

---

## 8. CE Academy — BUILD

- A section where Belle uploads **videos with text underneath, grouped into modules**, that lesson students watch in-app.
- No paywall for now. This is the piece that could replace her $129/mo Circle.
- Naming to explore: "Crouse Equestrian & Academy."

---

## 9. Feed board — CREATIVE DIRECTION (by horse)

- David's idea (good): **by horse**. A grid/list of horses, each a **name + photo** card. Tap a horse → its **feed chart** (AM/PM, hay, grain, supplements, notes) on its own clean screen.
- Makes the feed board glanceable and personal instead of a spreadsheet. The horse photo is a "photo with a purpose" (it identifies that horse), matching our photography rule.

---

## 10. Chrome — buttons, cards, rows, icons

- **Buttons (#7):** currently generic ("every AI app does that"). Want distinctive — see §2 button refinement; apply the same character to all primary buttons. Secondary buttons = ghost/underline, not grey pills.
- **Cards & rows (#8):** review `/lessons` specifically. Direction: editorial rows with hairline dividers over heavy boxed cards; more whitespace; drop default drop-shadows; let type hierarchy carry it.
- **Icons (#11):** ONE consistent line-icon set, uniform weight (~1.75px), rounded caps. Product character, not barn. No emoji ever.
- **Bottom nav (#6):** David — DONE FOR NOW.

---

## 11. Voice / copy

- Cut all demo-explainer text.
- Microcopy: warm but short. "Save" can have a little life, but no paragraphs.
- Error/denial messages: human sentences, not database errors (mostly done in security work — extend to all UI).
- Empty states: warm and specific ("No horses yet — add the first one"), never "No records found."

---

## 12. Screens still to review (need demo data first)

David reviewed through #15 and paused — everything past it reads the same while empty. After §4 (demo seed) lands, resume section-by-section: Home, Announcements, Horse profile + feed board, Care history, Tasks, Clock in/out, Lessons, Documents, Onboarding forms, Calendar, Team panel, Invite claim page, Notifications.

---

## 13. Build order (recommended)

1. **Demo seed data** (§4) — unblocks all review.
2. **Color system** (§1) once David picks theme — retire cream, apply black/white/gold.
3. **Loading/splash** (§3) + **button character** (§2).
4. **Forms** fix (§5), **Calendar** (§6) — functional gaps.
5. **Feed board** by-horse (§9).
6. **Shows hub** (§7), **CE Academy** (§8) — the big new sections.
7. Screen-by-screen polish (§12) as we go.

Each still follows the standing rules: any new SQL printed for audit before apply, full green gate, flags off until reviewed.

---

## Open decisions for David
- ~~**§1 App theme**~~ — DECIDED: light app, dark chrome.
- **§2 Button:** confirmed direction (squared gold, tactile, arrow) — shown in feed board mockup.
- Rider **age brackets** (still outstanding from the Team panel).
- **CE Academy** naming ("Crouse Equestrian & Academy"?).
- **Are we truly pursuing selling to other barns?** This gates multi-tenant timing (see §15).

---

## 14. Roadmap & platform decisions (planning — not yet built)

### 14a. Notifications (reach)
- **Web push (PWA):** works well on Android/desktop; on iPhone only if the user "Add to Home Screen," and less reliable than native.
- **SMS (Twilio):** hits any phone, no app, no install — likely the most reliable channel for barn/show-day alerts.
- **Native app** (thin App Store wrapper) later — for rock-solid iPhone push and credibility when selling.
- **Plan:** web push + SMS now; native app when selling seriously. Needs the email service (Resend) for email mirrors.

### 14b. Desktop / responsive
- It's **already a browser app** (localhost). "Mobile-only" is the *layout*, not the technology.
- Add responsive desktop layouts: mobile-first for parents/riders/yard staff; a strong desktop experience for admin/office/billing/reports (where the real power lives, and where Barn Ops is weak).
- Important for **selling** (prospects evaluate on a laptop). Shared data/logic — this is layout work, not re-architecture.

### 14c. Billing — two separate things, don't conflate
- **(1) Barns pay us** = the SaaS subscription (see §15).
- **(2) Belle bills her people** (board / lessons / show fees) = this item.
- **Core model (build once):** billable items (recurring board, one-off lessons/shows/supplies), who owes what, paid/unpaid status, a parent-facing balance/pay screen.
- Then either **QuickBooks sync** (Belle asked; lower lift, keeps her books) **or native Stripe** (invoices, cards on file, autopay board, pay-now). Native = moving other people's money → real legal/compliance weight (Stripe Connect).
- **Plan:** build the billing core, wire QuickBooks for Crouse, offer native Stripe autopay as a premium tier later. Heaviest feature — sequence deliberately.

### 14d. Chat — phase it
- Belle wants barn / team / boarder scopes. Technically fits Supabase Realtime; the security model already knows how to wall channels off by role.
- Full free-form chat is a **big build + ongoing burden** (moderation, attachments, per-message notifications, scope creep).
- **Lighter first step:** comments/reactions on announcements + a "message the barn" line — covers ~70% of the need.
- **Plan:** comments-first (optional) now; full multi-channel chat as phase two, framed to Belle as later.

### 14e. Calendar
- Real **Month / List toggle** (Barn Ops parity), aggregating lessons + events + care-due + shows. (Also §6.)

---

## 15. Business / SaaS layer (only if selling to other barns)

- **Multi-tenant conversion** — one app/many barns, walled off by RLS, branding loaded per barn at runtime. *Cheaper to plan for before building much more*, because it touches how every table stores data.
- **Self-serve signup + subscription tiers** — feature flags become plans (Starter / Pro / Premium); Stripe handles the subscription.
- **Instant provisioning** — "pay on the website → your barn is live in seconds." Requires multi-tenant; can't be instant with the clone-per-barn model.
- **Marketing website** — pricing + checkout; also where a prospect first evaluates on desktop.
- **Gating decision:** whether/when to pursue selling determines when the multi-tenant conversion happens. Until then, a **clone-per-barn** works for a first pilot barn or two.
