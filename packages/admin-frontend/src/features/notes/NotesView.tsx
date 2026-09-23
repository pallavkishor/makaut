'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { deleteNote, listNotes } from '@/lib/api/notes';
import { getChapter } from '@/lib/api/chapters';
import { formatDateTime } from '@/lib/dates';
import { queryKeys } from '@/lib/queryKeys';
import { SubjectPicker, type ContentSelection } from '@/features/hierarchy/ContentPicker';
import { useContentSelection } from '@/features/hierarchy/useContentSelection';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/Spinner';
import {
  Table,
  TableCard,
  TableScroll,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui/Table';
import type { NoteSummary } from '@/types';

/** Note list with subject filter and deletion (Requirements 6.3, 6.8, 6.9). */
export function NotesView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const chapterId = searchParams.get('chapterId') ?? '';
  const [noteToDelete, setNoteToDelete] = useState<NoteSummary | null>(null);

  const { selection: filter, setSelection: setFilter, resolving } = useContentSelection({
    chapterId,
  });

  const notesQuery = useQuery({
    queryKey: queryKeys.notes.list({ chapterId: chapterId || undefined }),
    queryFn: () => listNotes({ chapterId: chapterId || undefined }),
  });

  // Chapter titles for every chapter that has notes in view, keyed by id.
  const chapterIds = Array.from(new Set((notesQuery.data ?? []).map((note) => note.chapterId)));

  const chapterTitlesQuery = useQuery({
    queryKey: ['notes', 'chapter-titles', chapterIds.slice().sort().join(',')],
    queryFn: async () => {
      const entries = await Promise.all(
        chapterIds.map(async (id) => {
          try {
            const chapter = await getChapter(id);
            return [id, chapter.title] as const;
          } catch {
            return [id, id] as const;
          }
        })
      );
      return new Map(entries);
    },
    enabled: chapterIds.length > 0,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteNote(id),
    onSuccess: async () => {
      setNoteToDelete(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });
    },
  });

  const notes = notesQuery.data ?? [];
  const chapterTitleById = chapterTitlesQuery.data ?? new Map<string, string>();

  const handleFilterChange = (next: ContentSelection) => {
    setFilter(next);
    router.replace(next.chapterId ? `/notes?chapterId=${next.chapterId}` : '/notes');
  };

  const newNoteHref = chapterId ? `/notes/new?chapterId=${chapterId}` : '/notes/new';

  return (
    <>
      <PageHeader
        title="Notes"
        description="Educational content grouped by chapter."
        actions={
          <Button onClick={() => router.push(newNoteHref)}>New note</Button>
        }
      />

      <div className="mb-3">
        {resolving ? (
          <LoadingState label="Locating that chapter…" />
        ) : (
          <SubjectPicker
            value={filter}
            onChange={handleFilterChange}
            filterMode
            includeChapter
            columns={4}
          />
        )}
      </div>

      {notesQuery.isError ? (
        <div className="mb-3">
          <ErrorState
            error={notesQuery.error}
            title="Could not load notes"
            onRetry={() => void notesQuery.refetch()}
          />
        </div>
      ) : null}

      <TableCard>
        <TableScroll>
          <Table caption="Notes">
            <Thead>
              <tr>
                <Th>Title</Th>
                <Th>Chapter</Th>
                <Th>Created</Th>
                <Th>Updated</Th>
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </Thead>
            <Tbody>
              {notes.map((note) => (
                <Tr key={note.id}>
                  <Td className="font-medium text-foreground">
                    <Link
                      href={`/notes/${note.id}`}
                      className="rounded underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
                    >
                      {note.title}
                    </Link>
                  </Td>
                  <Td className="text-muted">
                    {chapterTitleById.get(note.chapterId) ?? note.chapterId}
                  </Td>
                  <Td className="whitespace-nowrap text-muted">
                    {formatDateTime(note.createdAt)}
                  </Td>
                  <Td className="whitespace-nowrap text-muted">
                    {formatDateTime(note.updatedAt)}
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => router.push(`/notes/${note.id}`)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          deleteMutation.reset();
                          setNoteToDelete(note);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableScroll>

        {notesQuery.isPending ? <LoadingState label="Loading notes…" /> : null}

        {!notesQuery.isPending && notes.length === 0 ? (
          <EmptyState
            title="No notes yet"
            description={
              chapterId
                ? 'This chapter has no notes. Create one to get started.'
                : 'Create a note and associate it with a chapter.'
            }
            action={<Button onClick={() => router.push(newNoteHref)}>New note</Button>}
          />
        ) : null}
      </TableCard>

      <ConfirmDialog
        open={noteToDelete !== null}
        title="Delete this note?"
        confirmLabel="Delete note"
        pending={deleteMutation.isPending}
        error={deleteMutation.error}
        onCancel={() => setNoteToDelete(null)}
        onConfirm={() => {
          if (noteToDelete) {
            deleteMutation.mutate(noteToDelete.id);
          }
        }}
      >
        <p className="text-sm text-foreground">
          <span className="font-semibold">{noteToDelete?.title}</span> will be
          permanently removed and will no longer be visible to students.
        </p>
      </ConfirmDialog>
    </>
  );
}
