"use client";

import { useActionState, useState } from "react";
import { Card, Chip, ChipRow, Sunk } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { FormFeedback } from "@/components/ui/Field";
import {
  addCorrection,
  approveTimesheet,
  createPayPeriod,
  type TimesheetState,
} from "@/app/(app)/manage/timesheets/actions";
import { formatMinutes } from "@/lib/timeclock";

const EMPTY: TimesheetState = { error: null, message: null };

function Feedback({ state }: { state: TimesheetState }) {
  return <FormFeedback error={state.error} message={state.message} />;
}

export function NewPayPeriodForm({ start, end }: { start: string; end: string }) {
  const [state, formAction, pending] = useActionState(createPayPeriod, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="pp-start" className="text-label font-medium text-ink">
            From
          </label>
          <input
            id="pp-start"
            name="start_date"
            type="date"
            defaultValue={start}
            className="min-h-12 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="pp-end" className="text-label font-medium text-ink">
            To
          </label>
          <input
            id="pp-end"
            name="end_date"
            type="date"
            defaultValue={end}
            className="min-h-12 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
          />
        </div>
      </div>
      <Feedback state={state} />
      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Opening…" : "Open a pay period"}
      </Button>
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
    <Card as="article" className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline gap-3">
        <h3 className="min-w-0 flex-1 font-display text-heading text-ink">{name}</h3>
        <span className="font-condensed text-title font-semibold leading-none text-ink">
          {formatMinutes(minutes)}
        </span>
      </div>

      {(flaggedCount > 0 || approvedMinutes !== null) && (
        <ChipRow>
          {flaggedCount > 0 && (
            <Chip value={`${flaggedCount} to check`} icon="alert" tone="gold" />
          )}
          {approvedMinutes !== null && (
            <Chip value={`Approved at ${formatMinutes(approvedMinutes)}`} icon="check" tone="forest" />
          )}
        </ChipRow>
      )}

      {periodId && (
        <form action={approveAction}>
          <input type="hidden" name="period_id" value={periodId} />
          <input type="hidden" name="profile_id" value={profileId} />
          <input type="hidden" name="total_minutes" value={minutes} />
          <Button type="submit" variant="primary" block disabled={approvePending}>
            {approvePending
              ? "Approving…"
              : approvedMinutes !== null
                ? "Re-approve at this total"
                : "Approve these hours"}
          </Button>
        </form>
      )}
      <Feedback state={approveState} />

      {correctable.length > 0 && (
        <>
          <Button
            type="button"
            onClick={() => setCorrecting((v) => !v)}
            aria-expanded={correcting}
            variant="secondary"
            block
          >
            {correcting ? "Close" : "Add a correction"}
          </Button>

          {/* Sunk, not a bordered box: this opens inside the employee's card. */}
          {correcting && (
            <Sunk>
              <CorrectionForm
                idPrefix="card"
                profileId={profileId}
                correctable={correctable}
                state={correctState}
                action={correctAction}
                pending={correctPending}
              />
            </Sunk>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * The correction form, shared by the phone card and the desktop row.
 *
 * It ADDS an adjusting row; the original punch is never edited, because
 * nothing can edit it — there is no UPDATE policy on punches for any role.
 */
function CorrectionForm({
  idPrefix,
  profileId,
  correctable,
  state,
  action,
  pending,
}: {
  idPrefix: string;
  profileId: string;
  correctable: { id: string; label: string }[];
  state: TimesheetState;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const id = (name: string) => `${idPrefix}-${name}-${profileId}`;

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="profile_id" value={profileId} />

      <p className="text-caption text-muted">
        This adds a correcting entry. The original punch stays in the record.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={id("adj")} className="text-label font-medium text-ink">
          Punch being corrected
        </label>
        <select
          id={id("adj")}
          name="adjusts_punch_id"
          required
          className="min-h-12 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
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
          <label htmlFor={id("dir")} className="text-label font-medium text-ink">
            Should be
          </label>
          <select
            id={id("dir")}
            name="direction"
            className="min-h-12 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
          >
            <option value="in">In</option>
            <option value="out">Out</option>
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={id("at")} className="text-label font-medium text-ink">
            At
          </label>
          <input
            id={id("at")}
            name="punched_at"
            type="datetime-local"
            required
            className="min-h-12 w-full rounded-control border border-line bg-surface px-2 text-body text-ink"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={id("note")} className="text-label font-medium text-ink">
          Why
        </label>
        <input
          id={id("note")}
          name="note"
          required
          placeholder="Forgot to clock out"
          className="min-h-12 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
        />
      </div>

      <Feedback state={state} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Saving…" : "Add correction"}
      </Button>
    </form>
  );
}

/**
 * The desktop table row's controls: approve in one click, correct in a modal.
 * Same two server actions as the card, so the rules (approval records the
 * total; a correction is a new row with a required reason) cannot differ by
 * screen size.
 */
export function TimesheetRowActions({
  periodId,
  profileId,
  name,
  minutes,
  approvedMinutes,
  correctable,
}: {
  periodId: string;
  profileId: string;
  name: string;
  minutes: number;
  approvedMinutes: number | null;
  correctable: { id: string; label: string }[];
}) {
  const [approveState, approveAction, approvePending] = useActionState(approveTimesheet, EMPTY);
  const [correctState, correctAction, correctPending] = useActionState(addCorrection, EMPTY);
  const [correcting, setCorrecting] = useState(false);

  return (
    <span className="flex items-center justify-end gap-1.5">
      {approveState.error && (
        <span role="alert" className="text-micro normal-case tracking-normal text-danger">
          {approveState.error}
        </span>
      )}
      <form action={approveAction}>
        <input type="hidden" name="period_id" value={periodId} />
        <input type="hidden" name="profile_id" value={profileId} />
        <input type="hidden" name="total_minutes" value={minutes} />
        <Button type="submit" size="sm" variant="primary" arrow={false} disabled={approvePending}>
          {approvePending ? "Approving…" : approvedMinutes !== null ? "Re-approve" : "Approve"}
        </Button>
      </form>
      {correctable.length > 0 && (
        <>
          <Button type="button" size="sm" variant="secondary" onClick={() => setCorrecting(true)}>
            Correct…
          </Button>
          <Sheet open={correcting} onClose={() => setCorrecting(false)} title={`Correct ${name}'s punches`}>
            <CorrectionForm
              idPrefix="row"
              profileId={profileId}
              correctable={correctable}
              state={correctState}
              action={correctAction}
              pending={correctPending}
            />
          </Sheet>
        </>
      )}
    </span>
  );
}
