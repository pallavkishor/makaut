'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { listChapters } from '@/lib/api/chapters';
import { getHierarchyTree } from '@/lib/api/hierarchy';
import { countNotes } from '@/lib/api/notes';
import { countResources } from '@/lib/api/resources';
import {
  countContent,
  impactLines,
  scopeFromTree,
  type DeletionImpact,
} from '@/lib/deletionImpact';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Confirmation for any delete that cascades.
 *
 * The dialog refuses to be vague: it loads the actual number of programs,
 * streams, semesters, subjects, chapters, notes and PDFs that will go, and shows
 * them before the administrator commits. Deleting a university really can take
 * hundreds of notes with it, so the counts - not an adjective - are what the
 * admin reads.
 *
 * For the two widest levels the name has to be typed out as well, because
 * "Delete" on its own is too easy to click.
 */

export type DeleteTarget =
  | {
      level: 'university' | 'program' | 'stream' | 'semester';
      id: string;
      name: string;
      /** The tree request is rooted at a university, so the caller supplies it. */
      universityId: string;
    }
  | { level: 'subject' | 'chapter'; id: string; name: string };

/** Narrows to the branch of DeleteTarget that carries a universityId. */
function hasUniversityScope(
  target: DeleteTarget
): target is Extract<DeleteTarget, { universityId: string }> {
  return target.level !== 'chapter' && target.level !== 'subject';
}

const LEVEL_NOUNS: Record<DeleteTarget['level'], string> = {
  university: 'university',
  program: 'program',
  stream: 'stream',
  semester: 'semester',
  subject: 'subject',
  chapter: 'chapter',
};

/** Levels where a misclick is expensive enough to warrant typing the name. */
const REQUIRES_TYPED_NAME: DeleteTarget['level'][] = ['university', 'program'];

const impactCounters = {
  countNotesForSubject: (subjectId: string) => countNotes({ subjectId }),
  countResourcesForSubject: (subjectId: string) => countResources({ subjectId }),
  countResourcesForChapter: (chapterId: string) => countResources({ chapterId }),
};

async function loadImpact(target: DeleteTarget): Promise<DeletionImpact> {
  if (target.level === 'chapter') {
    const [notes, resources] = await Promise.all([
      countNotes({ chapterId: target.id }),
      countResources({ chapterId: target.id }),
    ]);

    return { notes, resources, notesExact: true, resourcesExact: true };
  }

  if (target.level === 'subject') {
    const chapters = await listChapters(target.id);
    const [notes, subjectResources] = await Promise.all([
      countNotes({ subjectId: target.id }),
      countResources({ subjectId: target.id }),
    ]);

    const chapterResources = await Promise.all(
      chapters.map((chapter) => countResources({ chapterId: chapter.id }))
    );

    return {
      chapters: chapters.length,
      notes,
      resources: subjectResources + chapterResources.reduce((a, b) => a + b, 0),
      notesExact: true,
      resourcesExact: true,
    };
  }

  if (!hasUniversityScope(target)) {
    throw new Error(`Unsupported delete target level: ${target.level}`);
  }

  const tree = await getHierarchyTree(target.universityId);
  const scope = scopeFromTree(tree, { level: target.level, id: target.id });

  if (!scope) {
    throw new Error('This record is no longer part of the selected university.');
  }

  return countContent(scope, impactCounters);
}

export function CascadeDeleteDialog({
  target,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  /** Null closes the dialog. */
  target: DeleteTarget | null;
  pending: boolean;
  error: unknown;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typedName, setTypedName] = useState('');

  useEffect(() => {
    setTypedName('');
  }, [target?.id]);

  const impactQuery = useQuery({
    queryKey: ['deletion-impact', target?.level, target?.id],
    queryFn: () => loadImpact(target as DeleteTarget),
    enabled: target !== null,
    // Counts are only meaningful at the moment of asking.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  if (!target) {
    return null;
  }

  const noun = LEVEL_NOUNS[target.level];
  const impact = impactQuery.data;
  const needsTypedName = REQUIRES_TYPED_NAME.includes(target.level);
  const nameMatches = typedName.trim() === target.name.trim();
  const destroysContent = Boolean(
    impact && ((impact.notes ?? 0) > 0 || (impact.resources ?? 0) > 0)
  );

  const blocked =
    pending ||
    impactQuery.isPending ||
    (needsTypedName && destroysContent && !nameMatches);

  const lines = impact ? impactLines(impact) : [];
  const approximate = impact
    ? !impact.notesExact || !impact.resourcesExact
    : false;

  return (
    <Modal
      open
      title={`Delete this ${noun}?`}
      size="md"
      dismissible={!pending}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            Keep it
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={pending} disabled={blocked}>
            {impact && destroysContent
              ? `Delete ${noun} and ${(impact.notes ?? 0).toLocaleString('en-IN')} notes`
              : `Delete ${noun}`}
          </Button>
        </>
      }
    >
      <p className="text-sm text-foreground">
        <span className="font-semibold">{target.name}</span> will be removed
        permanently.
      </p>

      {impactQuery.isPending ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-3.5 w-3.5" />
          Working out exactly what this will delete…
        </p>
      ) : null}

      {impactQuery.isError ? (
        <div className="mt-3">
          <FormError error={impactQuery.error} />
          <p className="mt-2 text-xs text-muted">
            The cascade could not be measured, so this delete is blocked. Try again.
          </p>
        </div>
      ) : null}

      {impact ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-sm font-semibold text-red-800">
            {destroysContent
              ? 'This will also delete content students are using:'
              : 'This will also delete:'}
          </p>
          <ul className="mt-1.5 space-y-0.5 text-sm text-red-700">
            {lines.map((line) => (
              <li key={line} className="tabular-nums">
                {line}
              </li>
            ))}
          </ul>
          {approximate ? (
            <p className="mt-2 text-xs text-red-700">
              This branch is large enough that the note and PDF figures are a
              minimum, not the full total. The real numbers are at least these.
            </p>
          ) : null}
          <p className="mt-2 text-xs font-medium text-red-800">
            There is no undo, and no export.
          </p>
        </div>
      ) : null}

      {needsTypedName && destroysContent ? (
        <div className="mt-3">
          <TextField
            label={`Type "${target.name}" to confirm`}
            value={typedName}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setTypedName(event.target.value)}
          />
        </div>
      ) : null}

      {error ? (
        <div className="mt-3">
          <FormError error={error} />
        </div>
      ) : null}
    </Modal>
  );
}
