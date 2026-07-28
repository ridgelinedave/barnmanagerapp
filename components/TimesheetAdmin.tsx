"use client";

import { useActionState, useState } from "react";
import {
  addCorrection,
  approveTimesheet,
  createPayPeriod,
  type TimesheetState,
} from "@/app/(app)/manage/timesheets/actions";
import { formatMinutes } from "@/lib/timeclock";

const EMPTY: TimesheetState = { error: null, message: null };

function Feedback({ state }: { state: TimesheetState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-900">
        {state.message}
      </p>
    );
  }
  return null;
}

export function NewPayPeriodForm({ start, end }: { start: string; end: string }) {
  const [state, formAction, pending] = useActionState(createPayPeriod, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="pp-start" className="text-sm font-medium">
            From
          </label>
          <input
            id="pp-start"
            name="start_date"
            type="date"
            defaultValue={start}
            className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="pp-end" className="text-sm font-medium">
            To
          </label>
          <input
            id="pp-end"
            name="end_date"
            type="date"
            defaultValue={end}
            className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
          />
        </div>
      </div>
      <Feedback state={state} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-brand-gold px-4 text-base font-semibold text-brand-ink disabled:opacity-60"
      >
        {pending ? "Opening…" : "Open a pay period"}
      </button>
    </form>
  );
}

/**
 * One employee's card for a period: total, flagged punches, approve.
 *
 * Correcting a punch opens a form that ADDS an adjusting row. Nothing here
 * edits the original, because nothing can — there is no UPDATE policy on
 * punches for any role. The note is required for the same reason.
 */
export function EmployeeTimesheetCard({
  periodId,
  profileId,
  name,
  minutes,
  flaggedCount,
  approvedMinutes,
  correctable,
}: {
  periodId: string | null;
  profileId: string;
  name: string;
  minutes: number;
  flaggedCount: number;
  approvedMinutes: number | null;
  /** Punches that can be corrected, newest first. */
  correctable: { id: string; label: string }[];
}) {
  const [approveState, approveAction, approvePending] = useActionState(approveTimesheet, EMPTY);
  const [correctState, correctAction, correctPending] = useActionState(addCorrection, EMPTY);
  const [correcting, setCorrecting] = useState(false);

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-brand-ink/15 bg-white p-4">
      <div className="flex items-baseline gap-2">
        <h3 className="flex-1 text-base font-semibold">{name}</h3>
        <span className="text-lg font-semibold tabular-nums">{formatMinutes(minutes)}</span>
      </div>

      <div className="flex flex-wrap gap-1">
        {flaggedCount > 0 && (
          <span className="rounded-full bg-brand-ink/10 px-2 py-0.5 text-[11px] font-semibold text-brand-ink/75">
            {flaggedCount} to check
          </span>
        )}
        {approvedMinutes !== null && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-900">
            Approved at {formatMinutes(approvedMinutes)}
          </span>
        )}
      </div>

      {periodId && (
        <form action={approveAction}>
          <input type="hidden" name="period_id" value={periodId} />
          <input type="hidden" name="profile_id" value={profileId} />
          <input type="hidden" name="total_minutes" value={minutes} />
          <button
            type="submit"
            disabled={approvePending}
            className="min-h-11 w-full rounded-xl bg-brand-gold px-4 text-sm font-semibold text-brand-ink disabled:opacity-60"
          >
            {approvePending
              ? "Approving…"
              : approvedMinutes !== null
                ? "Re-approve at this total"
                : "Approve these hours"}
          </button>
        </form>
      )}
      <Feedback state={approveState} />

      {correctable.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setCorrecting((v) => !v)}
            aria-expanded={correcting}
            className="min-h-11 w-full rounded-xl border border-brand-ink/20 bg-white text-sm font-semibold"
          >
            {correcting ? "Close" : "Add a correction"}
          </button>

          {correcting && (
            <form action={correctAction} className="flex flex-col gap-3 rounded-xl border border-brand-ink/15 p-3">
              <input type="hidden" name="profile_id" value={profileId} />

              <p className="text-xs text-brand-ink/60">
                This adds a correcting entry. The original punch stays in the record.
              </p>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={`adj-${profileId}`} className="text-sm font-medium">
                  Punch being corrected
                </label>
                <select
                  id={`adj-${profileId}`}
                  name="adjusts_punch_id"
                  required
                  className="min-h-11 rounded-xl border border-brand-ink/20 bg-white px-3 text-sm"
                >
                  {correctable.map((punch) => (
                    <option key={punch.id} value={punch.id}>
                      {punch.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <div className="flex flex-1 flex-col gap-1.5">
                  <label htmlFor={`dir-${profileId}`} className="text-sm font-medium">
                    Should be
                  </label>
                  <select
                    id={`dir-${profileId}`}
                    name="direction"
                    className="min-h-11 rounded-xl border border-brand-ink/20 bg-white px-3 text-sm"
                  >
                    <option value="in">In</option>
                    <option value="out">Out</option>
                  </select>
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <label htmlFor={`at-${profileId}`} className="text-sm font-medium">
                    At
                  </label>
                  <input
                    id={`at-${profileId}`}
                    name="punched_at"
                    type="datetime-local"
                    required
                    className="min-h-11 rounded-xl border border-brand-ink/20 bg-white px-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={`note-${profileId}`} className="text-sm font-medium">
                  Why
                </label>
                <input
                  id={`note-${profileId}`}
                  name="note"
                  required
                  placeholder="Forgot to clock out"
                  className="min-h-11 rounded-xl border border-brand-ink/20 bg-white px-3 text-sm"
                />
              </div>

              <Feedback state={correctState} />

              <button
                type="submit"
                disabled={correctPending}
                className="min-h-11 rounded-xl bg-brand-gold px-4 text-sm font-semibold text-brand-ink disabled:opacity-60"
              >
                {correctPending ? "Saving…" : "Add correction"}
              </button>
            </form>
          )}
        </>
      )}
    </article>
  );
}
