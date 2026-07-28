/** Shared domain types for the Phase 0 tables. */

export const ROLES = ["admin", "staff", "parent"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export type Profile = {
  id: string;
  user_id: string;
  role: Role;
  full_name: string | null;
  phone: string | null;
  manage_shows: boolean;
  manage_schedule: boolean;
  manage_horses: boolean;
  family_id: string | null;
  qbo_customer_id: string | null;
  created_at: string;
};

export type Family = {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
};

export type Level = {
  id: string;
  name: string;
  sort: number;
  created_at: string;
};

export type Rider = {
  id: string;
  family_id: string;
  name: string;
  dob: string | null;
  level_id: string | null;
  photo_url: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
};

export const AUDIENCES = ["all", "staff"] as const;
export type Audience = (typeof AUDIENCES)[number];

export function isAudience(value: unknown): value is Audience {
  return typeof value === "string" && (AUDIENCES as readonly string[]).includes(value);
}

export type Announcement = {
  id: string;
  created_at: string;
  title: string;
  body_md: string;
  pinned: boolean;
  notify: boolean;
  audience: Audience;
  author: string | null;
  posted_at: string;
  notified_at: string | null;
};

export const RECURRENCES = ["daily", "weekday", "weekly"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export function isRecurrence(value: unknown): value is Recurrence {
  return typeof value === "string" && (RECURRENCES as readonly string[]).includes(value);
}

export type TaskTemplate = {
  id: string;
  created_at: string;
  title: string;
  description: string;
  recurrence: Recurrence;
  /** ISO weekday, 1 = Monday … 7 = Sunday. Only set when recurrence='weekly'. */
  weekday: number | null;
  default_assignee: string | null;
  active: boolean;
};

export type TaskStatus = "open" | "done";

export type Task = {
  id: string;
  created_at: string;
  template_id: string | null;
  title: string;
  description: string;
  /** Barn-local date, YYYY-MM-DD. */
  date: string;
  assignee: string | null;
  status: TaskStatus;
  completed_at: string | null;
  completed_by: string | null;
};

export const LESSON_TYPES = ["private", "group"] as const;
export type LessonType = (typeof LESSON_TYPES)[number];

export function isLessonType(value: unknown): value is LessonType {
  return typeof value === "string" && (LESSON_TYPES as readonly string[]).includes(value);
}

export type LessonTemplate = {
  id: string;
  created_at: string;
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** HH:MM:SS, barn-local wall clock. */
  start_time: string;
  duration_min: 45 | 60;
  type: LessonType;
  instructor_id: string | null;
  max_riders: number;
  level_id: string | null;
  active: boolean;
};

export type LessonInstanceStatus = "scheduled" | "cancelled";

export type LessonInstance = {
  id: string;
  created_at: string;
  template_id: string | null;
  /** Barn-local date, YYYY-MM-DD. */
  date: string;
  start_time: string;
  duration_min: number;
  type: LessonType;
  instructor_id: string | null;
  status: LessonInstanceStatus;
  notes: string;
  /** Backfill eligibility filter. Null means any level may fill a seat. */
  level_id: string | null;
  /** Seat count, copied from the template so a later template edit can't rewrite history. */
  max_riders: number;
};

export type BackfillOfferStatus = "sent" | "accepted" | "declined" | "expired";

export type BackfillOffer = {
  id: string;
  created_at: string;
  instance_id: string;
  rider_id: string;
  offered_by: string | null;
  status: BackfillOfferStatus;
  responded_at: string | null;
};

/** Row shape returned by the eligible_backfill_riders() RPC. */
export type EligibleRider = {
  id: string;
  name: string;
  level_id: string | null;
  family_id: string;
};

export type LessonRiderStatus = "booked" | "cancelled" | "backfilled";

export type LessonRider = {
  id: string;
  created_at: string;
  instance_id: string;
  rider_id: string;
  status: LessonRiderStatus;
  cancelled_at: string | null;
};

export type PunchDirection = "in" | "out";
export type PunchSource = "self" | "admin_adjustment";

export type Punch = {
  id: string;
  created_at: string;
  profile_id: string;
  direction: PunchDirection;
  punched_at: string;
  lat: number | null;
  lng: number | null;
  source: PunchSource;
  adjusts_punch_id: string | null;
  note: string;
};

export type PayPeriodStatus = "open" | "approved" | "synced";

export type PayPeriod = {
  id: string;
  created_at: string;
  start_date: string;
  end_date: string;
  status: PayPeriodStatus;
};

export type TimesheetApproval = {
  id: string;
  created_at: string;
  period_id: string;
  profile_id: string;
  total_minutes: number;
  approved_by: string | null;
  approved_at: string | null;
  external_ref: unknown;
};

export type Notification = {
  id: string;
  profile_id: string;
  type: string;
  title: string;
  body: string | null;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
};
