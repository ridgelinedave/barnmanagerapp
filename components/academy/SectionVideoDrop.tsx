"use client";

import { useId, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useUploadQueue } from "@/components/academy/UploadQueue";

/**
 * "Add videos" for one section: pick several files, or drop them on the
 * section. Each becomes a lesson titled from its filename, in filename order,
 * editable afterwards. The files go into the shell's upload queue, so the
 * page is free again at once — the uploads carry on behind her.
 *
 * Renders nothing for anyone the queue is not enabled for (only the admin).
 */
export function SectionVideoDrop({ sectionId, sectionTitle }: { sectionId: string; sectionTitle: string }) {
  const queue = useUploadQueue();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const id = useId();
  if (!queue) return null;

  const add = (list: FileList | null) => {
    const files = [...(list ?? [])].filter((f) => f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(f.name));
    if (files.length) queue.enqueue(sectionId, sectionTitle, files);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        add(e.dataTransfer.files);
      }}
      className={`flex flex-wrap items-center gap-3 rounded-control border border-dashed px-3 py-2.5 ${
        over ? "border-accent bg-accent-tint" : "border-ink/40"
      }`}
    >
      {/* The input sits INSIDE its label, so keyboard focus on the hidden
          input draws the ring on the visible button (focus-within). */}
      <label
        className={`${buttonClass("secondary", "default")} cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink`}
      >
        <Icon name="plus" className="size-4.5 shrink-0" strokeWidth={2} />
        Add videos
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="video/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <span className="hidden font-condensed text-label text-muted lg:inline">or drop them here</span>
    </div>
  );
}
