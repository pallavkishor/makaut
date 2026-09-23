'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import type {
  ChapterNotesResponse,
  DevicesResponse,
  NoteResponse,
  ProgramsResponse,
  RevokeDeviceResponse,
  SaveSelectionResponse,
  SearchFilters,
  SearchResponse,
  SelectionInput,
  SelectionResponse,
  SemesterSubjectsResponse,
  SemestersResponse,
  StreamsResponse,
  SubjectChaptersResponse,
  SubjectResponse,
  SubscriptionsResponse,
  UniversitiesResponse,
} from '@/types/api';

/**
 * React Query hooks for every student endpoint the UI consumes.
 *
 * The catalogue hooks mirror the browse hierarchy
 *   University > Program > Stream > Semester > Subject > Chapter > Note
 * and every one of them is enabled only once the ids it needs are known, so a
 * partially built page never fires a request the backend would reject.
 */

/** Cache keys. Hierarchy keys are nested so a parent invalidation cascades. */
export const queryKeys = {
  universities: ['catalog', 'universities'] as const,
  programs: (universityId?: string) =>
    ['catalog', 'programs', universityId ?? 'all'] as const,
  streams: (programId?: string) =>
    ['catalog', 'streams', programId ?? 'all'] as const,
  semesters: (streamId?: string) =>
    ['catalog', 'semesters', streamId ?? 'all'] as const,
  semesterSubjects: (semesterId: string) =>
    ['catalog', 'semester', semesterId, 'subjects'] as const,
  subjectChapters: (subjectId: string) =>
    ['catalog', 'subject', subjectId, 'chapters'] as const,
  chapterNotes: (chapterId: string) =>
    ['catalog', 'chapter', chapterId, 'notes'] as const,
  selection: ['catalog', 'selection'] as const,
  search: (query: string, filters: SearchFilters, page: number) =>
    ['catalog', 'search', query, filters, page] as const,
  subject: (id: string) => ['subject', id] as const,
  note: (id: string) => ['note', id] as const,
  subscriptions: ['subscriptions'] as const,
  devices: ['devices'] as const,
};

// ---------------------------------------------------------------------------
// Hierarchy browsing (no subscription required down to chapter level)
// ---------------------------------------------------------------------------

/** GET /api/catalog/universities */
export function useUniversities(): UseQueryResult<UniversitiesResponse> {
  const { authRequest, status } = useAuth();

  return useQuery({
    queryKey: queryKeys.universities,
    enabled: status === 'authenticated',
    queryFn: ({ signal }) =>
      authRequest<UniversitiesResponse>('/api/catalog/universities', { signal }),
  });
}

/**
 * Lets a caller keep a query idle even though the student is signed in.
 *
 * The browse pages use this so a shallow level never fetches the lists only a
 * deeper level needs.
 */
export interface QueryToggle {
  enabled?: boolean;
}

/**
 * GET /api/catalog/programs?universityId=
 *
 * Called without a university id it returns every program, which is what a deep
 * link uses to walk back up the hierarchy.
 */
export function usePrograms(
  universityId?: string,
  { enabled = true }: QueryToggle = {}
): UseQueryResult<ProgramsResponse> {
  const { authRequest, status } = useAuth();

  return useQuery({
    queryKey: queryKeys.programs(universityId),
    enabled: enabled && status === 'authenticated',
    queryFn: ({ signal }) =>
      authRequest<ProgramsResponse>('/api/catalog/programs', {
        query: universityId ? { universityId } : undefined,
        signal,
      }),
  });
}

/** GET /api/catalog/streams?programId= */
export function useStreams(
  programId?: string,
  { enabled = true }: QueryToggle = {}
): UseQueryResult<StreamsResponse> {
  const { authRequest, status } = useAuth();

  return useQuery({
    queryKey: queryKeys.streams(programId),
    enabled: enabled && status === 'authenticated',
    queryFn: ({ signal }) =>
      authRequest<StreamsResponse>('/api/catalog/streams', {
        query: programId ? { programId } : undefined,
        signal,
      }),
  });
}

/** GET /api/catalog/semesters?streamId= */
export function useSemesters(
  streamId?: string,
  { enabled = true }: QueryToggle = {}
): UseQueryResult<SemestersResponse> {
  const { authRequest, status } = useAuth();

  return useQuery({
    queryKey: queryKeys.semesters(streamId),
    enabled: enabled && status === 'authenticated',
    queryFn: ({ signal }) =>
      authRequest<SemestersResponse>('/api/catalog/semesters', {
        query: streamId ? { streamId } : undefined,
        signal,
      }),
  });
}

/** GET /api/catalog/semesters/:id/subjects */
export function useSemesterSubjects(
  semesterId: string
): UseQueryResult<SemesterSubjectsResponse> {
  const { authRequest, status } = useAuth();

  return useQuery({
    queryKey: queryKeys.semesterSubjects(semesterId),
    enabled: status === 'authenticated' && semesterId.length > 0,
    queryFn: ({ signal }) =>
      authRequest<SemesterSubjectsResponse>(
        `/api/catalog/semesters/${encodeURIComponent(semesterId)}/subjects`,
        { signal }
      ),
  });
}

/** GET /api/catalog/subjects/:id/chapters. `noteCount` counts published notes. */
export function useSubjectChapters(
  subjectId: string
): UseQueryResult<SubjectChaptersResponse> {
  const { authRequest, status } = useAuth();

  return useQuery({
    queryKey: queryKeys.subjectChapters(subjectId),
    enabled: status === 'authenticated' && subjectId.length > 0,
    queryFn: ({ signal }) =>
      authRequest<SubjectChaptersResponse>(
        `/api/catalog/subjects/${encodeURIComponent(subjectId)}/chapters`,
        { signal }
      ),
  });
}

/**
 * GET /api/catalog/chapters/:id/notes
 *
 * The first paywalled step of the browse flow: fails with 403
 * NO_ACTIVE_SUBSCRIPTION when the account has no active subscription.
 */
export function useChapterNotes(
  chapterId: string
): UseQueryResult<ChapterNotesResponse> {
  const { authRequest, status } = useAuth();

  return useQuery({
    queryKey: queryKeys.chapterNotes(chapterId),
    enabled: status === 'authenticated' && chapterId.length > 0,
    queryFn: ({ signal }) =>
      authRequest<ChapterNotesResponse>(
        `/api/catalog/chapters/${encodeURIComponent(chapterId)}/notes`,
        { signal }
      ),
  });
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/** GET /api/catalog/me/selection */
export function useSelection(): UseQueryResult<SelectionResponse> {
  const { authRequest, status } = useAuth();

  return useQuery({
    queryKey: queryKeys.selection,
    enabled: status === 'authenticated',
    queryFn: ({ signal }) =>
      authRequest<SelectionResponse>('/api/catalog/me/selection', { signal }),
  });
}

/**
 * PUT /api/catalog/me/selection
 *
 * Rejects with an ApiError carrying `details.field` when the chain is
 * inconsistent, so the caller can attach the message to the offending select.
 */
export function useSaveSelection(): UseMutationResult<
  SaveSelectionResponse,
  Error,
  SelectionInput
> {
  const { authRequest } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<SaveSelectionResponse, Error, SelectionInput>({
    mutationFn: (input: SelectionInput) =>
      authRequest<SaveSelectionResponse>('/api/catalog/me/selection', {
        method: 'PUT',
        body: input,
      }),
    onSuccess: (data) => {
      // Write through so the dashboard reflects the save without a refetch
      queryClient.setQueryData<SelectionResponse>(queryKeys.selection, {
        selection: data.selection,
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface CatalogSearchOptions {
  query: string;
  filters?: SearchFilters;
  page?: number;
  pageSize?: number;
}

/**
 * GET /api/catalog/search?q=
 *
 * Stays disabled until there is a non-empty query, because the backend rejects a
 * blank `q` with VALIDATION_ERROR. Requires an active subscription.
 */
export function useCatalogSearch({
  query,
  filters = {},
  page = 1,
  pageSize,
}: CatalogSearchOptions): UseQueryResult<SearchResponse> {
  const { authRequest, status } = useAuth();
  const trimmed = query.trim();

  return useQuery({
    queryKey: queryKeys.search(trimmed, filters, page),
    enabled: status === 'authenticated' && trimmed.length > 0,
    // Keeps the previous page visible while the next one loads
    placeholderData: (previous) => previous,
    queryFn: ({ signal }) =>
      authRequest<SearchResponse>('/api/catalog/search', {
        query: {
          q: trimmed,
          page,
          ...(pageSize ? { pageSize } : {}),
          ...filters,
        },
        signal,
      }),
  });
}

// ---------------------------------------------------------------------------
// Subjects and notes
// ---------------------------------------------------------------------------

/**
 * GET /api/subjects/:id
 *
 * Carries the subject's `semesterId`, which is how a note deep link resolves
 * its place in the hierarchy. Fails with NO_ACTIVE_SUBSCRIPTION (403) when the
 * account is not entitled.
 */
export function useSubject(subjectId: string): UseQueryResult<SubjectResponse> {
  const { authRequest, status } = useAuth();

  return useQuery({
    queryKey: queryKeys.subject(subjectId),
    enabled: status === 'authenticated' && subjectId.length > 0,
    queryFn: ({ signal }) =>
      authRequest<SubjectResponse>(
        `/api/subjects/${encodeURIComponent(subjectId)}`,
        { signal }
      ),
  });
}

/** GET /api/notes/:id - the note body, as Markdown. */
export function useNote(noteId: string): UseQueryResult<NoteResponse> {
  const { authRequest, status } = useAuth();

  return useQuery({
    queryKey: queryKeys.note(noteId),
    enabled: status === 'authenticated' && noteId.length > 0,
    queryFn: ({ signal }) =>
      authRequest<NoteResponse>(`/api/notes/${encodeURIComponent(noteId)}`, {
        signal,
      }),
  });
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

/**
 * GET /api/students/me/subscriptions
 *
 * Account-level subscriptions. Only those granting access right now are
 * returned, so an empty array means the account has no access.
 */
export function useSubscriptions(): UseQueryResult<SubscriptionsResponse> {
  const { authRequest, status } = useAuth();

  return useQuery({
    queryKey: queryKeys.subscriptions,
    enabled: status === 'authenticated',
    queryFn: ({ signal }) =>
      authRequest<SubscriptionsResponse>('/api/students/me/subscriptions', {
        signal,
      }),
  });
}

/** Devices registered against the account. */
export function useDevices(): UseQueryResult<DevicesResponse> {
  const { authRequest, status } = useAuth();

  return useQuery({
    queryKey: queryKeys.devices,
    enabled: status === 'authenticated',
    queryFn: ({ signal }) =>
      authRequest<DevicesResponse>('/api/students/me/devices', { signal }),
  });
}

/** Revokes a registered device and refreshes the device list. */
export function useRevokeDevice(): UseMutationResult<
  RevokeDeviceResponse,
  Error,
  string
> {
  const { authRequest } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<RevokeDeviceResponse, Error, string>({
    mutationFn: (deviceId: string) =>
      authRequest<RevokeDeviceResponse>(
        `/api/students/me/devices/${encodeURIComponent(deviceId)}`,
        { method: 'DELETE' }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.devices });
    },
  });
}
