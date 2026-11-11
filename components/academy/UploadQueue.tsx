"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { CHUNK_BYTES, byFilename, maxDurationFor, titleFromFilename, uploadProblem } from "@/lib/academy-upload";
import { forgetUpload, readSaved, rememberUpload, sameFile, stillUsable } from "@/lib/academy-upload-store";
import { createLessonFromUpload, discardUpload, replaceLessonVideo, requestUploadLink, syncLessonDurations } from "@/app/(app)/lessons/learn/upload-actions";

/**
 * The Academy upload queue — browser -> Cloudflare Stream, over tus.
 *
 * LIVES IN THE APP SHELL (app/(app)/layout.tsx), not in a page, so the barn
 * owner can drop ten videos into a section and keep working: moving to
 * another screen does not unmount it, and the panel follows her. Leaving the
 * site while an upload runs asks first (beforeunload).
 *
 * ONE FILE AT A TIME, in filename order. Ten parallel uploads would fight over
 * one barn wifi connection, and serial completion is what makes the lessons
 * land in filename order.
 *
 * PER FILE:
 *   1. its duration is read HERE, from the file's own metadata in a <video>
 *      element (nothing uploaded); unreadable (an iPhone HEVC .mov in some
 *      browsers) -> the fixed fallback reservation;
 *   2. its link is minted JUST BEFORE it starts (requestUploadLink), so a
 *      long queue cannot outlive its links — an expired link refuses even an
 *      upload in progress (proved: Cloudflare error 10017);
 *   3. 10 MiB chunks are PATCHed straight to Cloudflare's upload host with
 *      NO Authorization header — the account token never reaches the
 *      browser; on a dropped chunk it waits, asks Cloudflare for the offset it
 *      holds (HEAD) and resumes from there, so a retry costs one chunk.
 *      OFFLINE is not a failure: it waits for the connection to come back,
 *      however long that takes, and carries on;
 *   4. when the last byte is in, the lesson is created at the end of its
 *      section, titled from the filename, and shows "Processing" until Stream
 *      has encoded it and reported a duration. A REPLACEMENT (`replace`) goes
 *      through the same steps and then points its existing lesson at the new
 *      video instead (replaceLessonVideo), deleting the old one.
 *
 * LEAVING AND COMING BACK. Each running upload's link is remembered in this
 * browser (lib/academy-upload-store.ts). After a reload, a closed tab or a
 * locked phone, the panel lists what was interrupted: one whose bytes were
 * all in becomes its lesson by itself; one with bytes left asks for the same
 * file again (dropping it on any section works too) and resumes from what
 * Cloudflare already holds.
 */
type Status =
  | "reading"
  | "queued"
  | "uploading"
  | "retrying"
  | "offline"
  | "finishing"
  | "processing"
  | "interrupted"
  | "failed"
  | "cancelled";

type Link = { uploadUrl: string; videoId: string; expiresAt: string };

type Item = {
  key: string;
  /** Null for an interrupted upload until the same file is chosen again. */
  file: File | null;
  name: string;
  size: number;
  sectionId: string;
  sectionTitle: string;
  title: string;
  status: Status;
  sent: number;
  durationSeconds: number | null;
  /** Shown in the row: a retry countdown, an error and what to do about it. */
  note: string | null;
  lessonId: string | null;
  link: Link | null;
  /** Set when this upload replaces that lesson's video instead of adding a lesson. */
  replaceLessonId: string | null;
};

type QueueApi = {
  enqueue: (sectionId: string, sectionTitle: string, files: File[]) => void;
  /** Upload `file` as the new video of an existing lesson. */
  replace: (lesson: { id: string; title: string; sectionId: string; sectionTitle: string }, file: File) => void;
};

const QueueContext = createContext<QueueApi | null>(null);

export function useUploadQueue(): QueueApi | null {
  return useContext(QueueContext);
}

const RETRY_DELAYS_MS = [1_000, 3_000, 6_000, 10_000, 20_000, 30_000, 60_000, 60_000];
const RUNNING: Status[] = ["reading", "queued", "uploading", "retrying", "offline", "finishing"];

function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(value);
    };
    const timer = window.setTimeout(() => done(null), 15_000);
    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      done(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      done(null);
    };
    video.src = url;
  });
}

/** One chunk over XHR (fetch has no upload progress). Resolves the new offset. */
function sendChunk(
  uploadUrl: string,
  body: Blob,
  offset: number,
  onProgress: (loaded: number) => void,
  register: (xhr: XMLHttpRequest) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    register(xhr);
    xhr.open("PATCH", uploadUrl);
    // tus headers only. Deliberately NO Authorization: the link is the
    // credential, and it is good for this one video.
    xhr.setRequestHeader("Tus-Resumable", "1.0.0");
    xhr.setRequestHeader("Upload-Offset", String(offset));
    xhr.setRequestHeader("Content-Type", "application/offset+octet-stream");
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const next = Number(xhr.getResponseHeader("Upload-Offset"));
        resolve(Number.isFinite(next) && next > offset ? next : offset + body.size);
      } else {
        reject(Object.assign(new Error(`HTTP ${xhr.status}`), { status: xhr.status, body: xhr.responseText }));
      }
    };
    xhr.onerror = () => reject(Object.assign(new Error("network"), { status: 0 }));
    xhr.onabort = () => reject(Object.assign(new Error("cancelled"), { status: -1 }));
    xhr.send(body);
  });
}

/** The offset Cloudflare holds for this upload, or null if it cannot say (gone, expired, offline). */
async function serverOffset(uploadUrl: string): Promise<number | null> {
  try {
    const res = await fetch(uploadUrl, { method: "HEAD", headers: { "Tus-Resumable": "1.0.0" } });
    if (!res.ok) return null;
    const value = Number(res.headers.get("Upload-Offset"));
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function waitForOnline(): Promise<void> {
  if (navigator.onLine) return Promise.resolve();
  return new Promise((resolve) => window.addEventListener("online", () => resolve(), { once: true }));
}

function megabytes(bytes: number): string {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / (1024 * 1024))} MB`;
}

const pctOf = (item: Pick<Item, "sent" | "size">) => (item.size > 0 ? Math.floor((item.sent / item.size) * 100) : 0);

export function UploadQueueProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(true);
  const router = useRouter();
  const busy = useRef(false);
  const xhrs = useRef(new Map<string, XMLHttpRequest>());
  const cancelled = useRef(new Set<string>());
  const itemsRef = useRef<Item[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const patch = useCallback((key: string, change: Partial<Item>) => {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }, []);

  /** The last step, shared by a finished upload and one recovered after a reload. */
  const finish = useCallback(
    async (key: string, sectionId: string, title: string, videoId: string, replaceLessonId: string | null) => {
      patch(key, { status: "finishing", note: null });
      const lesson = replaceLessonId
        ? await replaceLessonVideo({ lessonId: replaceLessonId, videoId })
        : await createLessonFromUpload({ sectionId, title, videoId });
      if (!lesson.ok) {
        patch(key, { status: "failed", note: lesson.error });
        return;
      }
      forgetUpload(videoId);
      patch(key, { status: "processing", lessonId: lesson.lessonId, note: null });
      router.refresh();
    },
    [patch, router],
  );

  const run = useCallback(
    async (item: Item) => {
      const { key } = item;
      const file = item.file;
      if (!file) return;
      let link = item.link && stillUsable(item.link) ? item.link : null;
      if (!link) {
        if (item.link) void discardUpload(item.link.videoId);
        const minted = await requestUploadLink({
          sectionId: item.sectionId,
          title: item.title,
          sizeBytes: file.size,
          durationSeconds: item.durationSeconds,
        });
        if (!minted.ok) {
          patch(key, { status: "failed", note: minted.error, link: null });
          return;
        }
        link = { uploadUrl: minted.uploadUrl, videoId: minted.videoId, expiresAt: minted.expiresAt };
        rememberUpload({
          name: file.name,
          size: file.size,
          sectionId: item.sectionId,
          sectionTitle: item.sectionTitle,
          title: item.title,
          uploadUrl: link.uploadUrl,
          videoId: link.videoId,
          expiresAt: link.expiresAt,
          durationSeconds: item.durationSeconds,
          replaceLessonId: item.replaceLessonId,
        });
        patch(key, { link, sent: 0 });
      }

      // Resume from what Cloudflare actually holds.
      let offset = item.link === link ? ((await serverOffset(link.uploadUrl)) ?? item.sent) : 0;
      let failures = 0;
      patch(key, { status: "uploading", sent: offset, note: null });

      while (offset < file.size) {
        if (cancelled.current.has(key)) {
          patch(key, { status: "cancelled", note: null });
          return;
        }
        const end = Math.min(offset + CHUNK_BYTES, file.size);
        try {
          const start = offset;
          offset = await sendChunk(
            link.uploadUrl,
            file.slice(start, end),
            start,
            (loaded) => patch(key, { sent: start + loaded }),
            (xhr) => xhrs.current.set(key, xhr),
          );
          failures = 0;
          patch(key, { status: "uploading", sent: offset, note: null });
        } catch (error) {
          const e = error as { status?: number; body?: string };
          if (e.status === -1) {
            patch(key, { status: "cancelled", note: null });
            return;
          }
          // A refusal (4xx) will not fix itself; a dropped connection might.
          if ((e.status ?? 0) >= 400 && (e.status ?? 0) < 500) {
            forgetUpload(link.videoId);
            patch(key, { status: "failed", note: uploadProblem(e.status, e.body), link: null });
            return;
          }
          if (!navigator.onLine) {
            // Offline is not a failure and does not use up retries.
            patch(key, { status: "offline", note: "No internet connection. This carries on by itself when it's back." });
            await waitForOnline();
          } else {
            if (failures >= RETRY_DELAYS_MS.length) {
              patch(key, {
                status: "failed",
                note: `The connection kept dropping. Press Retry: it carries on from ${pctOf({ sent: offset, size: file.size })}%.`,
              });
              return;
            }
            const wait = RETRY_DELAYS_MS[failures++];
            patch(key, { status: "retrying", note: `Connection dropped. Trying again in ${Math.round(wait / 1000)} s.` });
            await new Promise((r) => setTimeout(r, wait));
          }
          offset = (await serverOffset(link.uploadUrl)) ?? offset;
          patch(key, { status: "uploading", sent: offset, note: null });
        }
      }

      patch(key, { sent: file.size });
      await finish(key, item.sectionId, item.title, link.videoId, item.replaceLessonId);
    },
    [patch, finish],
  );

  // THE PUMP: start the next queued file when nothing is uploading. Called
  // from events — a file's length has been read, an upload finished, Retry —
  // never from an effect, so a render cannot start an upload. The busy flag
  // makes a second call (or React's double-invoked updater in development) a
  // no-op while one runs.
  const pump = useCallback(
    function pumpNext() {
      if (busy.current) return;
      setItems((list) => {
        const next = list.find((i) => i.status === "queued");
        if (next && !busy.current) {
          busy.current = true;
          queueMicrotask(() => {
            void run(next).finally(() => {
              busy.current = false;
              xhrs.current.delete(next.key);
              pumpNext();
            });
          });
        }
        return list;
      });
    },
    [run],
  );

  /** The same file chosen again for an interrupted upload: queue it to resume. */
  const resumeWith = useCallback(
    (key: string, file: File) => {
      patch(key, { file, status: "queued", note: null });
      pump();
    },
    [patch, pump],
  );

  const enqueue = useCallback(
    (sectionId: string, sectionTitle: string, files: File[]) => {
      const sorted = [...files].filter((f) => f.size > 0).sort(byFilename);
      const fresh: File[] = [];
      for (const file of sorted) {
        // A file that matches an interrupted upload resumes it, whichever section it was dropped on.
        const waiting = itemsRef.current.find((i) => i.status === "interrupted" && sameFile(i, file));
        if (waiting) resumeWith(waiting.key, file);
        else fresh.push(file);
      }
      const added: Item[] = fresh.map((file) => ({
        key: `${file.name}:${file.size}:${file.lastModified}:${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        size: file.size,
        sectionId,
        sectionTitle,
        title: titleFromFilename(file.name),
        status: "reading",
        sent: 0,
        durationSeconds: null,
        note: null,
        lessonId: null,
        link: null,
        replaceLessonId: null,
      }));
      setItems((list) => [...list, ...added]);
      setOpen(true);
      // Durations first, all files, locally — so each link's reservation is
      // sized to its own file before any of them starts.
      for (const item of added) {
        void readDuration(item.file as File).then((seconds) => {
          patch(item.key, { status: "queued", durationSeconds: maxDurationFor(seconds).fromFile ? seconds : null });
          pump();
        });
      }
    },
    [patch, pump, resumeWith],
  );

  const replace = useCallback<QueueApi["replace"]>(
    (lesson, file) => {
      if (file.size <= 0) return;
      const item: Item = {
        key: `replace:${lesson.id}:${file.name}:${file.size}:${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        size: file.size,
        sectionId: lesson.sectionId,
        sectionTitle: lesson.sectionTitle,
        title: lesson.title,
        status: "reading",
        sent: 0,
        durationSeconds: null,
        note: null,
        lessonId: null,
        link: null,
        replaceLessonId: lesson.id,
      };
      setItems((list) => [...list, item]);
      setOpen(true);
      void readDuration(file).then((seconds) => {
        patch(item.key, { status: "queued", durationSeconds: maxDurationFor(seconds).fromFile ? seconds : null });
        pump();
      });
    },
    [patch, pump],
  );
  const api = useMemo<QueueApi>(() => ({ enqueue, replace }), [enqueue, replace]);

  // COMING BACK: what this browser was uploading when it last left.
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    void (async () => {
      const recovered: Item[] = [];
      for (const saved of readSaved()) {
        if (!stillUsable(saved)) {
          forgetUpload(saved.videoId);
          continue;
        }
        const held = await serverOffset(saved.uploadUrl);
        if (held === null) {
          // Gone at Cloudflare (finished and closed, or expired) — nothing to resume.
          forgetUpload(saved.videoId);
          continue;
        }
        recovered.push({
          key: `saved:${saved.videoId}`,
          file: null,
          name: saved.name,
          size: saved.size,
          sectionId: saved.sectionId,
          sectionTitle: saved.sectionTitle,
          title: saved.title,
          status: held >= saved.size ? "finishing" : "interrupted",
          sent: held,
          durationSeconds: saved.durationSeconds,
          note: null,
          lessonId: null,
          link: { uploadUrl: saved.uploadUrl, videoId: saved.videoId, expiresAt: saved.expiresAt },
          replaceLessonId: saved.replaceLessonId ?? null,
        });
      }
      if (stop || recovered.length === 0) return;
      setItems((list) => [...recovered.filter((r) => !list.some((i) => i.key === r.key)), ...list]);
      setOpen(true);
      for (const r of recovered) {
        if (r.status === "finishing" && r.link) void finish(r.key, r.sectionId, r.title, r.link.videoId, r.replaceLessonId);
      }
    })();
    return () => {
      stop = true;
    };
  }, [enabled, finish]);

  // Stream processing -> durations. Poll gently while any lesson is processing.
  useEffect(() => {
    const waiting = items.filter((i) => i.status === "processing" && i.lessonId).map((i) => i.lessonId as string);
    if (waiting.length === 0) return;
    const timer = window.setTimeout(async () => {
      const { pending } = await syncLessonDurations(waiting);
      if (pending < waiting.length) router.refresh();
      if (pending === 0) setItems((list) => list.map((i) => (i.status === "processing" ? { ...i, note: "Ready", lessonId: null } : i)));
    }, 15_000);
    return () => window.clearTimeout(timer);
  }, [items, router]);

  const active = items.some((i) => RUNNING.includes(i.status));
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  const cancel = (key: string) => {
    cancelled.current.add(key);
    xhrs.current.get(key)?.abort();
    // Give the storage reservation back now, not at the link's expiry.
    const videoId = items.find((i) => i.key === key)?.link?.videoId;
    if (videoId) {
      forgetUpload(videoId);
      void discardUpload(videoId);
    }
    patch(key, { status: "cancelled", note: null, link: null });
  };
  const retry = (key: string) => {
    cancelled.current.delete(key);
    const item = items.find((i) => i.key === key);
    if (item?.status === "failed" && !item.file && item.link) {
      // A recovered upload whose lesson failed to save: just save it again.
      void finish(key, item.sectionId, item.title, item.link.videoId, item.replaceLessonId);
      return;
    }
    patch(key, { status: item?.file ? "queued" : "interrupted", note: null });
    pump();
  };
  const clearFinished = () => setItems((list) => list.filter((i) => !["processing", "failed", "cancelled"].includes(i.status)));

  const total = items.length;
  const finished = items.filter((i) => i.status === "processing").length;

  return (
    <QueueContext.Provider value={enabled ? api : null}>
      {children}
      {enabled && total > 0 && (
        <aside
          aria-label="Uploads"
          className="fixed inset-x-2 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 flex max-h-[60dvh] flex-col rounded-control border border-rule bg-surface lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-[26rem]"
        >
          <div className="flex min-h-12 items-center gap-2 border-b border-line px-3">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-[0.9375rem] font-semibold text-ink"
            >
              <Icon name="chevron" className={`size-4 shrink-0 transition-transform ${open ? "rotate-90" : "-rotate-90"}`} />
              Uploads · {finished} of {total}
            </button>
            {!active && (
              <Button type="button" size="sm" variant="ghost" onClick={clearFinished} className="max-lg:min-h-11">
                Clear
              </Button>
            )}
          </div>
          {open && (
            <ul className="flex flex-col overflow-y-auto" aria-live="polite">
              {items.map((item) => (
                <UploadRow
                  key={item.key}
                  item={item}
                  onCancel={() => cancel(item.key)}
                  onRetry={() => retry(item.key)}
                  onDiscard={() => cancel(item.key)}
                  onChoose={(file) => {
                    if (sameFile(item, file)) resumeWith(item.key, file);
                    else patch(item.key, { note: `That's a different file. Choose "${item.name}" (${megabytes(item.size)}).` });
                  }}
                />
              ))}
            </ul>
          )}
        </aside>
      )}
    </QueueContext.Provider>
  );
}

function UploadRow({
  item,
  onCancel,
  onRetry,
  onDiscard,
  onChoose,
}: {
  item: Item;
  onCancel: () => void;
  onRetry: () => void;
  onDiscard: () => void;
  onChoose: (file: File) => void;
}) {
  const pct = pctOf(item);
  const label =
    item.status === "reading"
      ? "Getting ready"
      : item.status === "queued"
        ? "Waiting"
        : item.status === "uploading"
          ? `${pct}% · ${megabytes(item.sent)} of ${megabytes(item.size)}`
          : item.status === "retrying" || item.status === "offline"
            ? `${pct}% · paused`
            : item.status === "finishing"
              ? item.replaceLessonId
                ? "Switching the lesson"
                : "Saving the lesson"
              : item.status === "processing"
                ? item.note === "Ready"
                  ? "Ready"
                  : "Processing"
                : item.status === "interrupted"
                  ? `${pct}% · interrupted`
                  : item.status === "cancelled"
                    ? "Cancelled"
                    : "Didn't finish";
  const note =
    item.status === "interrupted"
      ? (item.note ?? `Choose "${item.name}" again to finish. It carries on from ${pct}%.`)
      : item.note && item.note !== "Ready"
        ? item.note
        : null;
  const problem = item.status === "failed";

  return (
    <li className="flex flex-col gap-1.5 border-b border-line px-3 py-2.5 last:border-b-0">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate font-sans text-body text-ink">
          {item.title}
          {item.replaceLessonId && <span className="text-muted"> · new video</span>}
        </span>
        <span className={`shrink-0 font-condensed text-label tabular-nums ${problem ? "text-danger" : "text-muted"}`}>{label}</span>
      </div>
      {["uploading", "retrying", "offline", "finishing", "interrupted"].includes(item.status) && (
        <div
          role="progressbar"
          aria-label={`${item.title} upload`}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1 w-full overflow-hidden rounded-full bg-rule"
        >
          <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      )}
      {note || problem || ["uploading", "retrying", "offline", "queued", "interrupted"].includes(item.status) ? (
        <div className="flex flex-wrap items-center gap-2">
          {note && <span className={`min-w-0 flex-1 basis-full text-caption ${problem ? "text-danger" : "text-muted"}`}>{note}</span>}
          {item.status === "interrupted" && (
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-ink/50 px-3 text-[0.9375rem] font-semibold text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink lg:min-h-9">
              Choose file
              <input
                type="file"
                accept="video/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onChoose(file);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          {item.status === "interrupted" && (
            <Button type="button" size="sm" variant="ghost" onClick={onDiscard} className="max-lg:min-h-11">
              Discard
            </Button>
          )}
          {["uploading", "retrying", "offline", "queued"].includes(item.status) && (
            <Button type="button" size="sm" variant="ghost" onClick={onCancel} className="max-lg:min-h-11">
              Cancel
            </Button>
          )}
          {problem && (
            <Button type="button" size="sm" variant="secondary" onClick={onRetry} className="max-lg:min-h-11">
              Retry
            </Button>
          )}
        </div>
      ) : null}
    </li>
  );
}
