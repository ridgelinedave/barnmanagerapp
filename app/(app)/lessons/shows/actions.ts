"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { SHOWS_BUCKET, showBannerPath } from "@/lib/shows";
import { barnLocalToUtc } from "@/lib/dates";

/**
 * Show management — the barn's side of the competition hub.
 *
 * RLS IS THE BOUNDARY, NOT THIS FILE. Every write below runs on the caller's
 * own session, so migration 0021's `has_permission('manage_shows')` policies
 * apply exactly as they would to a direct PostgREST call. The permission check
 * at the top of each action exists to return a sentence a human can read
 * instead of a policy violation, and to avoid rendering an optimistic success.
 * Deleting these checks would change the error text and nothing else.
 *
 * The service-role client is deliberately never used here.
 *
 * ONE FRIENDLY MESSAGE PER UNIQUE INDEX. The schema carries three:
 *   show_entries_one_per_mount          (show, rider, horse) where horse not null
 *   show_entries_one_per_rider_no_horse (show, rider)        where horse is null
 *   show_results_one_per_class          (show, rider, class)
 * Postgres reports all three as SQLSTATE 23505 with the index name in the
 * message. A raw "duplicate key value violates unique constraint" is a true
 * statement that tells Belle nothing about what to do next, so each is
 * translated where it is raised.
 */
export type ShowState = { error: string | null; message: string | null };

const OK = (message: string): ShowState => ({ error: null, message });
const NO = (error: string): ShowState => ({ error, message: null });

const DENIED = "You do not have permission to manage shows.";

/**
 * Mirrors `has_permission('manage_shows')` — admin implicitly, staff by the
 * grantable flag. Returns null when the viewer may not write, which every
 * caller turns into DENIED rather than proceeding.
 */
async function requireShowManager() {
  const state = await getViewer();
  if (state.status !== "viewer") return null;

  const { role, profile } = state.viewer;
  if (role !== "admin" && !profile?.manage_shows) return null;
  return state.viewer;
}

function revalidate(showId?: string) {
  revalidatePath("/lessons/shows");
  if (showId) revalidatePath(`/lessons/shows/${showId}`);
}

/** True for a Postgres unique-violation, whatever the driver wrapped it in. */
function isDuplicate(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "23505" || /duplicate key/i.test(error?.message ?? "");
}

/* -------------------------------------------------------------------------- */
/* 1 — the show itself                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Create or edit. One action for both, because the fields, the validation and
 * the permission are identical — the only difference is whether an id came
 * along, and splitting that into two near-identical functions is how the two
 * drift when a field is added.
 */
export async function saveShow(_prev: ShowState, formData: FormData): Promise<ShowState> {
  if (!(await requireShowManager())) return NO(DENIED);

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();
  const visibility = String(formData.get("visibility") ?? "all") === "staff" ? "staff" : "all";

  if (!name) return NO("Give the show a name.");
  if (!startDate) return NO("When does it start?");

  // An end date is optional in the form and defaults to the start — a one-day
  // schooling show is the common case and should not need the date typed twice.
  const end = endDate || startDate;

  // The database has the same rule as a CHECK constraint (shows_ends_after_it
  // _starts). Catching it here turns a constraint violation into a sentence.
  if (end < startDate) return NO("The show ends before it starts.");

  const row = {
    name,
    location: String(formData.get("location") ?? "").trim(),
    start_date: startDate,
    end_date: end,
    description: String(formData.get("description") ?? "").trim(),
    pinned: formData.get("pinned") === "on",
    visibility,
  };

  const supabase = await createClient();

  if (id) {
    const { error } = await supabase.from("shows").update(row).eq("id", id);
    if (error) return NO(error.message);
    revalidate(id);
    return OK("Saved.");
  }

  const { data, error } = await supabase.from("shows").insert(row).select("id").single();
  if (error) return NO(error.message);

  revalidate(data?.id);
  return OK(`${name} added.`);
}

/* -------------------------------------------------------------------------- */
/* 2 — the roster                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Add or edit one entry.
 *
 * RIDE TIME IS A WALL CLOCK ON THE FORM AND AN INSTANT IN THE COLUMN. The form
 * collects the date and the time the barn would say out loud; `ride_time` is
 * `timestamptz`. Building the instant with `new Date("...T08:40")` would
 * interpret those parts in whatever zone the SERVER runs in — UTC on Vercel —
 * so an 8:40 ride time would be stored as 8:40 UTC and read back as 4:40 in the
 * morning. `barnLocalToUtc` is the helper that already knows the barn's zone
 * and handles the DST edges.
 */
export async function saveEntry(_prev: ShowState, formData: FormData): Promise<ShowState> {
  if (!(await requireShowManager())) return NO(DENIED);

  const id = String(formData.get("id") ?? "").trim();
  const showId = String(formData.get("show_id") ?? "").trim();
  const riderId = String(formData.get("rider_id") ?? "").trim();
  const horseId = String(formData.get("horse_id") ?? "").trim();

  if (!showId) return NO("Missing show.");
  if (!riderId) return NO("Pick a rider.");

  const rideDate = String(formData.get("ride_date") ?? "").trim();
  const rideTime = String(formData.get("ride_time") ?? "").trim();

  // Both halves or neither. A date with no time would silently become midnight,
  // which reads on the roster as a real 12:00am ride slot.
  if (rideDate && !rideTime) return NO("Add the time as well as the day, or leave both blank.");
  if (rideTime && !rideDate) return NO("Add the day as well as the time, or leave both blank.");

  const rideAt = rideDate ? barnLocalToUtc(rideDate, rideTime) : null;
  if (rideAt && Number.isNaN(rideAt.getTime())) return NO("That ride time does not look right.");

  const row = {
    show_id: showId,
    rider_id: riderId,
    horse_id: horseId || null,
    classes: String(formData.get("classes") ?? "").trim(),
    ride_time: rideAt ? rideAt.toISOString() : null,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("show_entries").update(row).eq("id", id)
    : await supabase.from("show_entries").insert(row);

  if (isDuplicate(error)) {
    return NO(
      horseId
        ? "That rider is already entered on that horse. Edit the existing entry to add classes."
        : "That rider is already entered with no horse set. Edit that entry, or give this one a horse.",
    );
  }
  if (error) return NO(error.message);

  revalidate(showId);
  return OK(id ? "Entry saved." : "Rider entered.");
}

export async function deleteEntry(formData: FormData): Promise<void> {
  if (!(await requireShowManager())) return;

  const id = String(formData.get("id") ?? "");
  const showId = String(formData.get("show_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("show_entries").delete().eq("id", id);

  revalidate(showId);
}

/* -------------------------------------------------------------------------- */
/* 3 — results                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Add or edit one result.
 *
 * PLACING IS NULLABLE ON PURPOSE and the form says so in words: eliminated,
 * retired and withdrawn are real outcomes of a real ride. A 0 would sort as a
 * win, so the column rejects it (`placing is null or placing > 0`) and so does
 * this — with a sentence rather than a check-constraint violation.
 */
export async function saveResult(_prev: ShowState, formData: FormData): Promise<ShowState> {
  if (!(await requireShowManager())) return NO(DENIED);

  const id = String(formData.get("id") ?? "").trim();
  const showId = String(formData.get("show_id") ?? "").trim();
  const riderId = String(formData.get("rider_id") ?? "").trim();
  const rawPlacing = String(formData.get("placing") ?? "").trim();
  const rawScore = String(formData.get("score") ?? "").trim();

  if (!showId) return NO("Missing show.");
  if (!riderId) return NO("Pick a rider.");

  let placing: number | null = null;
  if (rawPlacing) {
    placing = Number(rawPlacing);
    if (!Number.isInteger(placing) || placing < 1) {
      return NO("A placing is a whole number from 1 up. Leave it blank for a ride that did not place.");
    }
  }

  let score: number | null = null;
  if (rawScore) {
    score = Number(rawScore);
    if (Number.isNaN(score)) return NO("That score does not look like a number.");
  }

  const row = {
    show_id: showId,
    rider_id: riderId,
    placing,
    score,
    class: String(formData.get("class") ?? "").trim(),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("show_results").update(row).eq("id", id)
    : await supabase.from("show_results").insert(row);

  if (isDuplicate(error)) {
    return NO(
      row.class
        ? `That rider already has a result for ${row.class}. Edit it rather than adding a second.`
        : "That rider already has a result with no class set. Name the class to record a second ride.",
    );
  }
  if (error) return NO(error.message);

  revalidate(showId);
  return OK(id ? "Result saved." : "Result added.");
}

export async function deleteResult(formData: FormData): Promise<void> {
  if (!(await requireShowManager())) return;

  const id = String(formData.get("id") ?? "");
  const showId = String(formData.get("show_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("show_results").delete().eq("id", id);

  revalidate(showId);
}

/* -------------------------------------------------------------------------- */
/* 4 — the banner                                                              */
/* -------------------------------------------------------------------------- */

/** What a phone camera produces, and what a masthead can afford to load. */
const MAX_BANNER_BYTES = 6 * 1024 * 1024;
const BANNER_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * Upload a banner and point the show at it.
 *
 * TWO WRITES, AND THE ORDER MATTERS. The object goes up first; `image_path` is
 * only set once the upload has actually succeeded. The other order would leave
 * a row claiming a banner that does not exist, which renders as a broken frame
 * for everyone until someone notices.
 *
 * `upsert: true`, unlike the documents vault. A document is a record and
 * silently replacing one is how the wrong Coggins ends up in the file; a banner
 * is decoration, and re-uploading it after a crop is the expected move.
 *
 * The previous object is removed AFTER the row is repointed, and only when the
 * new path differs — so a failed cleanup leaves an orphaned file rather than a
 * show with no picture.
 */
export async function uploadShowBanner(
  _prev: ShowState,
  formData: FormData,
): Promise<ShowState> {
  if (!(await requireShowManager())) return NO(DENIED);

  const showId = String(formData.get("show_id") ?? "").trim();
  const file = formData.get("file");

  if (!showId) return NO("Missing show.");
  if (!(file instanceof File) || file.size === 0) return NO("Choose an image to upload.");
  if (file.size > MAX_BANNER_BYTES) return NO("That image is over 6 MB. Try a smaller one.");
  if (file.type && !BANNER_TYPES.includes(file.type)) {
    return NO("Banners need to be a JPEG, PNG, WebP or AVIF image.");
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("shows")
    .select("image_path")
    .eq("id", showId)
    .maybeSingle();

  const path = showBannerPath(showId, file.name);

  const { error: uploadError } = await supabase.storage
    .from(SHOWS_BUCKET)
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });

  if (uploadError) return NO(uploadError.message);

  const { error } = await supabase.from("shows").update({ image_path: path }).eq("id", showId);
  if (error) return NO(error.message);

  const previous = existing?.image_path;
  if (previous && previous !== path) {
    await supabase.storage.from(SHOWS_BUCKET).remove([previous]);
  }

  revalidate(showId);
  return OK("Banner updated.");
}

/**
 * Clear the banner: unset the column, then remove the object.
 *
 * The row is cleared FIRST here — the mirror of the upload order, and for the
 * same reason. If the storage delete fails the show is already back to its
 * gradient; the alternative leaves a row pointing at a file that has gone.
 */
export async function removeShowBanner(formData: FormData): Promise<void> {
  if (!(await requireShowManager())) return;

  const showId = String(formData.get("show_id") ?? "");
  if (!showId) return;

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("shows")
    .select("image_path")
    .eq("id", showId)
    .maybeSingle();

  await supabase.from("shows").update({ image_path: null }).eq("id", showId);

  const path = existing?.image_path;
  // Only ever delete inside this show's own folder, whatever the row said —
  // the first path segment is what the storage policy reads as the owner.
  if (path && path.startsWith(`${showId}/`)) {
    await supabase.storage.from(SHOWS_BUCKET).remove([path]);
  }

  revalidate(showId);
}
