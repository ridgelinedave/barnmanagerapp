"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentRole } from "@/lib/guard";
import { streamDeleteVideo, streamUploadLink } from "@/lib/stream";
import { STREAM_UID } from "@/lib/stream-core";
import { expiryFor, maxDurationFor } from "@/lib/academy-upload";
import { fillLessonDurations } from "@/lib/academy";

/**
 * Academy uploads — the server's whole part in them.
 *
 * UPLOADS GO BROWSER -> CLOUDFLARE, NEVER THROUGH THIS SERVER. A 170 MB lesson
 * posted to a Vercel function would hit its request-body cap; instead the
 * browser asks here for a ONE-TIME tus link and sends the file straight to
 * Cloudflare. What crosses this boundary is a file NAME, SIZE and the duration
 * the browser read locally — never the bytes — and what goes back is the link
 * and the video id. The account token never leaves the server: it is used in
 * lib/stream-core.ts to ask Cloudflare for the link and is not in any return
 * value here.
 *
 * Admin only, checked here because minting spends storage reservation on the
 * barn's Cloudflare account; and the section must be one the admin's own
 * session can read. Writes to learning_lessons are admin-only by RLS anyway.
 */
export type UploadLink =
  | { ok: true; uploadUrl: string; videoId: string; maxDurationSeconds: number; durationFromFile: boolean; expiresAt: string }
  | { ok: false; error: string };

const UUID = /^[0-9a-f-]{36}$/i;

export async function requestUploadLink(input: {
  sectionId: string;
  title: string;
  sizeBytes: number;
  durationSeconds: number | null;
}): Promise<UploadLink> {
  if ((await currentRole()) !== "admin") return { ok: false, error: "Only the barn admin can upload lessons." };
  if (!UUID.test(input.sectionId)) return { ok: false, error: "That section could not be found." };
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) return { ok: false, error: "That file is empty." };

  const supabase = await createClient();
  const { data: section } = await supabase.from("learning_sections").select("id").eq("id", input.sectionId).maybeSingle();
  if (!section) return { ok: false, error: "That section could not be found." };

  const max = maxDurationFor(input.durationSeconds);
  const expiry = expiryFor(input.sizeBytes);
  try {
    const link = await streamUploadLink({
      sizeBytes: input.sizeBytes,
      maxDurationSeconds: max.seconds,
      expiry,
      name: input.title.slice(0, 200),
    });
    return {
      ok: true,
      uploadUrl: link.uploadUrl,
      videoId: link.videoId,
      maxDurationSeconds: max.seconds,
      durationFromFile: max.fromFile,
      expiresAt: expiry.toISOString(),
    };
  } catch (error) {
    // StreamError messages carry only HTTP status and Cloudflare error CODES
    // (test:stream proves no credential is ever in one).
    return { ok: false, error: error instanceof Error ? error.message : "The upload link could not be created." };
  }
}

/**
 * Once the last byte is in: the lesson, at the END of its section, titled
 * from the filename (editable afterwards). duration_seconds stays null —
 * "Processing" — until Stream has encoded it (syncLessonDurations).
 */
export async function createLessonFromUpload(input: {
  sectionId: string;
  title: string;
  videoId: string;
}): Promise<{ ok: true; lessonId: string } | { ok: false; error: string }> {
  if ((await currentRole()) !== "admin") return { ok: false, error: "Only the barn admin can add lessons." };
  if (!UUID.test(input.sectionId) || !STREAM_UID.test(input.videoId)) return { ok: false, error: "That upload could not be matched." };

  const supabase = await createClient();
  const { data: section } = await supabase
    .from("learning_sections")
    .select("id, module_id")
    .eq("id", input.sectionId)
    .maybeSingle();
  if (!section) return { ok: false, error: "That section could not be found." };

  // Idempotent on the video: a retried "finish" never makes a second lesson.
  const { data: existing } = await supabase.from("learning_lessons").select("id").eq("video_id", input.videoId).maybeSingle();
  if (existing) return { ok: true, lessonId: existing.id };

  const { data: last } = await supabase
    .from("learning_lessons")
    .select("position")
    .eq("section_id", section.id)
    .order("position", { ascending: false })
    .limit(1);
  const position = (last?.[0]?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("learning_lessons")
    .insert({
      module_id: section.module_id,
      section_id: section.id,
      title: input.title.trim() || "Untitled lesson",
      position,
      video_provider: "cloudflare_stream",
      video_id: input.videoId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "The lesson was not saved." };

  revalidatePath("/lessons/learn");
  return { ok: true, lessonId: data.id };
}

/**
 * Durations come from Stream once processing finishes (3.4). For the given
 * lessons that have a video and no duration yet, ask Stream; store the
 * duration when it is ready. Returns how many are still processing.
 */
export async function syncLessonDurations(lessonIds: string[]): Promise<{ pending: number }> {
  if ((await currentRole()) !== "admin") return { pending: 0 };
  const ids = lessonIds.filter((id) => UUID.test(id)).slice(0, 50);
  if (ids.length === 0) return { pending: 0 };

  const { pending, changed } = await fillLessonDurations(ids);
  if (changed) revalidatePath("/lessons/learn");
  return { pending };
}

/**
 * A cancelled or abandoned upload: delete its Stream video so the storage
 * reserved against it is released now rather than when the link expires.
 * Only a video NO lesson points at — a lesson's video is never deleted here.
 */
export async function discardUpload(videoId: string): Promise<void> {
  if ((await currentRole()) !== "admin" || !STREAM_UID.test(videoId)) return;
  const supabase = await createClient();
  const { data: used } = await supabase.from("learning_lessons").select("id").eq("video_id", videoId).maybeSingle();
  if (used) return;
  try {
    await streamDeleteVideo(videoId);
  } catch {
    // Best effort: an undeleted reservation still lapses at the link's expiry.
  }
}
