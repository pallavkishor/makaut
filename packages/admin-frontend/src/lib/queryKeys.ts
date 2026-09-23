import type { ResourceFilters } from './api/resources';
import type { SubscriptionFilters } from './api/subscriptions';

/** Centralised React Query cache keys so invalidation stays consistent. */
export const queryKeys = {
  students: {
    all: ['students'] as const,
    list: (page: number, pageSize: number) =>
      ['students', 'list', page, pageSize] as const,
    search: (email: string) => ['students', 'search', email] as const,
    detail: (id: string) => ['students', 'detail', id] as const,
    devices: (id: string) => ['students', 'devices', id] as const,
  },
  universities: {
    all: ['universities'] as const,
    list: () => ['universities', 'list'] as const,
  },
  programs: {
    all: ['programs'] as const,
    list: (universityId?: string) =>
      ['programs', 'list', universityId ?? 'all'] as const,
  },
  streams: {
    all: ['streams'] as const,
    list: (programId?: string) => ['streams', 'list', programId ?? 'all'] as const,
  },
  semesters: {
    all: ['semesters'] as const,
    list: (streamId?: string) => ['semesters', 'list', streamId ?? 'all'] as const,
  },
  hierarchy: {
    all: ['hierarchy'] as const,
    tree: (universityId: string) => ['hierarchy', 'tree', universityId] as const,
  },
  subjects: {
    all: ['subjects'] as const,
    list: (semesterId?: string) =>
      ['subjects', 'list', semesterId ?? 'all'] as const,
    detail: (id: string) => ['subjects', 'detail', id] as const,
  },
  chapters: {
    all: ['chapters'] as const,
    list: (subjectId?: string) => ['chapters', 'list', subjectId ?? 'all'] as const,
    detail: (id: string) => ['chapters', 'detail', id] as const,
  },
  notes: {
    all: ['notes'] as const,
    list: (filters: { subjectId?: string; chapterId?: string }) =>
      [
        'notes',
        'list',
        filters.subjectId ?? 'any',
        filters.chapterId ?? 'any',
      ] as const,
    detail: (id: string) => ['notes', 'detail', id] as const,
  },
  resources: {
    all: ['resources'] as const,
    list: (filters: ResourceFilters, page: number) =>
      [
        'resources',
        'list',
        filters.subjectId ?? 'any',
        filters.chapterId ?? 'any',
        filters.resourceType ?? 'any',
        filters.publishedOnly ? 'published' : 'any',
        page,
      ] as const,
    detail: (id: string) => ['resources', 'detail', id] as const,
  },
  plans: {
    all: ['plans'] as const,
    list: (activeOnly: boolean) => ['plans', 'list', activeOnly] as const,
    detail: (id: string) => ['plans', 'detail', id] as const,
  },
  subscriptions: {
    all: ['subscriptions'] as const,
    list: (filters: SubscriptionFilters, page: number) =>
      [
        'subscriptions',
        'list',
        filters.studentId ?? 'any',
        filters.planId ?? 'any',
        filters.status ?? 'any',
        page,
      ] as const,
  },
} as const;
