/**
 * Types mirroring the backend API contract.
 *
 * Every shape here is derived from the Express route handlers in
 * `packages/backend/src/routes/*`. Dates arrive as ISO-8601 strings over JSON,
 * so they are typed as `string` rather than `Date`.
 *
 * Content hierarchy after the schema redesign:
 *   University > Program > Stream > Semester > Subject > Chapter > Note
 *
 * Two consequences run through this file:
 *   - notes hang off a CHAPTER (`chapterId`), never a subject; and
 *   - subscriptions are ACCOUNT level against a plan, so they carry a status and
 *     a billing period instead of a subject and a per-subject date range.
 */

/** Error codes emitted by the backend error handler. */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'DEVICE_LIMIT_REACHED'
  | 'NO_ACTIVE_SUBSCRIPTION'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR'
  /** Client-side only: the request never reached the API. */
  | 'NETWORK_ERROR';

/** The `{ error: { code, message } }` envelope returned on every failure. */
export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * `details` shape the backend attaches to a VALIDATION_ERROR.
 *
 * `handleValidation` sets `{ field }` from the failing express-validator path,
 * and `PUT /api/catalog/me/selection` sets the same key when the selected chain
 * is inconsistent. It is the hook UI code uses to put the message on the right
 * input.
 */
export interface ValidationErrorDetails {
  field?: string;
}

/** The authenticated student, as returned by login and session validation. */
export interface AuthUser {
  id: string;
  email: string;
  userType: 'student' | 'admin';
  registeredAt?: string;
}

/** POST /api/auth/register -> 201 */
export interface RegisterResponse {
  student: {
    id: string;
    email: string;
    registeredAt: string;
  };
  session: {
    token: string;
    expiresAt: string;
  };
}

/** POST /api/auth/login -> 200 */
export interface LoginResponse {
  user: AuthUser;
  session: {
    token: string;
    expiresAt: string;
  };
  device: {
    id: string;
    registeredAt: string;
    lastAccessedAt: string;
  };
}

/** GET /api/auth/session -> 200 */
export interface SessionResponse {
  user: AuthUser;
  session: {
    expiresAt?: string;
  };
}

// ---------------------------------------------------------------------------
// Catalogue hierarchy
// ---------------------------------------------------------------------------

/** The four levels a student can select, shallowest to deepest. */
export type HierarchyLevel = 'university' | 'program' | 'stream' | 'semester';

/** GET /api/catalog/universities */
export interface University {
  id: string;
  name: string;
}

/** GET /api/catalog/programs?universityId= */
export interface Program {
  id: string;
  name: string;
  universityId: string;
}

/** GET /api/catalog/streams?programId= */
export interface Stream {
  id: string;
  name: string;
  programId: string;
}

/**
 * GET /api/catalog/semesters?streamId=
 *
 * `label` is computed by the backend (`name ?? "Semester {number}"`), so the UI
 * never has to decide how to name a semester.
 */
export interface Semester {
  id: string;
  number: number;
  name: string | null;
  streamId: string;
  label: string;
}

/** A semester's subject, as listed by GET /api/catalog/semesters/:id/subjects */
export interface CatalogSubject {
  id: string;
  name: string;
  code: string | null;
  position: number;
}

/**
 * A subject's chapter, as listed by GET /api/catalog/subjects/:id/chapters
 *
 * `noteCount` counts PUBLISHED notes only.
 */
export interface CatalogChapter {
  id: string;
  title: string;
  position: number;
  noteCount: number;
}

/** GET /api/catalog/universities -> 200 */
export interface UniversitiesResponse {
  universities: University[];
}

/** GET /api/catalog/programs -> 200 */
export interface ProgramsResponse {
  programs: Program[];
}

/** GET /api/catalog/streams -> 200 */
export interface StreamsResponse {
  streams: Stream[];
}

/** GET /api/catalog/semesters -> 200 */
export interface SemestersResponse {
  semesters: Semester[];
}

/** GET /api/catalog/semesters/:id/subjects -> 200 */
export interface SemesterSubjectsResponse {
  semesterId: string;
  subjects: CatalogSubject[];
}

/** GET /api/catalog/subjects/:id/chapters -> 200 */
export interface SubjectChaptersResponse {
  subjectId: string;
  subjectName: string;
  chapters: CatalogChapter[];
}

/**
 * A published note's listing entry. Bodies are served by GET /api/notes/:id.
 *
 * Note that `/api/catalog/chapters/:id/notes` omits `chapterId` on each entry
 * (it is on the envelope) while `/api/subjects/:id/notes` includes it, so the
 * field is optional here.
 */
export interface NoteSummary {
  id: string;
  title: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  chapterId?: string;
  isPublished?: boolean;
}

/**
 * GET /api/catalog/chapters/:id/notes -> 200
 * Requires an active subscription; 403 NO_ACTIVE_SUBSCRIPTION otherwise.
 */
export interface ChapterNotesResponse {
  chapterId: string;
  chapterTitle: string;
  subjectId: string;
  notes: NoteSummary[];
}

// ---------------------------------------------------------------------------
// Dashboard selection
// ---------------------------------------------------------------------------

/** The semester as returned inside a selection, with its display label. */
export interface SelectedSemester {
  id: string;
  number: number;
  name: string | null;
  label: string;
}

/** The student's persisted browse selection. Any level may be unset. */
export interface Selection {
  university: University | null;
  program: { id: string; name: string } | null;
  stream: { id: string; name: string } | null;
  semester: SelectedSemester | null;
}

/** GET /api/catalog/me/selection -> 200 */
export interface SelectionResponse {
  selection: Selection;
}

/** PUT /api/catalog/me/selection -> 200 */
export interface SaveSelectionResponse {
  message: string;
  selection: Selection;
}

/**
 * PUT /api/catalog/me/selection request body.
 *
 * The deepest supplied id defines the selection: the backend fills in its
 * ancestry and clears everything below it. Any shallower id sent alongside must
 * agree with that ancestry, or the response is a 400 carrying
 * `details.field` naming the offending level. An empty body clears the
 * selection.
 */
export interface SelectionInput {
  universityId?: string | null;
  programId?: string | null;
  streamId?: string | null;
  semesterId?: string | null;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Hierarchy filters accepted by GET /api/catalog/search. */
export interface SearchFilters {
  universityId?: string;
  programId?: string;
  streamId?: string;
  semesterId?: string;
  subjectId?: string;
}

/** Where a hit matched, most specific first. */
export type SearchMatchField = 'title' | 'body' | 'subject' | 'chapter';

/** The full path of a search hit, from university down to chapter. */
export interface SearchBreadcrumb {
  university: University;
  program: { id: string; name: string };
  stream: { id: string; name: string };
  semester: SelectedSemester;
  subject: { id: string; name: string };
  chapter: { id: string; title: string };
}

/**
 * One search hit.
 *
 * `headline` is a snippet produced by Postgres `ts_headline` over the note's
 * MARKDOWN content, with matches wrapped in literal `<mark>` / `</mark>`. The
 * surrounding text is NOT escaped, so it must never be injected as HTML - see
 * `lib/highlight.ts`, which splits it into text segments and renders the marks
 * as real elements.
 */
export interface SearchResult {
  noteId: string;
  title: string;
  position: number;
  headline: string;
  matchedIn: SearchMatchField[];
  createdAt: string;
  updatedAt: string;
  breadcrumb: SearchBreadcrumb;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * GET /api/catalog/search?q= -> 200
 * Requires an active subscription; 403 NO_ACTIVE_SUBSCRIPTION otherwise.
 */
export interface SearchResponse {
  query: string;
  filters: SearchFilters;
  pagination: PaginationMeta;
  results: SearchResult[];
}

// ---------------------------------------------------------------------------
// Subjects and notes (subscription-gated)
// ---------------------------------------------------------------------------

/** A subject as returned by /api/subjects. */
export interface Subject {
  id: string;
  semesterId: string;
  name: string;
  code: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * GET /api/subjects/:id -> 200
 *
 * Kept for the note reader's breadcrumb resolution, which needs a subject's
 * `semesterId` to walk back up the hierarchy from a bare note id (see
 * `useSubject` in `lib/queries.ts`). The catalogue-wide listing
 * (`GET /api/subjects`) and the per-subject notes/search endpoints predate the
 * hierarchy redesign and have no caller any more - browsing uses
 * `SemesterSubjectsResponse` / `SubjectChaptersResponse` / `ChapterNotesResponse`,
 * and search uses `SearchResponse` - so their types were removed along with the
 * dead hooks that wrapped them.
 */
export interface SubjectResponse {
  subject: Subject;
}

/**
 * GET /api/notes/:id -> 200
 *
 * `content` is MARKDOWN (it was sanitized HTML before the schema redesign).
 * The backend strips script-executing HTML constructs on write, but the client
 * still renders it through a Markdown renderer that emits React elements only -
 * never `dangerouslySetInnerHTML`.
 */
export interface Note {
  id: string;
  chapterId: string;
  title: string;
  content: string;
  position: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/notes/:id -> 200 */
export interface NoteResponse {
  note: Note;
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

/** Subscription lifecycle states (prisma `subscription_status`). */
export type SubscriptionStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'FAILED';

/** Billing cadence of a plan (prisma `billing_interval`). */
export type BillingInterval = 'MONTHLY' | 'YEARLY';

/** The plan a subscription is held against. */
export interface SubscriptionPlanSummary {
  id: string;
  name: string;
  code: string;
  billingInterval: BillingInterval;
}

/**
 * An ACCOUNT-level subscription. One active subscription unlocks the whole
 * catalogue; there is no per-subject entitlement any more.
 *
 * `expiresAt` is an explicit alias for `currentPeriodEnd`.
 */
export interface Subscription {
  id: string;
  planId: string;
  plan: SubscriptionPlanSummary | null;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  expiresAt: string;
}

/**
 * GET /api/students/me/subscriptions -> 200
 *
 * Only subscriptions that grant access right now are returned (status ACTIVE
 * and the current time inside the billing period), so an empty array means the
 * account has no access.
 */
export interface SubscriptionsResponse {
  subscriptions: Subscription[];
}

/** GET /api/students/me -> 200 */
export interface StudentProfileResponse {
  student: {
    id: string;
    email: string;
    registeredAt: string;
  };
}

/** A device registered against the student's account. */
export interface RegisteredDevice {
  id: string;
  registeredAt: string;
  lastAccessedAt: string;
  isCurrentDevice: boolean;
}

/** GET /api/students/me/devices -> 200 */
export interface DevicesResponse {
  devices: RegisteredDevice[];
  deviceLimit: number;
}

/** DELETE /api/students/me/devices/:deviceId -> 200 */
export interface RevokeDeviceResponse {
  message: string;
  deviceId: string;
}
