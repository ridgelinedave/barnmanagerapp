"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FaceImage } from "@/components/ui/FaceImage";
import { Icon } from "@/components/ui/Icon";
import { initialOf } from "@/components/ui/ListRow";

/**
 * THE photo control — one component for horses, riders and announcements.
 *
 * A circle: the photo where there is one, else the initial on accent-tint
 * (13.27:1), with a small "+" badge that says it can be changed. Tapping it
 * opens the file picker; the chosen image goes through a CROP-TO-SQUARE step
 * (drag to frame, slider to zoom, arrow keys for both on a keyboard), and the
 * square is written into a hidden file input named `name`, so it travels with
 * whatever form the control sits in. That is what makes "image at creation"
 * work: a create form submits the photo with the record, no save-then-upload.
 *
 * `autoSubmit` is for an existing record: confirming the crop submits the
 * enclosing form straight away (see PhotoUploadForm).
 *
 * The output is a 1024px square, WebP where the browser can encode it and
 * JPEG where it cannot (older Safari) — a few hundred KB, far under the 6 MB
 * bucket cap and the server-action body limit. A dead photo URL falls back to
 * the initial (FaceImage). The target is at least 56px.
 */
const OUT = 1024;
/** 16:9 for course covers ("wide"): 1600 x 900, a landscape card on any screen. */
const OUT_WIDE = { w: 1600, h: 900 };
export type PhotoAspect = "square" | "wide";

type Size = "md" | "lg" | "xl";
const SIZES: Record<Size, { box: string; text: string }> = {
  md: { box: "size-14", text: "text-title" },
  lg: { box: "size-20", text: "text-display" },
  xl: { box: "size-28", text: "text-[2.25rem]" },
};

async function encodeCrop(
  img: HTMLImageElement,
  rect: { sx: number; sy: number; sw: number; sh: number },
  out: { w: number; h: number },
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = out.w;
  canvas.height = out.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot crop images.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, out.w, out.h);

  const toBlob = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await toBlob("image/webp", 0.85);
  // A browser that cannot encode WebP silently hands back a PNG; use JPEG.
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg", 0.88);
  if (!blob) throw new Error("The photo could not be prepared.");
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `photo.${ext}`, { type: blob.type });
}

function Cropper({
  file,
  onCancel,
  onDone,
  aspect = "square",
}: {
  file: File;
  onCancel: () => void;
  onDone: (cropped: File) => void;
  aspect?: PhotoAspect;
}) {
  // The frame's height as a fraction of its width: 1 for a square, 9/16 wide.
  const ratio = aspect === "wide" ? 9 / 16 : 1;
  // Created and revoked in ONE effect. Creating it in state and revoking it in
  // a cleanup broke in development: React runs mount → cleanup → mount, so the
  // URL was revoked before the image loaded and the frame stayed empty.
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL's lifetime is this effect's
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const imgRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const titleId = useId();

  useEffect(() => {
    const measure = () => setBox(boxRef.current?.clientWidth ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const boxH = box * ratio;
  // "Cover" the frame: the image is never smaller than it in either direction.
  const scale = natural && box ? Math.max(box / natural.w, boxH / natural.h) * zoom : 1;
  const shown = natural ? { w: natural.w * scale, h: natural.h * scale } : { w: 0, h: 0 };

  // Keep the image covering the square: no empty edge can be cropped in.
  const clamp = (x: number, y: number) => ({
    x: Math.min(0, Math.max(box - shown.w, x)),
    y: Math.min(0, Math.max(boxH - shown.h, y)),
  });

  // Centre on load and re-clamp whenever the zoom or the box changes.
  useEffect(() => {
    if (!natural || !box) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- framing follows the measured box and zoom
    setPos((p) => {
      const next = clamp(p.x, p.y);
      return next.x === p.x && next.y === p.y ? p : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, box, natural]);

  const onLoad = () => {
    const img = imgRef.current;
    // Measured here too: the image can finish loading before the effect runs.
    const side = boxRef.current?.clientWidth ?? box;
    if (!img || !side) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setBox(side);
    setNatural({ w, h });
    const sideH = side * ratio;
    const s = Math.max(side / w, sideH / h);
    setPos({ x: (side - w * s) / 2, y: (sideH - h * s) / 2 });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setPos(clamp(d.x + e.clientX - d.px, d.y + e.clientY - d.py));
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = 16;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (moves[e.key]) {
      e.preventDefault();
      setPos(clamp(pos.x + moves[e.key][0], pos.y + moves[e.key][1]));
    } else if (e.key === "+" || e.key === "=") {
      setZoom((z) => Math.min(3, z + 0.1));
    } else if (e.key === "-") {
      setZoom((z) => Math.max(1, z - 0.1));
    }
  };

  const confirm = async () => {
    const img = imgRef.current;
    if (!img || !natural || !box) return;
    setBusy(true);
    setError(null);
    try {
      onDone(
        await encodeCrop(
          img,
          { sx: -pos.x / scale, sy: -pos.y / scale, sw: box / scale, sh: boxH / scale },
          aspect === "wide" ? OUT_WIDE : { w: OUT, h: OUT },
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "The photo could not be prepared.");
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-4 sm:items-center"
    >
      <div className={`flex w-full flex-col gap-4 rounded-card bg-surface p-4 ${aspect === "wide" ? "max-w-lg" : "max-w-sm"}`}>
        <h2 id={titleId} className="font-display text-title text-ink">
          Frame the photo
        </h2>

        <div
          ref={boxRef}
          tabIndex={0}
          aria-label="Photo framing. Drag, or use the arrow keys to move and plus or minus to zoom."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          className={`relative w-full touch-none overflow-hidden rounded-control bg-sunk ${aspect === "wide" ? "aspect-video" : "aspect-square"}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src && <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            onLoad={onLoad}
            className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
            style={{
              width: natural ? shown.w : undefined,
              height: natural ? shown.h : undefined,
              transform: `translate(${pos.x}px, ${pos.y}px)`,
              visibility: natural ? "visible" : "hidden",
            }}
          />}
          {/* The circle the avatar will show, over the square that is saved.
              A wide cover is shown exactly as framed, so it has no overlay. */}
          {aspect === "square" && (
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px] shadow-ink/40" />
          )}
        </div>

        <label className="flex items-center gap-3 font-condensed text-label font-medium text-muted">
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="min-h-11 flex-1 accent-[var(--accent)]"
          />
        </label>

        {error && (
          <p role="alert" className="text-caption text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy} className="flex-1">
            Cancel
          </Button>
          <Button type="button" variant="primary" arrow={false} onClick={confirm} disabled={busy || !natural} autoFocus className="flex-1">
            {busy ? "Preparing" : "Use photo"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PhotoUpload({
  name = "photo",
  displayName,
  src,
  label,
  size = "lg",
  autoSubmit = false,
  aspect = "square",
}: {
  /** The form field the cropped square is submitted as. */
  name?: string;
  /** Whose photo this is — the initial is the fallback. Empty on a create
      form, where there is no name yet: the circle is then simply empty. */
  displayName: string;
  /** A signed URL for the current photo, or null. */
  src?: string | null;
  /** "Horse photo", "Rider photo" — the control's accessible name. */
  label: string;
  size?: Size;
  autoSubmit?: boolean;
  /** "wide": a 16:9 course cover — a landscape tile, cropped to 16:9. */
  aspect?: PhotoAspect;
}) {
  const pickRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const s = SIZES[size];

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const done = (cropped: File) => {
    setPicked(null);
    const field = fieldRef.current;
    if (field) {
      const transfer = new DataTransfer();
      transfer.items.add(cropped);
      field.files = transfer.files;
    }
    setPreview(URL.createObjectURL(cropped));
    if (autoSubmit) field?.form?.requestSubmit();
  };

  const initials = (
    <span
      aria-hidden="true"
      className={`${s.box} ${s.text} flex items-center justify-center rounded-full bg-accent-tint font-display text-accent-text`}
    >
      {displayName ? initialOf(displayName) : ""}
    </span>
  );
  const current = preview ?? src ?? null;

  const wideEmpty = (
    <span
      aria-hidden="true"
      className="flex aspect-video w-full items-center justify-center gap-2 rounded-control border border-dashed border-ink/40 bg-sunk font-condensed text-label font-semibold uppercase tracking-[0.08em] text-ink"
    >
      <Icon name="plus" className="size-4" strokeWidth={2.5} />
      {label}
    </span>
  );

  return (
    <>
      {aspect === "wide" ? (
        <button
          type="button"
          onClick={() => pickRef.current?.click()}
          aria-label={`${current ? "Change" : "Add"} ${label.toLowerCase()}`}
          className="relative block w-full max-w-md rounded-control"
        >
          {current ? (
            <FaceImage
              key={current}
              src={current}
              className="aspect-video w-full rounded-control border border-rule object-cover"
              fallback={wideEmpty}
            />
          ) : (
            wideEmpty
          )}
          {current && (
            <span className="absolute bottom-2 right-2 rounded-control border border-ink/50 bg-surface px-2 py-1 font-condensed text-micro font-semibold uppercase text-ink">
              Change
            </span>
          )}
        </button>
      ) : (
      <button
        type="button"
        onClick={() => pickRef.current?.click()}
        aria-label={`${current ? "Change" : "Add"} ${label.toLowerCase()}`}
        className={`relative ${s.box} shrink-0 rounded-full`}
      >
        {current ? (
          <FaceImage
            key={current}
            src={current}
            className={`${s.box} rounded-full border border-rule object-cover`}
            fallback={initials}
          />
        ) : (
          initials
        )}
        {/* The add/change badge: accent fill carrying white, 7.6:1. */}
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full border-2 border-surface bg-accent text-accent-on"
        >
          <Icon name="plus" className="size-3.5" strokeWidth={2.5} />
        </span>
      </button>
      )}

      {/* What the picker returns, before cropping. Never submitted. */}
      <input
        ref={pickRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setPicked(f);
          e.target.value = "";
        }}
      />
      {/* The cropped square — this is the one the form sends. */}
      <input ref={fieldRef} type="file" name={name} className="sr-only" tabIndex={-1} aria-hidden="true" />

      {picked && <Cropper file={picked} onCancel={() => setPicked(null)} onDone={done} aspect={aspect} />}
    </>
  );
}
