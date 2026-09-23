'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CascadeDeleteDialog } from '@/features/hierarchy/CascadeDeleteDialog';
import { SubjectPicker } from '@/features/hierarchy/ContentPicker';
import { useContentSelection } from '@/features/hierarchy/useContentSelection';
import {
  createChapter,
  deleteChapter,
  listChapters,
  reorderChapters,
  updateChapter,
} from '@/lib/api/chapters';
import { describeDeletedCounts } from '@/lib/deletionImpact';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import {
  EmptyState,
  ErrorState,
  FormError,
  SuccessNotice,
} from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { PageHeader, Panel } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/Spinner';
import type { Chapter } from '@/types';

/**
 * Chapter management for one subject, including ordering.
 *
 * Order is edited locally and saved in one `PATCH /chapters/reorder` call, which
 * rewrites every position in a single transaction. Moves are available both by
 * dragging and by the up/down buttons - the buttons are the accessible path, and
 * they are the faster one when a chapter has to travel a long way.
 */
export function ChaptersView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const subjectIdParam = searchParams.get('subjectId') ?? '';

  const { selection, setSelection, resolving } = useContentSelection({
    subjectId: subjectIdParam,
  });

  const subjectId = selection.subjectId;

  const [order, setOrder] = useState<Chapter[]>([]);
  const [dirty, setDirty] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [titleError, setTitleError] = useState<string | undefined>();
  const [editing, setEditing] = useState<Chapter | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editError, setEditError] = useState<string | undefined>();
  const [deleting, setDeleting] = useState<Chapter | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const chaptersQuery = useQuery({
    queryKey: queryKeys.chapters.list(subjectId),
    queryFn: () => listChapters(subjectId),
    enabled: Boolean(subjectId),
  });

  // Server order is the source of truth until the admin starts moving rows.
  useEffect(() => {
    if (chaptersQuery.data && !dirty) {
      setOrder(chaptersQuery.data);
    }
  }, [chaptersQuery.data, dirty]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.chapters.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.all }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (title: string) => createChapter({ subjectId, title }),
    onSuccess: async () => {
      setNewTitle('');
      setDirty(false);
      await invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (variables: { id: string; title: string }) =>
      updateChapter(variables.id, { title: variables.title }),
    onSuccess: async () => {
      setEditing(null);
      await invalidate();
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => reorderChapters(subjectId, orderedIds),
    onSuccess: async (chapters) => {
      setDirty(false);
      setOrder(chapters);
      setNotice('Chapter order saved.');
      await invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteChapter(id),
    onSuccess: async (counts) => {
      const title = deleting?.title ?? 'Chapter';
      setDeleting(null);
      setDirty(false);
      setNotice(`Deleted ${title}, along with ${describeDeletedCounts(counts)}.`);
      await invalidate();
    },
  });

  const move = (id: string, delta: number) => {
    setOrder((current) => {
      const index = current.findIndex((chapter) => chapter.id === id);
      const target = index + delta;

      if (index < 0 || target < 0 || target >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];

      return next;
    });
    setDirty(true);
    setNotice(null);
  };

  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      return;
    }

    setOrder((current) => {
      const from = current.findIndex((chapter) => chapter.id === dragId);
      const to = current.findIndex((chapter) => chapter.id === targetId);

      if (from < 0 || to < 0) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);

      return next;
    });
    setDirty(true);
    setNotice(null);
    setDragId(null);
  };

  const submitCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newTitle.trim();

    if (!title) {
      setTitleError('Chapter title is required');
      return;
    }

    setTitleError(undefined);
    createMutation.mutate(title);
  };

  const submitEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = editTitle.trim();

    if (!title) {
      setEditError('Chapter title is required');
      return;
    }

    if (!editing) {
      return;
    }

    setEditError(undefined);
    updateMutation.mutate({ id: editing.id, title });
  };

  return (
    <>
      <PageHeader
        title="Chapters"
        description="Chapters sit between a subject and its notes, and their order is what students see."
      />

      <div className="mb-4">
        <Panel title="Subject" description="Pick the subject whose chapters you want to manage">
          <div className="px-4 py-4">
            {resolving ? (
              <LoadingState label="Locating that subject…" />
            ) : (
              <SubjectPicker
                value={selection}
                onChange={(next) => {
                  setDirty(false);
                  setNotice(null);
                  setSelection(next);
                  router.replace(
                    next.subjectId ? `/chapters?subjectId=${next.subjectId}` : '/chapters'
                  );
                }}
              />
            )}
          </div>
        </Panel>
      </div>

      {!subjectId ? (
        <EmptyState
          title="No subject selected"
          description="Choose a university, program, stream, semester and subject above."
        />
      ) : (
        <Panel
          title="Chapters"
          description={`${order.length} in this subject`}
          actions={
            dirty ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={reorderMutation.isPending}
                  onClick={() => {
                    setDirty(false);
                    setOrder(chaptersQuery.data ?? []);
                  }}
                >
                  Revert
                </Button>
                <Button
                  size="sm"
                  loading={reorderMutation.isPending}
                  onClick={() =>
                    reorderMutation.mutate(order.map((chapter) => chapter.id))
                  }
                >
                  Save order
                </Button>
              </>
            ) : null
          }
        >
          <form onSubmit={submitCreate} className="border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[18rem] flex-1">
                <TextField
                  label="New chapter title"
                  value={newTitle}
                  required
                  placeholder="e.g. Thermodynamics basics"
                  error={titleError}
                  onChange={(event) => setNewTitle(event.target.value)}
                />
              </div>
              <Button type="submit" loading={createMutation.isPending}>
                Add chapter
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              <FormError error={createMutation.error} />
              <FormError error={reorderMutation.error} />
              {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
              {dirty ? (
                <p className="text-xs font-medium text-amber-700">
                  Order changed but not saved yet.
                </p>
              ) : null}
            </div>
          </form>

          {chaptersQuery.isError ? (
            <div className="px-4 py-3">
              <ErrorState
                error={chaptersQuery.error}
                title="Could not load chapters"
                onRetry={() => void chaptersQuery.refetch()}
              />
            </div>
          ) : null}

          {chaptersQuery.isPending ? <LoadingState label="Loading chapters…" /> : null}

          <ol className="divide-y divide-border-subtle">
            {order.map((chapter, index) => (
              <li
                key={chapter.id}
                draggable
                onDragStart={() => setDragId(chapter.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => dropOn(chapter.id)}
                className={`flex items-center gap-2 px-3 py-1.5 ${
                  dragId === chapter.id ? 'bg-primary-50' : 'hover:bg-primary-50/40'
                }`}
              >
                <span
                  aria-hidden="true"
                  title="Drag to reorder"
                  className="cursor-grab select-none px-1 text-muted"
                >
                  ⠿
                </span>
                <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {chapter.title}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={index === 0}
                    aria-label={`Move ${chapter.title} up`}
                    onClick={() => move(chapter.id, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={index === order.length - 1}
                    aria-label={`Move ${chapter.title} down`}
                    onClick={() => move(chapter.id, 1)}
                  >
                    ↓
                  </Button>
                  <Link
                    href={`/notes?chapterId=${chapter.id}`}
                    className="rounded px-1.5 text-xs font-medium text-primary-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
                  >
                    Notes
                  </Link>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      updateMutation.reset();
                      setEditError(undefined);
                      setEditTitle(chapter.title);
                      setEditing(chapter);
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      deleteMutation.reset();
                      setDeleting(chapter);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ol>

          {!chaptersQuery.isPending && order.length === 0 ? (
            <EmptyState
              title="No chapters yet"
              description="Add the first chapter above. Notes are attached to chapters, not to the subject."
            />
          ) : null}
        </Panel>
      )}

      <Modal
        open={editing !== null}
        title="Rename chapter"
        size="sm"
        dismissible={!updateMutation.isPending}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setEditing(null)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="rename-chapter-form"
              loading={updateMutation.isPending}
            >
              Save
            </Button>
          </>
        }
      >
        <form id="rename-chapter-form" onSubmit={submitEdit} className="space-y-3">
          <TextField
            label="Chapter title"
            value={editTitle}
            required
            error={editError}
            onChange={(event) => setEditTitle(event.target.value)}
          />
          <FormError error={updateMutation.error} />
        </form>
      </Modal>

      <CascadeDeleteDialog
        target={
          deleting
            ? { level: 'chapter', id: deleting.id, name: deleting.title }
            : null
        }
        pending={deleteMutation.isPending}
        error={deleteMutation.error}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            deleteMutation.mutate(deleting.id);
          }
        }}
      />
    </>
  );
}
