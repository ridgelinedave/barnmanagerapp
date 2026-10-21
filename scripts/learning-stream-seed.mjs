#!/usr/bin/env node
/**
 * Uploads the launch learning videos to Cloudflare Stream and seeds ONE module
 * containing them, in order.
 *
 *   node --env-file=.env.local scripts/learning-stream-seed.mjs
 *
 * PRIVATE FROM THE FIRST BYTE. Each video is created by a tus upload whose
 * Upload-Metadata carries `requiresignedurls`, so Stream never holds a public
 * copy, not even for the seconds between an upload and a follow-up call. The
 * script then reads each video back and refuses to seed anything unless Stream
 * reports `requireSignedURLs: true`.
 *
 * WHY TUS, for files of ~172 MB and ~154 MB: Stream's basic multipart upload
 * accepts files under 200 MB, but it cannot set signed URLs at creation and it
 * cannot resume — a dropped connection at 150 MB starts again from zero. tus
 * is resumable (this script re-reads the offset and continues after a failed
 * chunk) and sets privacy on creation. Chunks are 50 MiB, the size Stream
 * recommends, a multiple of 256 KiB.
 *
 * CREDENTIALS: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_STREAM_TOKEN from the
 * environment, via lib/stream-core.ts. They are sent only to Cloudflare and
 * are never printed — this script prints video ids (not secret), sizes and
 * states.
 *
 * WRITES NO DESCRIPTIVE COPY. Lesson titles are the file names; notes are left
 * empty for the barn owner to write; the module is created as a DRAFT so no
 * family sees it until she publishes. Idempotent: a lesson that already has a
 * video in the database is not uploaded again.
 */
import { createReadStream, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { describeVideo, streamCredentialsFrom } from "../lib/stream-core.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const VIDEO_DIR = join(root, "assets", "academy videos");
const FILES = ["Stirrups Off.mp4", "Stirrups On.mp4"]; // the module's order
const MODULE_TITLE = "Adjusting Stirrups";
const CHUNK = 50 * 1024 * 1024;

const creds = streamCredentialsFrom(process.env); // throws, by name, if missing
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  process.exit(1);
}
// Service role: this is a seed script, the same sanctioned path as demo.mjs.
const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

/**
 * Only Cloudflare-owned hosts ever receive the Authorization header. Stream's
 * tus upload address is on a gateway host (observed:
 * edge-production.gateway.api.cloudflare.com) and REQUIRES the token — without
 * it every chunk is a 400 — so the rule is "a cloudflare.com or
 * cloudflarestream.com host over https", never "any host Stream points at".
 */
function authFor(url) {
  const { host, protocol } = new URL(url);
  const cloudflare =
    host === "cloudflare.com" ||
    host.endsWith(".cloudflare.com") ||
    host.endsWith(".cloudflarestream.com");
  return protocol === "https:" && cloudflare ? { Authorization: `Bearer ${creds.apiToken}` } : {};
}

async function readChunk(path, start, end) {
  const parts = [];
  for await (const part of createReadStream(path, { start, end: end - 1 })) parts.push(part);
  return Buffer.concat(parts);
}

async function tusUpload(path) {
  const size = statSync(path).size;
  const name = basename(path, ".mp4");
  const create = await fetch(`https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/stream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.apiToken}`,
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(size),
      // `requiresignedurls` (no value) makes the video private on creation.
      "Upload-Metadata": `name ${b64(name)},requiresignedurls`,
    },
  });
  if (create.status !== 201) throw new Error(`Stream refused to create the upload: HTTP ${create.status}`);
  const location = create.headers.get("location");
  const uid = create.headers.get("stream-media-id");
  if (!location || !uid) throw new Error("Stream did not return an upload address and video id.");
  console.log(`  ${name}: ${(size / 1048576).toFixed(1)} MB → video ${uid}`);

  let offset = 0;
  let failures = 0;
  while (offset < size) {
    const end = Math.min(offset + CHUNK, size);
    try {
      const res = await fetch(location, {
        method: "PATCH",
        headers: {
          ...authFor(location),
          "Tus-Resumable": "1.0.0",
          "Upload-Offset": String(offset),
          "Content-Type": "application/offset+octet-stream",
        },
        body: await readChunk(path, offset, end),
      });
      if (res.status !== 204) throw new Error(`chunk HTTP ${res.status}`);
      offset = Number(res.headers.get("upload-offset") ?? end);
      failures = 0;
      console.log(`    ${Math.round((offset / size) * 100)}%`);
    } catch (error) {
      if (++failures > 3) throw new Error(`Upload of ${name} failed after retries (${error.message}).`);
      // Resume: ask the server how much it really has, and continue from there.
      const head = await fetch(location, { method: "HEAD", headers: { ...authFor(location), "Tus-Resumable": "1.0.0" } });
      offset = Number(head.headers.get("upload-offset") ?? offset);
      console.log(`    retrying from ${Math.round((offset / size) * 100)}% (${error.message})`);
    }
  }
  return uid;
}

async function waitUntilReady(uid) {
  for (let i = 0; i < 90; i++) {
    const video = await describeVideo(creds, uid);
    if (!video.requireSignedURLs) throw new Error(`Video ${uid} is NOT set to require signed URLs. Refusing to seed it.`);
    if (video.readyToStream) return video;
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error(`Video ${uid} was not ready after 15 minutes.`);
}

// --- the videos FIRST ----------------------------------------------------------
// Nothing is written to the database until every video is uploaded, private
// and ready — so a refused or interrupted upload leaves no empty module behind.
let { data: module } = await db.from("learning_modules").select("*").eq("title", MODULE_TITLE).maybeSingle();
const uploaded = new Map();
for (const file of FILES) {
  const title = basename(file, ".mp4");
  if (module) {
    const { data: existing } = await db
      .from("learning_lessons")
      .select("video_id")
      .eq("module_id", module.id)
      .eq("title", title)
      .maybeSingle();
    if (existing?.video_id) {
      console.log(`  ${title}: already uploaded (${existing.video_id}) — skipped`);
      continue;
    }
  }
  const uid = await tusUpload(join(VIDEO_DIR, file));
  const video = await waitUntilReady(uid);
  console.log(`    ready · signed URLs required: ${video.requireSignedURLs} · ${video.durationSeconds ?? "?"} s`);
  uploaded.set(title, { uid, video });
}

// --- the module --------------------------------------------------------------
if (!module) {
  const { data: last } = await db.from("learning_modules").select("position").order("position", { ascending: false }).limit(1);
  const position = (last?.[0]?.position ?? -1) + 1;
  const { data, error } = await db
    .from("learning_modules")
    .insert({ title: MODULE_TITLE, position, audience: "all", published: false })
    .select("*")
    .single();
  if (error) throw new Error(`Could not create the module: ${error.message}`);
  module = data;
  console.log(`module created (draft): ${module.id}`);
} else {
  console.log(`module exists: ${module.id} (published: ${module.published})`);
}

// --- the section (0028) ----------------------------------------------------------
// Every lesson belongs to a section of its course. The seed's lessons go in
// the course's FIRST section, created (titled with the course's own title,
// as 0028's backfill does) when the course has none yet.
let { data: section } = await db
  .from("learning_sections")
  .select("*")
  .eq("module_id", module.id)
  .order("position")
  .limit(1)
  .maybeSingle();
if (!section) {
  const { data, error } = await db
    .from("learning_sections")
    .insert({ module_id: module.id, title: module.title, position: 0 })
    .select("*")
    .single();
  if (error) throw new Error(`Could not create the section: ${error.message}`);
  section = data;
  console.log(`section created: ${section.id}`);
}

// --- the lessons, in order -----------------------------------------------------
for (const [position, file] of FILES.entries()) {
  const title = basename(file, ".mp4");
  const { data: existing } = await db
    .from("learning_lessons")
    .select("id, video_id")
    .eq("module_id", module.id)
    .eq("title", title)
    .maybeSingle();
  if (existing?.video_id) continue;
  const done = uploaded.get(title);
  if (!done) throw new Error(`No upload recorded for "${title}".`);
  const { uid, video } = done;

  const row = {
    module_id: module.id,
    section_id: section.id,
    title,
    notes: "", // the barn owner writes these herself
    position,
    video_provider: "cloudflare_stream",
    video_id: uid,
    duration_seconds: video.durationSeconds,
  };
  const { error } = existing
    ? await db.from("learning_lessons").update(row).eq("id", existing.id)
    : await db.from("learning_lessons").insert(row);
  if (error) throw new Error(`Could not save the lesson "${title}": ${error.message}`);
}

const { data: lessons } = await db
  .from("learning_lessons")
  .select("title, position, video_id, duration_seconds")
  .eq("module_id", module.id)
  .order("position");
console.log("\nseeded:");
for (const l of lessons ?? []) console.log(`  ${l.position + 1}. ${l.title} — ${l.video_id} — ${l.duration_seconds ?? "?"} s`);
