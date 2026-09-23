'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { EMPTY_SELECTION, type ContentSelection } from './ContentPicker';
import { getChapter } from '@/lib/api/chapters';
import { resolvePathFromSemester } from '@/lib/api/hierarchy';
import { getSubject } from '@/lib/api/subjects';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Holds a content selection and back-fills the levels above a deep link.
 *
 * Links elsewhere in the panel name only the leaf - `?subjectId=` from the tree,
 * `?semesterId=` from the hierarchy columns - but the cascading pickers need the
 * university, program and stream selected too. This resolves them once, then
 * leaves the selection under the user's control.
 */
export function useContentSelection(initial: {
  subjectId?: string;
  chapterId?: string;
  semesterId?: string;
}): {
  selection: ContentSelection;
  setSelection: (next: ContentSelection) => void;
  resolving: boolean;
} {
  const [selection, setSelection] = useState<ContentSelection>({
    ...EMPTY_SELECTION,
    semesterId: initial.semesterId ?? '',
    subjectId: initial.subjectId ?? '',
    chapterId: initial.chapterId ?? '',
  });

  // Only resolve while the path is still incomplete; once the user starts
  // changing the pickers, their choices win.
  const unresolved = Boolean(
    (initial.subjectId || initial.semesterId || initial.chapterId) &&
      !selection.universityId
  );

  // A chapter-only deep link (e.g. `?chapterId=`) has to climb one level
  // further than a subject-only one, to find the subject it belongs to.
  const chapterQuery = useQuery({
    queryKey: queryKeys.chapters.detail(initial.chapterId ?? ''),
    queryFn: () => getChapter(initial.chapterId as string),
    enabled: unresolved && Boolean(initial.chapterId) && !initial.subjectId,
  });

  const subjectId = initial.subjectId || chapterQuery.data?.subjectId || '';

  const subjectQuery = useQuery({
    queryKey: queryKeys.subjects.detail(subjectId),
    queryFn: () => getSubject(subjectId),
    enabled: unresolved && Boolean(subjectId),
  });

  const semesterId =
    subjectQuery.data?.semesterId ?? initial.semesterId ?? '';

  const pathQuery = useQuery({
    queryKey: ['hierarchy', 'path', semesterId],
    queryFn: () => resolvePathFromSemester(semesterId),
    enabled: unresolved && Boolean(semesterId),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const path = pathQuery.data;

    if (!path) {
      return;
    }

    setSelection((previous) =>
      previous.universityId
        ? previous
        : {
            ...path,
            subjectId: previous.subjectId,
            chapterId: previous.chapterId,
          }
    );
  }, [pathQuery.data]);

  return {
    selection,
    setSelection,
    resolving:
      unresolved &&
      (chapterQuery.isPending || subjectQuery.isPending || pathQuery.isPending),
  };
}
