#!/usr/bin/env node
/**
 * Navigation and the gate — the sidebar can only offer what the gate allows.
 *
 * The desktop sidebar has no five-destination limit, which is exactly what
 * makes it dangerous: a long list is easy to get wrong in two directions.
 *   A DEAD LINK — a destination shown to a role the gate refuses. The row is
 *     there, it is tapped, and the screen bounces to Home.
 *   AN UNREACHABLE SCREEN — a destination the gate allows but nothing links
 *     to. This happened for real once: removing the Manage tab would have cut
 *     admin off from all of /manage/*, because the gate was inferred from the
 *     tab list (see ROLE_PATHS in lib/nav.ts).
 *
 * This proves, for every role, under every feature-flag state that matters:
 *   1. every link the sidebar renders is accepted by roleCanAccess;
 *   2. no destination is rendered for a role the gate denies;
 *   3. no registry entry names a role the gate would refuse (so the filter is
 *      a guard, not the thing quietly hiding a mistake);
 *   4. every href points at a page that exists;
 *   5. every /manage screen is reachable from the admin sidebar;
 *   6. exactly one link is current on any page, and it is the right one.
 *
 * No database, no network. Imports lib/nav.ts directly, which is why that
 * module has type-only imports.
 *
 * Run:  npm run test:nav
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BARN_GROUPS,
  LESSONS_GROUP,
  SETTINGS_ADMIN_GROUP,
  SETTINGS_YOURS_GROUP,
  TABS_BY_ROLE,
  currentHref,
  pathOf,
  roleCanAccess,
  sidebarFor,
} from "../lib/nav.ts";

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

const ROLES = ["parent", "staff", "admin"];
const APP = new URL("../app/(app)/", import.meta.url);

/** Every flag on (the widest sidebar) and every flag off (the narrowest). */
const FLAG_STATES = [
  ["all flags on", () => true],
  ["all flags off", () => false],
];

const REGISTRY = [...BARN_GROUPS, LESSONS_GROUP, SETTINGS_ADMIN_GROUP, SETTINGS_YOURS_GROUP].flatMap(
  (group) => group.entries,
);

const sidebarHrefs = (model) => [
  ...model.sections.flatMap((section) => section.links.map((link) => link.href)),
  ...model.footer.map((link) => link.href),
];

/** True when app/(app)/<path>/page.tsx exists. Dynamic segments are not linked. */
function pageExists(path) {
  const dir = join(APP.pathname.replace(/^\/([A-Za-z]:)/, "$1"), ...path.split("/").filter(Boolean));
  return existsSync(join(dir, "page.tsx"));
}

for (const [label, isEnabled] of FLAG_STATES) {
  console.log(`\nwhat the sidebar renders is what the gate allows — ${label}\n`);

  for (const role of ROLES) {
    const hrefs = sidebarHrefs(sidebarFor(role, isEnabled));

    // Positive control: the sidebar is not vacuously empty, or every
    // "accepted by the gate" below would pass for nothing.
    check(`${role}: the sidebar renders links at all`, hrefs.length > 0, `got ${hrefs.length}`);

    const refused = hrefs.filter((href) => !roleCanAccess(role, pathOf(href)));
    check(
      `${role}: every rendered link is accepted by roleCanAccess (${hrefs.length} links)`,
      refused.length === 0,
      refused.join(", "),
    );

    check(
      `${role}: no link is rendered twice`,
      new Set(hrefs).size === hrefs.length,
      hrefs.filter((h, i) => hrefs.indexOf(h) !== i).join(", "),
    );

    // The deny half, checked against the REGISTRY rather than the output: a
    // destination the gate refuses this role must be absent from the output.
    const denied = REGISTRY.filter((entry) => !roleCanAccess(role, pathOf(entry.href)));
    const leaked = denied.filter((entry) => hrefs.includes(entry.href));
    check(
      `${role}: none of the ${denied.length} destinations the gate denies is rendered`,
      leaked.length === 0,
      leaked.map((entry) => entry.href).join(", "),
    );
  }
}

console.log("\nthe registry never names a role the gate would refuse\n");
for (const entry of REGISTRY) {
  const wrong = entry.roles.filter((role) => !roleCanAccess(role, pathOf(entry.href)));
  check(
    `${entry.href} (${entry.title}) — shown to ${entry.roles.join(", ")}`,
    wrong.length === 0,
    `gate refuses ${wrong.join(", ")}`,
  );
}
for (const role of ROLES) {
  for (const tab of TABS_BY_ROLE[role]) {
    check(`${role}: tab ${tab.href} is accepted by the gate`, roleCanAccess(role, tab.href));
  }
}

console.log("\nevery link points at a page that exists\n");
{
  const everyHref = new Set([
    ...REGISTRY.map((entry) => pathOf(entry.href)),
    ...ROLES.flatMap((role) => sidebarHrefs(sidebarFor(role, () => true)).map(pathOf)),
  ]);
  for (const path of [...everyHref].sort()) {
    check(`${path} has a page.tsx`, pageExists(path));
  }
}

console.log("\nevery management screen is one click from the admin sidebar\n");
{
  const admin = new Set(sidebarHrefs(sidebarFor("admin", () => true)));
  const manageDir = join(APP.pathname.replace(/^\/([A-Za-z]:)/, "$1"), "manage");
  // A page that only redirects is an old address, not a screen — it has no
  // sidebar row of its own (e.g. /manage/lesson-templates → /lessons).
  const isRedirectOnly = (file) => {
    const source = readFileSync(file, "utf8");
    return /\bredirect\(/.test(source) && !/<TabPage\b/.test(source);
  };
  const screens = readdirSync(manageDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(manageDir, d.name, "page.tsx")))
    .filter((d) => !isRedirectOnly(join(manageDir, d.name, "page.tsx")))
    .map((d) => `/manage/${d.name}`);

  check("control: there are /manage screens to look for", screens.length > 0, `found ${screens.length}`);
  for (const screen of screens) {
    check(`${screen} is in the admin sidebar`, admin.has(screen));
  }

  // And the other direction: nobody else is offered a management screen.
  for (const role of ["parent", "staff"]) {
    const manage = sidebarHrefs(sidebarFor(role, () => true)).filter((h) => h.startsWith("/manage"));
    check(`${role} is offered no /manage screen`, manage.length === 0, manage.join(", "));
  }
}

console.log("\nexactly one link is current, and it is the right one\n");
for (const role of ROLES) {
  const hrefs = sidebarHrefs(sidebarFor(role, () => true));
  const wrong = hrefs.filter((href) => currentHref(hrefs, pathOf(href)) !== href);
  check(`${role}: on each of its ${hrefs.length} pages, that page's own link is current`, wrong.length === 0, wrong.join(", "));
}
{
  const admin = sidebarHrefs(sidebarFor("admin", () => true));
  for (const [path, want] of [
    ["/manage/horses/abc-123", "/manage/horses"],
    ["/barn/water", "/barn/water"],
    ["/barn", "/barn"],
    ["/more", "/more"],
    ["/more/horses/abc-123", "/more/horses"],
    ["/manage/announcements/new", "/manage/announcements"],
    ["/notifications", null],
  ]) {
    check(`admin on ${path} → ${want ?? "nothing"} is current`, currentHref(admin, path) === want, `got ${currentHref(admin, path)}`);
  }
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error("\nFailures:");
  for (const f of failures) console.error(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
console.log("The sidebar and the gate agree for every role.");
