"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * A bottom sheet, on the native <dialog> element.
 *
 * WHY <dialog> AND NOT A DIV: a positioned overlay inside a card or a
 * transformed container gets clipped by its ancestor's stacking context, which
 * is the classic "my modal is behind the tab bar" bug. `<dialog>` renders in
 * the browser's top layer — above everything, always — and brings the focus
 * trap, the Escape key and `aria-modal` with it instead of us reimplementing
 * three accessibility features badly.
 *
 * A sheet, not a full page, for a short action: it keeps the context you came
 * from visible behind it, which is what makes "log care" feel like a note
 * rather than a detour.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Escape and backdrop both route through the same close, so the parent's
  // state can never drift out of sync with what is on screen.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClick={(event) => {
        // A click on the dialog element itself is a click on the backdrop —
        // the content sits in a child, so it never matches.
        if (event.target === ref.current) onClose();
      }}
      className="
        m-0 mt-auto w-full max-w-screen-sm rounded-t-sheet border-0 bg-surface p-0
        text-ink shadow-sheet backdrop:bg-chrome/50
        sm:mx-auto sm:mb-0
      "
    >
      <div className="safe-bottom flex max-h-[85dvh] flex-col">
        {/* Drag affordance. Decorative — the close button is the real control. */}
        <div className="flex justify-center pt-2.5" aria-hidden="true">
          <span className="h-1 w-9 rounded-chip bg-line" />
        </div>

        <div className="flex items-center gap-3 px-4 pb-3 pt-2">
          <h2 className="min-w-0 flex-1 font-display text-title text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-chip text-muted"
          >
            <Icon name="plus" className="size-5 rotate-45" strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">{children}</div>
      </div>
    </dialog>
  );
}

/**
 * The trigger + sheet as one unit, so a screen can drop in a quick action
 * without wiring open state itself.
 */
export function SheetTrigger({
  label,
  title,
  children,
  variant = "secondary",
}: {
  label: string;
  title: string;
  children: ReactNode | ((close: () => void) => ReactNode);
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const styles =
    variant === "primary"
      ? "bg-gold text-ink border-transparent"
      : "bg-surface text-ink border-line";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control border px-4 text-label font-semibold transition-transform duration-150 ease-out active:scale-[0.985] ${styles}`}
      >
        {label}
      </button>
      <Sheet open={open} onClose={close} title={title}>
        {typeof children === "function" ? children(close) : children}
      </Sheet>
    </>
  );
}
