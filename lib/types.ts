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
