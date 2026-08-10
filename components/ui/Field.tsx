import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/**
 * Form controls.
 *
 * Every field has a VISIBLE label. A placeholder is not a label — it vanishes
 * the moment someone types, which is exactly when they need to check what they
 * are filling in. Helper text is persistent for the same reason.
 *
 * 16px text is not a style choice: anything smaller makes iOS Safari zoom the
 * viewport when the field takes focus, and the page never zooms back.
 */
const CONTROL =
  "min-h-12 w-full rounded-control border border-line bg-surface px-3 text-body text-ink " +
  "placeholder:text-muted/80 focus:border-accent-deep";

export function Field({
  label,
  htmlFor,
  hint,
  optional = false,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  /** Persistent helper. Say what a good answer looks like, not what the field is. */
  hint?: string;
  optional?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-label font-medium text-ink">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children}
      {/* Error sits below the field it belongs to, never in a summary at the top. */}
      {error ? (
        <p role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-caption text-muted">{hint}</p>
      )}
    </div>
  );
}

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROL} ${className}`} {...rest} />;
}

export function Textarea({
  className = "",
  rows = 3,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={`${CONTROL} py-2.5 ${className}`} {...rest} />;
}

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${CONTROL} ${className}`} {...rest}>
      {children}
    </select>
  );
}

/** A checkbox that is a real 48px row, not a 16px square to aim at. */
export function CheckRow({
  label,
  ...rest
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex min-h-12 items-center gap-3 rounded-control border border-line bg-surface px-3">
      <input type="checkbox" className="size-5 shrink-0 accent-[var(--accent)]" {...rest} />
      <span className="text-body text-ink">{label}</span>
    </label>
  );
}

/** Feedback after a submit. Announced to screen readers, dismissible by time. */
export function FormFeedback({ error, message }: { error?: string | null; message?: string | null }) {
  if (error) {
    return (
      <p role="alert" className="rounded-control border border-danger/30 bg-danger-soft p-3 text-caption text-ink">
        {error}
      </p>
    );
  }
  if (message) {
    return (
      <p role="status" className="rounded-control border border-forest/25 bg-forest-soft p-3 text-caption text-ink">
        {message}
      </p>
    );
  }
  return null;
}
