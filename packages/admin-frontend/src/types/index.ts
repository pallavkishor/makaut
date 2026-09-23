/**
 * Shared domain types for the admin panel.
 *
 * These mirror the admin API exactly as implemented in
 * `packages/backend/src/routes/admin*Routes.ts`. Dates are ISO-8601 strings
 * because that is what the JSON API returns; conversion to `Date` happens at
 * the edges (formatting / date inputs).
 *
 * Content hierarchy, as of the phase-2 schema:
 *
 *   University > Program > Stream > Semester > Subject > Chapter > Note
 *
 * Subscriptions are account-level against a subscription plan - they are not
 * per-subject grants any more.
 */

export interface AdminUser {
  id: string;
  email: string;
  userType: 'admin';
  createdAt?: string;
}

export interface AdminSession {
  token: string;
  expiresAt?: string;
}

// ---------------------------------------------------------------------------
// Students and devices
// ---------------------------------------------------------------------------

export interface Student {
  id: string;
  email: string;
  registeredAt: string;
  /** Optional aggregates some list endpoints include. */
  deviceCount?: number;
  activeSubscriptionCount?: number;
}

export interface RegisteredDevice {
  id: string;
  studentId?: string;
  registeredAt: string;
  lastAccessedAt: string;
}

// ---------------------------------------------------------------------------
// Academic hierarchy
// ---------------------------------------------------------------------------

export interface University {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Program {
  id: string;
  universityId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Stream {
  id: string;
  programId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Semester {
  id: string;
  streamId: string;
  number: number;
  /** Semesters may be unnamed; `null` clears an existing name. */
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Subject {
  id: string;
  semesterId: string;
  name: string;
  code: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  /** Only `GET /api/admin/subjects/:id` includes this. */
  noteCount?: number;
}

export interface Chapter {
  id: string;
  subjectId: string;
  title: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

/** The four levels of the hierarchy that have their own CRUD screens. */
export type HierarchyLevel = 'university' | 'program' | 'stream' | 'semester';

/**
 * What a cascading delete removed, as reported by every hierarchy DELETE.
 *
 * Each level reports only the levels strictly below it, so the keys present
 * depend on which level was deleted (a stream delete has no `streams` key).
 */
export interface DeletedCounts {
  programs?: number;
  streams?: number;
  semesters?: number;
  subjects?: number;
  chapters?: number;
  notes?: number;
  resources?: number;
}

/** `GET /api/admin/hierarchy/tree?universityId=` */
export interface TreeChapter {
  id: string;
  title: string;
  position: number;
}

export interface TreeSubject {
  id: string;
  name: string;
  code: string | null;
  position: number;
  chapters: TreeChapter[];
}

export interface TreeSemester {
  id: string;
  number: number;
  name: string | null;
  subjects: TreeSubject[];
}

export interface TreeStream {
  id: string;
  name: string;
  semesters: TreeSemester[];
}

export interface TreeProgram {
  id: string;
  name: string;
  streams: TreeStream[];
}

export interface HierarchyTree {
  id: string;
  name: string;
  programs: TreeProgram[];
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export interface NoteSummary {
  id: string;
  chapterId: string;
  title: string;
  position: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Note extends NoteSummary {
  /** Markdown, not HTML - the backend stores it as authored. */
  content: string;
}

// ---------------------------------------------------------------------------
// PDF resources
// ---------------------------------------------------------------------------

export const RESOURCE_TYPES = [
  'REFERENCE',
  'PREVIOUS_YEAR_PAPER',
  'QUESTION_PAPER',
  'SYLLABUS',
  'OTHER',
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  REFERENCE: 'Reference',
  PREVIOUS_YEAR_PAPER: 'Previous year paper',
  QUESTION_PAPER: 'Question paper',
  SYLLABUS: 'Syllabus',
  OTHER: 'Other',
};

export interface Resource {
  id: string;
  subjectId: string | null;
  chapterId: string | null;
  title: string;
  description: string | null;
  resourceType: ResourceType;
  /** Server-side path. Never a public URL. */
  storagePath: string;
  fileSizeBytes: number;
  mimeType: string;
  isPublished: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Subscription plans
// ---------------------------------------------------------------------------

export const BILLING_INTERVALS = ['MONTHLY', 'YEARLY'] as const;

export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const BILLING_INTERVAL_LABELS: Record<BillingInterval, string> = {
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
};

export interface SubscriptionPlan {
  id: string;
  name: string;
  code: string;
  billingInterval: BillingInterval;
  /** Integer minor units (paise). Never a float. */
  priceAmount: number;
  currency: string;
  durationDays: number;
  isActive: boolean;
  razorpayPlanId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Only `GET /api/admin/plans/:id` includes this. */
  subscriptionCount?: number;
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export const SUBSCRIPTION_STATUSES = [
  'PENDING',
  'ACTIVE',
  'EXPIRED',
  'CANCELLED',
  'FAILED',
] as const;

/** Stored enum on the subscription row - not derived from the date window. */
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  PENDING: 'Pending',
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
};

export interface Subscription {
  id: string;
  studentId: string;
  /** Denormalised by the API so the list does not need a second lookup. */
  studentEmail: string | null;
  planId: string;
  planName: string | null;
  planCode: string | null;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * The reduced shape `GET /api/admin/students/:id` nests under
 * `student.activeSubscriptions` - no student email, no timestamps.
 */
export interface StudentSubscription {
  id: string;
  planId: string;
  planName: string | null;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

// ---------------------------------------------------------------------------
// Shared envelopes
// ---------------------------------------------------------------------------

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  pagination: PageMeta;
}

export interface UploadedImage {
  url: string;
  filename: string;
}
