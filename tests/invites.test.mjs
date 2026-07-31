#!/usr/bin/env node
/**
 * Invite logic — the parts that are pure functions and can be pinned exactly.
 *
 * Companion to the invites section of the RLS suite. That one proves what the
 * DATABASE refuses; this one proves what the CODE decides: when an invite is
 * expired, which flags survive which role, and — the one that matters most —
 * that a bad token gets a single message that reveals nothing.
 *
 * No database, no network. Imports lib/invites.ts directly, which is why that
 * module carries only a type-only import: a value import through the `@/` alias
 * is unresolvable outside the bundler.
 *
 * Run:  npm run test:invites
 */
import {
  INVITE_INVALID_MESSAGE,
  INVITE_LIFETIME_DAYS,
  effectiveFlags,
  inviteExpiryFrom,
  invitePath,
  inviteShareText,
  inviteStatus,
} from "../lib/invites.ts";

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const NOW = new Date("2026-07-31T12:00:00Z");
const future = new Date("2026-08-30T12:00:00Z").toISOString();
const past = new Date("2026-07-01T12:00:00Z").toISOString();

const invite = (over = {}) => ({
  accepted_at: null,
  revoked_at: null,
  expires_at: future,
  ...over,
});

console.log("\nstatus is derived, never stored\n");

check("a fresh invite is pending", inviteStatus(invite(), NOW) === "pending");
check("past its expiry it is expired", inviteStatus(invite({ expires_at: past }), NOW) === "expired");
check("revoked beats pending", inviteStatus(invite({ revoked_at: past }), NOW) === "revoked");
check(
  "accepted beats revoked — using it is what happened, whatever came after",
  inviteStatus(invite({ accepted_at: past, revoked_at: past }), NOW) === "accepted",
);
check(
  "an accepted invite stays accepted long past its expiry",
  inviteStatus(invite({ accepted_at: past, expires_at: past }), NOW) === "accepted",
);
check(
  "revoked beats expired",
  inviteStatus(invite({ revoked_at: past, expires_at: past }), NOW) === "revoked",
);
check(
  "expiry is inclusive — exactly at the boundary it is already expired",
  inviteStatus(invite({ expires_at: NOW.toISOString() }), NOW) === "expired",
);
check(
  "one second before the boundary it is still pending",
  inviteStatus(invite({ expires_at: new Date(NOW.getTime() + 1000).toISOString() }), NOW) ===
    "pending",
);

console.log("\nlifetime\n");

{
  const expires = new Date(inviteExpiryFrom(NOW));
  const days = Math.round((expires.getTime() - NOW.getTime()) / 86_400_000);
  check(`inviteExpiryFrom() is ${INVITE_LIFETIME_DAYS} days out`, days === INVITE_LIFETIME_DAYS, `got ${days}`);
  check("a freshly minted invite is pending under its own expiry", inviteStatus(invite({ expires_at: expires.toISOString() }), NOW) === "pending");
}

console.log("\nflags survive only the role they mean something for\n");

const all = { manage_shows: true, manage_schedule: true, manage_horses: true };

check(
  "staff keeps every flag that was ticked",
  JSON.stringify(effectiveFlags("staff", all)) === JSON.stringify(all),
);
check(
  "admin stores NO flags — it holds them implicitly, so storing them is a value to remember to ignore",
  Object.values(effectiveFlags("admin", all)).every((v) => v === false),
);
check(
  "parent stores NO flags — has_permission() reads the column for any non-admin role, so a parent carrying one would really hold it",
  Object.values(effectiveFlags("parent", all)).every((v) => v === false),
);
check(
  "staff with nothing ticked keeps nothing",
  Object.values(
    effectiveFlags("staff", { manage_shows: false, manage_schedule: false, manage_horses: false }),
  ).every((v) => v === false),
);

console.log("\none message for every bad token\n");

// The whole point: expired, revoked, used and never-existed are answered
// identically. A message that named the reason would confirm a guessed token
// was real, and "already used" would confirm an account exists to go after.
for (const word of ["expire", "revok", "used", "already", "exist", "accept"]) {
  check(
    `the invalid-token message does not say "${word}"`,
    !INVITE_INVALID_MESSAGE.toLowerCase().includes(word),
    INVITE_INVALID_MESSAGE,
  );
}
check(
  "it does tell the person what to do about it",
  /ask the barn/i.test(INVITE_INVALID_MESSAGE),
  INVITE_INVALID_MESSAGE,
);

console.log("\nthe link and the message an admin copies\n");

check("invitePath is relative, so it works on any host", invitePath("abc") === "/invite/abc");

{
  const text = inviteShareText({
    fullName: "Dana Whitfield",
    barnName: "Crouse Equestrian",
    url: "https://example.test/invite/tok",
    expiresAt: future,
  });
  check("the share message carries the link", text.includes("https://example.test/invite/tok"));
  check("it greets them by name", text.includes("Dana Whitfield"));
  check("it names the barn", text.includes("Crouse Equestrian"));
  check("it says when the link stops working", /works until/i.test(text));
  check(
    "it does NOT contain a password — there isn't one to leak",
    !/password:/i.test(text),
  );
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error("\nFailures:");
  for (const f of failures) console.error(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
console.log("Invite status, lifetime, flag normalisation and the invalid-token message are sound.");
