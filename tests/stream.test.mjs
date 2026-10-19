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
  describeVideo,
  mintPlaybackToken,
  playbackUrls,
  streamCredentialsFrom,
} from "../lib/stream-core.ts";

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

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
console.log("The Stream credentials stay on the server and out of every error.");
