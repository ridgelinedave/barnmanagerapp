"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { CHUNK_BYTES, byFilename, maxDurationFor, titleFromFilename } from "@/lib/academy-upload";
import { createLessonFromUpload, discardUpload, requestUploadLink, syncLessonDurations } from "@/app/(app)/lessons/learn/upload-actions";

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
 *      element (nothing uploaded); unreadable -> the fixed fallback, and the
 *      row says so;
 *   2. its link is minted JUST BEFORE it starts (requestUploadLink), so a
 *      long queue cannot outlive its links — an expired link refuses even an
 *      upload in progress (proved: Cloudflare error 10017);
 *   3. 10 MiB chunks are PATCHed straight to Cloudflare's upload host with
 *      NO Authorization header — the account token never reaches the
 *      browser; on a dropped chunk it waits, asks Cloudflare for the offset it
 *      holds (HEAD) and resumes from there, so a retry costs one chunk;
 *   4. when the last byte is in, the lesson is created at the end of its
 *      section, titled from the filename, and shows "Processing" until Stream
 *      has encoded it and reported a duration.
 */
type Status = "reading" | "queued" | "uploading" | "retrying" | "finishing" | "processing" | "failed" | "cancelled";

type Item = {
  key: string;
  file: File;
  sectionId: string;
  sectionTitle: string;
  title: string;
  status: Status;
  sent: number;
  durationSeconds: number | null;
  /** Shown in the row: the fallback reservation, a retry countdown, an error. */
  note: string | null;
  lessonId: string | null;
  link: { uploadUrl: string; videoId: string } | null;
};

type QueueApi = { enqueue: (sectionId: string, sectionTitle: string, files: File[]) => void };

const QueueContext = createContext<QueueApi | null>(null);

export function useUploadQueue(): QueueApi | null {
  return useContext(QueueContext);
}

const RETRY_DELAYS_MS = [1_000, 3_000, 6_000, 10_000, 20_000, 30_000, 60_000, 60_000];

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

/** The offset Cloudflare holds for this upload, or null if it cannot say. */
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

function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function describeFailure(error: unknown): string {
  const e = error as { status?: number; body?: string; message?: string };
  if (e.body && /10017|expired/i.test(e.body)) return "The upload link expired. Retry for a new one.";
  if (e.status && e.status >= 400 && e.status < 500) return `Cloudflare refused the upload (HTTP ${e.status}).`;
  return "The connection kept dropping.";
}

export function UploadQueueProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(true);
  const router = useRouter();
  const busy = useRef(false);
  const xhrs = useRef(new Map<string, XMLHttpRequest>());
  const cancelled = useRef(new Set<string>());

  const patch = useCallback((key: string, change: Partial<Item>) => {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }, []);

  const run = useCallback(
    async (item: Item) => {
      const { file, key } = item;
      let link = item.link;
      if (!link) {
        const minted = await requestUploadLink({
          sectionId: item.sectionId,
          title: item.title,
          sizeBytes: file.size,
          durationSeconds: item.durationSeconds,
        });
        if (!minted.ok) {
          patch(key, { status: "failed", note: minted.error });
          return;
        }
        link = { uploadUrl: minted.uploadUrl, videoId: minted.videoId };
        patch(key, { link });
      }

      let offset = (item.link ? await serverOffset(link.uploadUrl) : 0) ?? item.sent;
      let failures = 0;
      patch(key, { status: "uploading", sent: offset });

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
          patch(key, { status: "uploading", sent: offset, note: item.note });
        } catch (error) {
          const e = error as { status?: number };
          if (e.status === -1) {
            patch(key, { status: "cancelled", note: null });
            return;
          }
          // A refusal (4xx) will not fix itself; a dropped connection might.
          if ((e.status ?? 0) >= 400 && (e.status ?? 0) < 500) {
            patch(key, { status: "failed", note: describeFailure(error), link: null });
            return;
          }
          if (failures >= RETRY_DELAYS_MS.length) {
            patch(key, { status: "failed", note: describeFailure(error) });
            return;
          }
          const wait = RETRY_DELAYS_MS[failures++];
          patch(key, { status: "retrying", note: `Connection dropped. Retrying in ${Math.round(wait / 1000)} s` });
          await new Promise((r) => setTimeout(r, wait));
          // Resume from what Cloudflare actually holds, so the retry costs at
          // most one chunk.
          offset = (await serverOffset(link.uploadUrl)) ?? offset;
          patch(key, { status: "uploading", sent: offset, note: item.note });
        }
      }

      patch(key, { status: "finishing", sent: file.size });
      const lesson = await createLessonFromUpload({ sectionId: item.sectionId, title: item.title, videoId: link.videoId });
      if (!lesson.ok) {
        patch(key, { status: "failed", note: lesson.error });
        return;
      }
      patch(key, { status: "processing", lessonId: lesson.lessonId, note: null });
      router.refresh();
    },
    [patch, router],
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

  const enqueue = useCallback(
    (sectionId: string, sectionTitle: string, files: File[]) => {
      const sorted = [...files].filter((f) => f.size > 0).sort(byFilename);
      const added: Item[] = sorted.map((file) => ({
        key: `${file.name}:${file.size}:${file.lastModified}:${Math.random().toString(36).slice(2)}`,
        file,
        sectionId,
        sectionTitle,
        title: titleFromFilename(file.name),
        status: "reading",
        sent: 0,
        durationSeconds: null,
        note: null,
        lessonId: null,
        link: null,
      }));
      setItems((list) => [...list, ...added]);
      setOpen(true);
      // Durations first, all files, locally — so each link's reservation is
      // sized to its own file before any of them starts.
      for (const item of added) {
        void readDuration(item.file).then((seconds) => {
          const plan = maxDurationFor(seconds);
          patch(item.key, {
            status: "queued",
            durationSeconds: seconds,
            note: plan.fromFile ? null : `Length unreadable here: reserving ${plan.seconds / 3600} h`,
          });
          pump();
        });
      }
    },
    [patch, pump],
  );

  // Stream processing -> durations. Poll gently while any lesson is processing.
  useEffect(() => {
    const waiting = items.filter((i) => i.status === "processing" && i.lessonId).map((i) => i.lessonId as string);
    if (waiting.length === 0) return;
    const timer = window.setTimeout(async () => {
      const { pending } = await syncLessonDurations(waiting);
      if (pending < waiting.length) router.refresh();
      if (pending === 0) setItems((list) => list.map((i) => (i.status === "processing" ? { ...i, status: "processing", note: "Ready", lessonId: null } : i)));
    }, 15_000);
    return () => window.clearTimeout(timer);
  }, [items, router]);

  const active = items.some((i) => ["reading", "queued", "uploading", "retrying", "finishing"].includes(i.status));
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
    if (videoId) void discardUpload(videoId);
    patch(key, { status: "cancelled", note: null, link: null });
  };
  const retry = (key: string) => {
    cancelled.current.delete(key);
    patch(key, { status: "queued", note: null });
    pump();
  };
  const clearFinished = () =>
    setItems((list) => list.filter((i) => !["processing", "failed", "cancelled"].includes(i.status)));

  const total = items.length;
  const finished = items.filter((i) => i.status === "processing").length;

  return (
    <QueueContext.Provider value={enabled ? { enqueue } : null}>
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
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left font-condensed text-label font-semibold uppercase tracking-[0.08em] text-ink"
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
              {items.map((item) => {
                const pct = Math.round((item.sent / item.file.size) * 100);
                const label =
                  item.status === "reading"
                    ? "Reading length"
                    : item.status === "queued"
                      ? "Waiting"
                      : item.status === "uploading"
                        ? `${pct}% · ${megabytes(item.sent)} of ${megabytes(item.file.size)}`
                        : item.status === "retrying"
                          ? `${pct}% · paused`
                          : item.status === "finishing"
                            ? "Saving the lesson"
                            : item.status === "processing"
                              ? item.note === "Ready"
                                ? "Ready"
                                : "Processing"
                              : item.status === "cancelled"
                                ? "Cancelled"
                                : "Failed";
                return (
                  <li key={item.key} className="flex flex-col gap-1.5 border-b border-line px-3 py-2.5 last:border-b-0">
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate font-sans text-body text-ink">{item.title}</span>
                      <span
                        className={`shrink-0 font-condensed text-label tabular-nums ${
                          item.status === "failed" ? "text-danger" : "text-muted"
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                    {["uploading", "retrying", "finishing"].includes(item.status) && (
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
                    {(item.note && item.note !== "Ready") || item.status === "failed" || ["uploading", "retrying", "queued"].includes(item.status) ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {item.note && item.note !== "Ready" && (
                          <span className={`min-w-0 flex-1 text-caption ${item.status === "failed" ? "text-danger" : "text-muted"}`}>
                            {item.note}
                          </span>
                        )}
                        {["uploading", "retrying", "queued"].includes(item.status) && (
                          <Button type="button" size="sm" variant="ghost" onClick={() => cancel(item.key)} className="max-lg:min-h-11">
                            Cancel
                          </Button>
                        )}
                        {item.status === "failed" && (
                          <Button type="button" size="sm" variant="secondary" onClick={() => retry(item.key)} className="max-lg:min-h-11">
                            Retry
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      )}
    </QueueContext.Provider>
  );
}
