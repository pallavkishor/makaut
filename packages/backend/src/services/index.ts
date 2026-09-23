/**
 * Services Index
 * Central export point for all service modules
 */

export {
  registerStudent,
  loginStudent,
  loginAdmin,
  setPrismaClient as setAuthPrismaClient,
  resetPrismaClient as resetAuthPrismaClient,
} from './auth';

export type {
  RegisterStudentResult,
  LoginResult,
} from './auth';

export {
  identifyDevice,
  getRegisteredDevices,
  canLoginFromDevice,
  registerDevice,
  updateDeviceLastAccessed,
  revokeDevice,
  terminateDeviceSessions,
  setPrismaClient as setDevicePrismaClient,
  resetPrismaClient as resetDevicePrismaClient,
} from './device';

export type {
  RegisteredDeviceInfo,
} from './device';

export {
  createSubscription,
  isSubscriptionActive,
  getActiveSubscriptions,
  hasActiveSubscription,
  extendSubscription,
  cancelSubscription,
  listSubscriptions,
  listSubscriptionsPaginated,
  getSubscription,
  getSubscriptionPlan,
  listSubscriptionPlans,
  verifySubscriptionAccess,
  setPrismaClient as setSubscriptionPrismaClient,
  resetPrismaClient as resetSubscriptionPrismaClient,
} from './subscription';

export type {
  SubscriptionData,
  SubscriptionFilters,
  SubscriptionPage,
  SubscriptionPlanData,
} from './subscription';

export {
  createSubject,
  getSubject,
  updateSubject,
  deleteSubject,
  listSubjects,
  listSubjectsPaginated,
  getChapter,
  getChaptersForSubject,
  listNotes,
  createNote,
  getNote,
  updateNote,
  deleteNote,
  getNotesForChapter,
  getNotesForSubject,
  uploadImage,
  searchNotes,
  setPrismaClient as setContentPrismaClient,
  resetPrismaClient as resetContentPrismaClient,
} from './content';

export type {
  Subject,
  CreateSubjectInput,
  UpdateSubjectInput,
  Chapter,
  Note,
  CreateNoteInput,
  UpdateNoteInput,
  UploadImageResult,
  SearchNotesInput,
  PaginationOptions,
  SubjectListResult,
  NoteSummary,
  NoteListResult,
} from './content';

export {
  createSession,
  getSessionByToken,
  deleteSessionByToken,
  refreshSessionExpiry,
  setPrismaClient as setSessionPrismaClient,
  resetPrismaClient as resetSessionPrismaClient,
} from './session';

export type {
  SessionRecord,
  CreateSessionInput,
  SessionUserType,
} from './session';

export {
  getStudentProfile,
  listStudents,
  searchStudentsByEmail,
  setPrismaClient as setStudentPrismaClient,
  resetPrismaClient as resetStudentPrismaClient,
} from './student';

export type {
  StudentProfile,
  StudentListOptions,
  StudentListResult,
} from './student';

export {
  listUniversitiesPaginated,
  createUniversity,
  getUniversity,
  universityExists,
  updateUniversity,
  deleteUniversity,
  countUniversityDescendants,
  listProgramsPaginated,
  createProgram,
  getProgram,
  programExists,
  updateProgram,
  deleteProgram,
  countProgramDescendants,
  listStreamsPaginated,
  createStream,
  getStream,
  streamExists,
  updateStream,
  deleteStream,
  countStreamDescendants,
  listSemestersPaginated,
  createSemester,
  getSemester,
  semesterExists,
  updateSemester,
  deleteSemester,
  countSemesterDescendants,
  listChaptersPaginated,
  createChapter,
  getChapterById,
  subjectExists,
  updateChapter,
  deleteChapter,
  countChapterDescendants,
  reorderChapters,
  getHierarchyTree,
  setPrismaClient as setHierarchyPrismaClient,
  resetPrismaClient as resetHierarchyPrismaClient,
} from './hierarchy';

export type {
  University,
  Program,
  Stream,
  Semester,
  // `Chapter` and `PaginationOptions` are already exported from ./content, so
  // the hierarchy variants are aliased rather than shadowing them.
  Chapter as HierarchyChapter,
  PaginationOptions as HierarchyPaginationOptions,
  ListResult as HierarchyListResult,
  UniversityDeletionImpact,
  ProgramDeletionImpact,
  StreamDeletionImpact,
  SemesterDeletionImpact,
  ChapterDeletionImpact,
  CreateUniversityInput,
  UpdateUniversityInput,
  CreateProgramInput,
  UpdateProgramInput,
  CreateStreamInput,
  UpdateStreamInput,
  CreateSemesterInput,
  UpdateSemesterInput,
  CreateChapterInput,
  UpdateChapterInput,
  ReorderChaptersInput,
  ReorderChaptersResult,
  HierarchyTree,
  HierarchyTreeProgram,
  HierarchyTreeStream,
  HierarchyTreeSemester,
  HierarchyTreeSubject,
  HierarchyTreeChapter,
} from './hierarchy';

export {
  RESOURCE_MIME_TYPE,
  DEFAULT_MAX_RESOURCE_BYTES,
  ResourceUploadFailure,
  ResourceUploadError,
  resolveMaxResourceBytes,
  resolveStorageRoot,
  resolveResourceFilePath,
  isPdfBuffer,
  assertValidResourceUpload,
  storeResourceFile,
  deleteResourceFile,
  openResourceFile,
  toPublicResourceData,
  createResource,
  getResource,
  getPublishedResource,
  listResourcesPaginated,
  updateResource,
  setResourcePublished,
  deleteResource,
  hasLiveStudentSession,
  toDownloadFilename,
  setPrismaClient as setResourcePrismaClient,
  resetPrismaClient as resetResourcePrismaClient,
} from './resource';

export type {
  ResourceFileHandle,
  ResourceData,
  PublicResourceData,
  CreateResourceInput,
  UpdateResourceInput,
  ResourceFilters,
  ResourcePage,
  DeleteResourceResult,
} from './resource';

export {
  PROGRESS_MIN,
  PROGRESS_MAX,
  DEFAULT_RECENT_LIMIT,
  MAX_RECENT_LIMIT,
  clampProgressPercent,
  clampRecentLimit,
  getNoteContext,
  listBookmarks,
  getBookmark,
  addBookmark,
  removeBookmark,
  getReadingProgress,
  listRecentReadingProgress,
  upsertReadingProgress,
  setPrismaClient as setEngagementPrismaClient,
  resetPrismaClient as resetEngagementPrismaClient,
} from './engagement';

export type {
  NoteContext,
  BookmarkRecord,
  BookmarkWithNote,
  BookmarkListResult,
  ReadingProgressRecord,
  ReadingProgressWithNote,
  AddBookmarkResult,
  // Aliased for the same reason as the hierarchy variant above.
  PaginationOptions as EngagementPaginationOptions,
} from './engagement';

export {
  validatePlanInput,
  assertValidPlanInput,
  getPlan,
  getPlanByCode,
  listPlans,
  listPlansPaginated,
  countPlanSubscriptions,
  createPlan,
  updatePlan,
  deactivatePlan,
  deletePlan,
  PlanValidationError,
  PlanNotFoundError,
  PlanCodeConflictError,
  PlanInUseError,
  setPrismaClient as setPlanPrismaClient,
  resetPrismaClient as resetPlanPrismaClient,
} from './plan';

export type {
  PlanData,
  CreatePlanInput,
  UpdatePlanInput,
  PlanListResult,
  PlanFieldIssue,
} from './plan';

export {
  DEVICE_LIMIT,
  DEVICE_LIMIT_MESSAGE,
} from './device';
