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

export type Horse = {
  id: string;
  created_at: string;
  name: string;
  barn_name: string | null;
  /** Null = barn-owned. Non-null gives that family full read on this row. */
  owner_family_id: string | null;
  photo_url: string | null;
  breed: string | null;
  dob: string | null;
  active: boolean;
  notes: string | null;
};

/**
 * What a family sees for a horse their rider rides but they do not own.
 *
 * This is not "a Horse with fewer fields chosen by the UI" — it is the entire
 * return type of horses_basics(), and the database cannot produce breed, dob or
 * notes through it. Keeping it a separate type stops anyone reaching for
 * `horse.notes` on a row that will never carry one.
 */
export type HorseBasics = {
  id: string;
  name: string;
  barn_name: string | null;
  photo_url: string | null;
};

export type HorseRider = {
  id: string;
  created_at: string;
  horse_id: string;
  rider_id: string;
};

export const MEALS = ["am", "lunch", "pm"] as const;
export type Meal = (typeof MEALS)[number];

export function isMeal(value: unknown): value is Meal {
  return typeof value === "string" && (MEALS as readonly string[]).includes(value);
}

export const MEAL_LABELS: Record<Meal, string> = {
  am: "Morning",
  lunch: "Lunch",
  pm: "Evening",
};

export type FeedPlan = {
  id: string;
  created_at: string;
  horse_id: string;
  meal: Meal;
  description: string;
  supplements: string;
  special_instructions: string;
  active: boolean;
};

export const CARE_TYPES = [
  "vaccine",
  "coggins",
  "dental",
  "deworm",
  "farrier",
  "vet",
  "medication",
  "wound",
  "other",
] as const;
export type CareType = (typeof CARE_TYPES)[number];

export function isCareType(value: unknown): value is CareType {
  return typeof value === "string" && (CARE_TYPES as readonly string[]).includes(value);
}

export const CARE_TYPE_LABELS: Record<CareType, string> = {
  vaccine: "Vaccine",
  coggins: "Coggins",
  dental: "Dental",
  deworm: "Worming",
  farrier: "Farrier",
  vet: "Vet",
  medication: "Medication",
  wound: "Wound",
  other: "Other",
};

export type CareEvent = {
  id: string;
  created_at: string;
  horse_id: string;
  type: CareType;
  description: string;
  /** Barn-local date, YYYY-MM-DD. Routinely in the past — care is logged after the fact. */
  performed_at: string;
  due_next: string | null;
  /** Forced to the logging profile by a trigger; never client-supplied. */
  logged_by: string | null;
};

export const FORM_FIELD_TYPES = ["text", "textarea", "checkbox", "date"] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export type FormField = {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
};

export function isFormField(value: unknown): value is FormField {
  if (typeof value !== "object" || value === null) return false;
  const field = value as Record<string, unknown>;
  return (
    typeof field.key === "string" &&
    typeof field.label === "string" &&
    typeof field.type === "string" &&
    (FORM_FIELD_TYPES as readonly string[]).includes(field.type)
  );
}

/** Field definitions come out of jsonb, so anything malformed is dropped rather than rendered. */
export function fieldsOf(schema: unknown): FormField[] {
  return Array.isArray(schema) ? schema.filter(isFormField) : [];
}

export type FormTemplate = {
  id: string;
  created_at: string;
  name: string;
  description: string;
  schema: unknown;
  required: boolean;
  applies_to: "family" | "rider";
  active: boolean;
};

export type FormStatus = "pending" | "complete";

export type FormSubmission = {
  id: string;
  created_at: string;
  template_id: string;
  family_id: string;
  rider_id: string | null;
  data: Record<string, unknown>;
  signed_name: string | null;
  signed_at: string | null;
  status: FormStatus;
  /** Path in the private documents bucket. Written server-side on signing. */
  document_path: string | null;
};

export const EVENT_TYPES = ["show", "clinic", "farrier", "vet", "closure", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value);
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  show: "Show",
  clinic: "Clinic",
  farrier: "Farrier",
  vet: "Vet",
  closure: "Closed",
  other: "Other",
};

export type EventVisibility = "all" | "staff";

/** Named BarnEvent, not Event — `Event` is a DOM global and shadowing it bites. */
export type BarnEvent = {
  id: string;
  created_at: string;
  type: EventType;
  title: string;
  description: string;
  start_at: string;
  end_at: string | null;
  location: string;
  visibility: EventVisibility;
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
