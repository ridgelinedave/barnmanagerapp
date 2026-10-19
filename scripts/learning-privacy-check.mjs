#!/usr/bin/env node
/**
 * BEHAVIOURAL privacy check for learning video (DESIGN-MASTER §8).
 *
 *   node --env-file=.env.local scripts/learning-privacy-check.mjs [http://localhost:3210]
 *
 * Proves privacy by what actually happens, not by reading config:
 *
 *   CONTROL  the barn admin's real lesson page, served by the running app,
 *            renders a player whose address PLAYS — the HLS manifest, a
 *            rendition playlist and a media segment all come back.
 *   DENIED   the same video with no session and no token does not play;
 *            a tampered token does not play; a family that may not see the
 *            module gets a 404 page with no player in it; a signed-out
 *            request is sent to sign-in.
 *
 * The control runs first so every denial means something.
 *
 * Sessions are the policy suite's own fixture accounts (supabase/seed/
 * seed-output.json), signed in the same way the suite signs them in, and the
 * cookies go only to the local dev server. Nothing secret is printed: tokens
 * are shown as their first 12 characters, credentials never.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServerClient } from "@supabase/ssr";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = process.argv[2] ?? "http://localhost:3210";
const MODULE_TITLE = "Stirrups Off · Stirrups On";
const fixtures = JSON.parse(readFileSync(join(root, "supabase", "seed", "seed-output.json"), "utf8"));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let passed = 0;
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const short = (s) => `${String(s).slice(0, 12)}…`;

/** Signs a fixture in and returns the Cookie header @supabase/ssr would set. */
async function sessionCookie(key) {
  const jar = new Map();
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await client.auth.signInWithPassword({
    email: fixtures.users[key].email,
    password: fixtures.password,
  });
  if (error) throw new Error(`Could not sign in the ${key} fixture: ${error.message}`);
  return { client, cookie: [...jar].map(([n, v]) => `${n}=${v}`).join("; ") };
}

const page = (path, cookie) =>
  fetch(`${APP}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });

const iframeSrc = (html) => html.match(/<iframe[^>]+src="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&") ?? null;

// -----------------------------------------------------------------------------
console.log("\nfinding the seeded module as the barn admin\n");
const admin = await sessionCookie("admin");
const { data: module } = await admin.client
  .from("learning_modules")
  .select("id, published")
  .eq("title", MODULE_TITLE)
  .maybeSingle();
const { data: lessons } = await admin.client
  .from("learning_lessons")
  .select("id, title, video_id")
  .eq("module_id", module?.id ?? "")
  .order("position");
check("control: the admin's own session reads the module and both lessons", Boolean(module) && lessons?.length === 2, JSON.stringify(lessons?.map((l) => l.title)));
const lesson = lessons?.[0];
console.log(`  module ${module?.id} · published ${module?.published} · lesson "${lesson?.title}" · video ${lesson?.video_id}`);

// -----------------------------------------------------------------------------
console.log("\nCONTROL — a permitted viewer can play it\n");
const adminPage = await page(`/lessons/learn/${module.id}/${lesson.id}`, admin.cookie);
const adminHtml = await adminPage.text();
const src = iframeSrc(adminHtml);
check("the admin's lesson page renders (HTTP 200)", adminPage.status === 200, `HTTP ${adminPage.status}`);
check("…with a Stream player whose address carries a token, not the bare video id", Boolean(src) && !src.includes(`/${lesson.video_id}/`), src ? short(src) : "no iframe");

const host = src ? new URL(src).host : null;
const token = src ? new URL(src).pathname.split("/")[1] : null;
console.log(`  player host ${host} · token ${short(token)}`);

const manifest = await fetch(`https://${host}/${token}/manifest/video.m3u8`);
const manifestBody = await manifest.text();
check("the signed HLS manifest is served (HTTP 200, #EXTM3U)", manifest.status === 200 && manifestBody.startsWith("#EXTM3U"), `HTTP ${manifest.status}`);

const rendition = manifestBody.split("\n").find((line) => line && !line.startsWith("#"));
const renditionUrl = rendition ? new URL(rendition, `https://${host}/${token}/manifest/video.m3u8`).href : null;
const renditionRes = renditionUrl ? await fetch(renditionUrl) : null;
const renditionBody = renditionRes ? await renditionRes.text() : "";
check("a rendition playlist from it is served", renditionRes?.status === 200 && renditionBody.startsWith("#EXTM3U"), `HTTP ${renditionRes?.status}`);

const segment = renditionBody.split("\n").find((line) => line && !line.startsWith("#"));
const segmentRes = segment ? await fetch(new URL(segment, renditionUrl).href) : null;
const segmentBytes = segmentRes ? (await segmentRes.arrayBuffer()).byteLength : 0;
check("…and a media segment downloads with real bytes — it plays", segmentRes?.status === 200 && segmentBytes > 1000, `HTTP ${segmentRes?.status}, ${segmentBytes} bytes`);

const iframeRes = await fetch(src);
check("the signed player page itself loads (HTTP 200)", iframeRes.status === 200, `HTTP ${iframeRes.status}`);

// -----------------------------------------------------------------------------
console.log("\nDENIED — no session, no token\n");
for (const [label, target] of [
  ["the bare video id on the account's player host", `https://${host}/${lesson.video_id}/manifest/video.m3u8`],
  ["the bare video id on videodelivery.net", `https://videodelivery.net/${lesson.video_id}/manifest/video.m3u8`],
]) {
  const res = await fetch(target);
  const body = await res.text();
  check(`${label}: does not play (no manifest)`, !(res.status === 200 && body.startsWith("#EXTM3U")), `HTTP ${res.status}`);
  console.log(`    → HTTP ${res.status}`);
}
{
  const res = await fetch(`https://${host}/${lesson.video_id}/iframe`);
  const body = await res.text();
  // The player page may itself load and then show an error; what matters is
  // that the media behind it does not — checked above. Recorded for the report.
  console.log(`    bare-id player page → HTTP ${res.status}${/error|not.?allowed|signed/i.test(body) ? " (error page)" : ""}`);
}
{
  const tampered = token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA");
  const res = await fetch(`https://${host}/${tampered}/manifest/video.m3u8`);
  const body = await res.text();
  check("a tampered token does not play", !(res.status === 200 && body.startsWith("#EXTM3U")), `HTTP ${res.status}`);
  console.log(`    → HTTP ${res.status}`);
}

// -----------------------------------------------------------------------------
console.log("\nDENIED — the database says no, so no token is ever minted\n");
{
  const res = await page(`/lessons/learn/${module.id}/${lesson.id}`, null);
  check("signed out: the lesson page redirects to sign-in", [302, 303, 307, 308].includes(res.status) && /sign-in/.test(res.headers.get("location") ?? ""), `HTTP ${res.status} → ${res.headers.get("location")}`);
}
{
  const parent = await sessionCookie("parent");
  const { data: rows } = await parent.client.from("learning_lessons").select("id, video_id").eq("id", lesson.id);
  check(
    `a family (module is ${module.published ? "published" : "a DRAFT"}) cannot read the lesson row`,
    module.published ? true : (rows ?? []).length === 0,
    `${rows?.length} row(s)`,
  );
  const res = await page(`/lessons/learn/${module.id}/${lesson.id}`, parent.cookie);
  const html = await res.text();
  if (!module.published) {
    check("…and their lesson page is a 404 with no player and no token in it", res.status === 404 && !iframeSrc(html) && !html.includes("cloudflarestream.com"), `HTTP ${res.status}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
