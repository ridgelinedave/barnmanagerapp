#!/usr/bin/env node
/**
 * Cloudflare Stream core — the credentials never escape.
 *
 * The account id and API token may go to exactly one place: a request to
 * api.cloudflare.com. This proves, with FAKE credentials and a fake fetch,
 * that they do not appear in any error the code can throw — a missing
 * variable, a refused lookup, a refused token request, a malformed response —
 * because an error message is the thing most likely to end up in a log, an
 * error page or a bug report.
 *
 * Also: a missing variable fails LOUDLY by name, a bad video id is refused
 * before any request is made, and a token replaces the uid in the playback
 * path.
 *
 * No network, no real credentials. Imports lib/stream-core.ts directly, which
 * is why that module imports nothing.
 *
 * Run:  npm run test:stream
 */
import {
  STREAM_UID,
  createDirectUpload,
  deleteVideo,
  describeVideo,
  mintPlaybackToken,
  playbackUrls,
  streamCredentialsFrom,
} from "../lib/stream-core.ts";
import {
  CHUNK_BYTES,
  FALLBACK_MAX_DURATION_SECONDS,
  byFilename,
  expiryFor,
  maxDurationFor,
  titleFromFilename,
} from "../lib/academy-upload.ts";

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

const FAKE = { accountId: "acct0123456789fakeaccountid0000", apiToken: "tok_FAKE_super_secret_value_9876" };
const UID = "0123456789abcdef0123456789abcdef";

const leaks = (message) => message.includes(FAKE.accountId) || message.includes(FAKE.apiToken);

async function caught(fn) {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
}

const respond = (status, body) => async () =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

console.log("\nconfiguration fails loudly, by name\n");
{
  const err = await caught(() => streamCredentialsFrom({}));
  check("both missing: refused", Boolean(err));
  check(
    "…and the message names both variables",
    err?.message.includes("CLOUDFLARE_ACCOUNT_ID") && err?.message.includes("CLOUDFLARE_STREAM_TOKEN"),
    err?.message,
  );
  const one = await caught(() => streamCredentialsFrom({ CLOUDFLARE_ACCOUNT_ID: FAKE.accountId }));
  check("token missing: refused, naming only the token", one?.message.includes("CLOUDFLARE_STREAM_TOKEN") && !one?.message.includes("CLOUDFLARE_ACCOUNT_ID is"), one?.message);
  check("…and the account id that IS set is not echoed", !leaks(one?.message ?? ""), one?.message);
  const blank = await caught(() => streamCredentialsFrom({ CLOUDFLARE_ACCOUNT_ID: " ", CLOUDFLARE_STREAM_TOKEN: "" }));
  check("whitespace-only values count as missing", Boolean(blank));
  const ok = streamCredentialsFrom({ CLOUDFLARE_ACCOUNT_ID: FAKE.accountId, CLOUDFLARE_STREAM_TOKEN: FAKE.apiToken });
  check("control: both set: credentials returned", ok.accountId === FAKE.accountId && ok.apiToken === FAKE.apiToken);
}

console.log("\nno error carries a credential\n");
{
  const cases = [
    ["lookup refused (403, body echoing the URL)", () =>
      describeVideo(FAKE, UID, respond(403, { errors: [{ code: 10000, message: `Authentication error for /accounts/${FAKE.accountId}` }] }))],
    ["lookup not found (404)", () => describeVideo(FAKE, UID, respond(404, "not json"))],
    ["lookup returns no playback", () => describeVideo(FAKE, UID, respond(200, { result: {} }))],
    ["token refused (401, body echoing the token)", () =>
      mintPlaybackToken(FAKE, UID, 3600, respond(401, { errors: [{ code: 10001, message: `bad token ${FAKE.apiToken}` }] }))],
    ["token response empty", () => mintPlaybackToken(FAKE, UID, 3600, respond(200, { result: {} }))],
    ["network failure", () => mintPlaybackToken(FAKE, UID, 3600, async () => { throw new TypeError("fetch failed"); })],
  ];
  for (const [label, fn] of cases) {
    const err = await caught(fn);
    check(`${label}: throws`, Boolean(err));
    check(`${label}: message holds neither the account id nor the token`, !leaks(String(err?.message ?? "")), err?.message);
    check(`${label}: nor does the stack`, !leaks(String(err?.stack ?? "")));
  }
  const coded = await caught(() =>
    describeVideo(FAKE, UID, respond(403, { errors: [{ code: 10000, message: "secret-ish text" }] })),
  );
  check("Cloudflare's error CODE is reported, its message text is not", coded?.message.includes("10000") && !coded?.message.includes("secret-ish"), coded?.message);
}

console.log("\nthe credentials go only where they belong\n");
{
  const seen = [];
  const spy = async (url, init) => {
    seen.push({ url, auth: init?.headers?.Authorization });
    return new Response(JSON.stringify({ result: { token: "signed.token.value" } }), { status: 200 });
  };
  const token = await mintPlaybackToken(FAKE, UID, 3600, spy);
  check("control: a token comes back", token === "signed.token.value");
  check("the request went to api.cloudflare.com, only", seen.length === 1 && new URL(seen[0].url).host === "api.cloudflare.com");
  check("the token rode in the Authorization header", seen[0]?.auth === `Bearer ${FAKE.apiToken}`);
  check("the token is not in the URL", !seen[0]?.url.includes(FAKE.apiToken));
}

console.log("\nids and URLs\n");
{
  check("a 32-hex uid is accepted by the shape", STREAM_UID.test(UID));
  for (const bad of ["", "ABCDEF0123456789abcdef0123456789", `${UID}/iframe`, "../../etc"]) {
    let called = false;
    const err = await caught(() => mintPlaybackToken(FAKE, bad, 3600, async () => { called = true; return new Response("{}"); }));
    check(`"${bad}" is refused before any request`, Boolean(err) && !called);
  }
  const urls = playbackUrls("customer-abc.cloudflarestream.com", "signed.token.value");
  check("the token replaces the uid in the iframe path", urls.iframe === "https://customer-abc.cloudflarestream.com/signed.token.value/iframe");
  check("…and in the HLS manifest path", urls.hls.endsWith("/signed.token.value/manifest/video.m3u8"));
}

console.log("\ndirect creator uploads: the browser gets a link, never the token\n");
{
  const seen = [];
  const ok = (headers) => async (url, init) => {
    seen.push({ url, init });
    return new Response(null, { status: 201, headers });
  };
  const good = { "stream-media-id": UID, location: `https://upload.cloudflarestream.com/tus/${UID}?tusv2=true` };
  const expiry = new Date("2026-10-21T12:00:00Z");
  const link = await createDirectUpload(FAKE, { sizeBytes: 172040339, maxDurationSeconds: 135, expiry, name: "Stirrups Off" }, ok(good));
  check("control: a link and a video id come back", link.videoId === UID && link.uploadUrl === good.location);
  check("the request went to api.cloudflare.com as a direct_user tus creation", seen.length === 1 && new URL(seen[0].url).host === "api.cloudflare.com" && seen[0].url.endsWith("/stream?direct_user=true"));
  const h = seen[0].init.headers;
  check("the token rode in the Authorization header of THAT request only", h.Authorization === `Bearer ${FAKE.apiToken}`);
  check("NOTHING returned to the caller carries a credential", !leaks(JSON.stringify(link)));
  const meta = Object.fromEntries(
    h["Upload-Metadata"].split(",").map((pair) => {
      const [k, v] = pair.split(" ");
      return [k, v ? Buffer.from(v, "base64").toString("utf8") : true];
    }),
  );
  check("private from the first byte: requiresignedurls is set at creation", meta.requiresignedurls === true);
  check("maxdurationseconds is the file's own (135), not a blanket cap", meta.maxdurationseconds === "135");
  check("expiry is sent as RFC 3339 (no milliseconds)", meta.expiry === "2026-10-21T12:00:00Z");
  check("Upload-Length is the exact file size", h["Upload-Length"] === "172040339");

  const noId = await caught(() => createDirectUpload(FAKE, { sizeBytes: 10, maxDurationSeconds: 60, expiry, name: "x" }, ok({ location: good.location })));
  check("no stream-media-id header -> refused (the id is never parsed from the URL)", Boolean(noId));
  const elsewhere = await caught(() =>
    createDirectUpload(FAKE, { sizeBytes: 10, maxDurationSeconds: 60, expiry, name: "x" }, ok({ "stream-media-id": UID, location: "https://evil.example.com/tus/x" })),
  );
  check("an upload address off Cloudflare's hosts is refused", Boolean(elsewhere));
  const plain = await caught(() =>
    createDirectUpload(FAKE, { sizeBytes: 10, maxDurationSeconds: 60, expiry, name: "x" }, ok({ "stream-media-id": UID, location: "http://upload.cloudflarestream.com/tus/x" })),
  );
  check("…and so is plain http", Boolean(plain));
  let called = false;
  const badMax = await caught(() =>
    createDirectUpload(FAKE, { sizeBytes: 10, maxDurationSeconds: 36001, expiry, name: "x" }, async () => {
      called = true;
      return new Response(null, { status: 201 });
    }),
  );
  check("a max duration past Cloudflare's 36000 s is refused before any request", Boolean(badMax) && !called);
  const refused = await caught(() =>
    createDirectUpload(FAKE, { sizeBytes: 10, maxDurationSeconds: 60, expiry, name: "x" }, respond(400, { errors: [{ code: 10005, message: `bad ${FAKE.apiToken}` }] })),
  );
  check("a refused link names Cloudflare's code, carries no credential", refused?.message.includes("10005") && !leaks(refused.message), refused?.message);
  const delErr = await caught(() => deleteVideo(FAKE, UID, respond(500, { errors: [{ code: 10000, message: FAKE.accountId }] })));
  check("a failed delete carries no credential", Boolean(delErr) && !leaks(delErr.message), delErr?.message);
  check("deleting an already-gone video is not an error", (await caught(() => deleteVideo(FAKE, UID, respond(404, {})))) === null);
}

console.log("\nthe upload policy\n");
{
  check("chunks are 10 MiB", CHUNK_BYTES === 10 * 1024 * 1024);
  check("…a multiple of 256 KiB", CHUNK_BYTES % (256 * 1024) === 0);
  check("…above Cloudflare's 5 MiB minimum and under its 200 MiB maximum", CHUNK_BYTES >= 5_242_880 && CHUNK_BYTES <= 209_715_200);
  const m = maxDurationFor(68.4);
  check("max duration = real length rounded up, +10%, +60 s (69 s -> 136 s)", m.seconds === Math.ceil(69 * 1.1) + 60 && m.fromFile);
  const f = maxDurationFor(null);
  check("an unreadable length falls back to the fixed cap, and says it did", f.seconds === FALLBACK_MAX_DURATION_SECONDS && !f.fromFile);
  check("max duration never exceeds Cloudflare's 36000 s", maxDurationFor(50_000).seconds === 36_000);
  const now = new Date("2026-10-21T00:00:00Z");
  const hours = (d) => (d.getTime() - now.getTime()) / 3_600_000;
  check("a small file still gets 2 h (the floor)", hours(expiryFor(20 * 1024 * 1024, now)) === 2);
  check("a 2 GB file gets its slow-upload budget (~18 h)", Math.abs(hours(expiryFor(2 * 1024 ** 3, now)) - (2 * 1024 ** 3) / (32 * 1024) / 3600) < 0.01);
  check("expiry never exceeds Cloudflare's 24 h", hours(expiryFor(10 * 1024 ** 3, now)) === 24);
  check("lessons are titled from the filename", titleFromFilename("Stirrups_On.mp4") === "Stirrups On");
  const order = [{ name: "Lesson 10.mp4" }, { name: "Lesson 2.mp4" }, { name: "lesson 1.mp4" }].sort(byFilename).map((x) => x.name);
  check("filename order is natural (1, 2, 10)", JSON.stringify(order) === JSON.stringify(["lesson 1.mp4", "Lesson 2.mp4", "Lesson 10.mp4"]), order.join(", "));
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
console.log("The Stream credentials stay on the server and out of every error.");
