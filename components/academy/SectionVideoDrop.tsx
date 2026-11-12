"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useUploadQueue } from "@/components/academy/UploadQueue";

/**
 * Adding videos to one section. Each file becomes a lesson titled from its
 * filename, in filename order, editable afterwards. The files go into the
 * shell's upload queue, so the page is free again at once.
 *
 * Two ways in, one rule:
 *   - "+ Add videos", a QUIET text button at the foot of the section;
 *   - dropping files on the section — the dashed drop zone appears ONLY while
 *     files are being dragged, over the section they will land in
 *     (`useVideoDrop`, used by the course editor's section panel).
 *
 * Renders nothing for anyone the queue is not enabled for (only the admin).
 */
export function isVideoFile(f: File): boolean {
  return f.type.startsWith("video/") || /\.(mp4|mov|m4v|hevc|webm|mkv|avi)$/i.test(f.name);
}

/** Files to the queue; returns the names that were not videos (said, not dropped silently). */
export function useAddVideos(sectionId: string, sectionTitle: string) {
  const queue = useUploadQueue();
  const [skipped, setSkipped] = useState<string[]>([]);
  const add = (list: FileList | File[] | null) => {
    const all = [...(list ?? [])];
    setSkipped(all.filter((f) => !isVideoFile(f)).map((f) => f.name));
    const files = all.filter(isVideoFile);
    if (files.length && queue) queue.enqueue(sectionId, sectionTitle, files);
  };
  return { enabled: Boolean(queue), add, skipped };
}

export function AddVideosButton({ sectionTitle, onFiles }: { sectionTitle: string; onFiles: (files: FileList | null) => void }) {
  return (
    // The input sits INSIDE its label, so keyboard focus on the hidden input
    // draws the ring on the visible control (focus-within).
    <label
      className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 self-start rounded-control px-2 text-[0.9375rem] font-semibold text-accent-text underline-offset-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink hover:underline"
    >
      <Icon name="plus" className="size-4 shrink-0" strokeWidth={2.25} />
      Add videos
      <span className="sr-only"> to {sectionTitle}</span>
      <input
        type="file"
        accept="video/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}

/** True when a drag carries files from the computer (not a lesson being moved). */
export function dragHasFiles(e: { dataTransfer: DataTransfer | null }): boolean {
  return Boolean(e.dataTransfer && [...e.dataTransfer.types].includes("Files"));
}
