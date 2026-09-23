'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { CascadeDeleteDialog } from '@/features/hierarchy/CascadeDeleteDialog';
import { HierarchyPicker, type HierarchyPath } from '@/features/hierarchy/ContentPicker';
import { useContentSelection } from '@/features/hierarchy/useContentSelection';
import {
  createSubject,
  deleteSubject,
  listSubjects,
  updateSubject,
} from '@/lib/api/subjects';
import { formatDateTime } from '@/lib/dates';
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
import {
  Table,
  TableScroll,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui/Table';
import type { Subject } from '@/types';

/**
 * Subject management under one semester.
 *
 * A subject now requires a `semesterId`, so the semester has to be picked before
 * anything can be created - the create form stays disabled until then rather
 * than failing on submit. `code` and `position` are optional; position controls
 * the order students see.
 */
export function SubjectsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const { selection, setSelection, resolving } = useContentSelection({
    semesterId: searchParams.get('semesterId') ?? '',
  });

  const semesterId = selection.semesterId;

  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [errors, setErrors] = useState<{ name?: string; semesterId?: string }>({});
  const [editing, setEditing] = useState<Subject | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [editErrors, setEditErrors] = useState<{ name?: string; position?: string }>({});
  const [deleting, setDeleting] = useState<Subject | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const subjectsQuery = useQuery({
    queryKey: queryKeys.subjects.list(semesterId),
    queryFn: () => listSubjects(semesterId),
    enabled: Boolean(semesterId),
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.subjects.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.chapters.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.all }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (input: { name: string; code: string | null }) =>
      createSubject({ semesterId, name: input.name, code: input.code }),
    onSuccess: async () => {
      setNewName('');
      setNewCode('');
      await invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (variables: {
      id: string;
      name: string;
      code: string | null;
      position?: number;
    }) =>
      updateSubject(variables.id, {
        name: variables.name,
        code: variables.code,
        ...(variables.position === undefined ? {} : { position: variables.position }),
      }),
    onSuccess: async () => {
      setEditing(null);
      await invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSubject(id),
    onSuccess: async (deletedNoteCount) => {
      const name = deleting?.name ?? 'Subject';
      setDeleting(null);
      setNotice(
        `Deleted ${name}. The server removed ${deletedNoteCount.toLocaleString('en-IN')} note${
          deletedNoteCount === 1 ? '' : 's'
        } with it.`
      );
      await invalidate();
    },
  });

  const subjects = subjectsQuery.data ?? [];

  const onPathChange = (path: HierarchyPath) => {
    setNotice(null);
    setSelection({ ...path, subjectId: '', chapterId: '' });
    router.replace(
      path.semesterId ? `/subjects?semesterId=${path.semesterId}` : '/subjects'
    );
  };

  const submitCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newName.trim();
    const nextErrors: typeof errors = {};

    if (!semesterId) {
      nextErrors.semesterId = 'Choose the semester this subject belongs to';
    }

    if (!name) {
      nextErrors.name = 'Subject name is required';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    createMutation.mutate({ name, code: newCode.trim() || null });
  };

  const submitEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editing) {
      return;
    }

    const name = editName.trim();
    const nextErrors: typeof editErrors = {};

    if (!name) {
      nextErrors.name = 'Subject name is required';
    }

    const trimmedPosition = editPosition.trim();
    const position = trimmedPosition === '' ? undefined : Number(trimmedPosition);

    if (position !== undefined && (!Number.isInteger(position) || position < 0)) {
      nextErrors.position = 'Position must be a whole number, 0 or greater';
    }

    setEditErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    updateMutation.mutate({
      id: editing.id,
      name,
      code: editCode.trim() || null,
      position,
    });
  };

  return (
    <>
      <PageHeader
        title="Subjects"
        description="Subjects belong to a semester. Notes hang off their chapters, not off the subject itself."
        actions={
          <Link
            href="/hierarchy"
            className="rounded text-sm font-medium text-primary-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
          >
            Manage hierarchy →
          </Link>
        }
      />

      <div className="mb-4">
        <Panel
          title="Semester"
          description="Subjects are listed and created inside the selected semester"
        >
          <div className="px-4 py-4">
            {resolving ? (
              <LoadingState label="Locating that semester…" />
            ) : (
              <HierarchyPicker
                value={selection}
                errors={{ semesterId: errors.semesterId }}
                onChange={onPathChange}
              />
            )}
          </div>
        </Panel>
      </div>

      <form
        onSubmit={submitCreate}
        className="mb-4 rounded-lg border border-border bg-background-surface p-4 shadow-sm"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <TextField
              label="New subject name"
              value={newName}
              required
              disabled={!semesterId}
              placeholder="e.g. Organic Chemistry"
              error={errors.name}
              onChange={(event) => setNewName(event.target.value)}
            />
          </div>
          <div className="w-40">
            <TextField
              label="Code (optional)"
              value={newCode}
              disabled={!semesterId}
              placeholder="e.g. CH301"
              onChange={(event) => setNewCode(event.target.value)}
            />
          </div>
          <Button type="submit" loading={createMutation.isPending} disabled={!semesterId}>
            Add subject
          </Button>
        </div>
        {!semesterId ? (
          <p className="mt-2 text-xs text-muted">
            Pick a semester above first — every subject belongs to one.
          </p>
        ) : null}
        <div className="mt-3 space-y-2">
          <FormError error={createMutation.error} />
          {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
        </div>
      </form>

      {subjectsQuery.isError ? (
        <div className="mb-3">
          <ErrorState
            error={subjectsQuery.error}
            title="Could not load subjects"
            onRetry={() => void subjectsQuery.refetch()}
          />
        </div>
      ) : null}

      <Panel title="Subjects" description={`${subjects.length} in this semester`}>
        <TableScroll>
          <Table caption="Subjects">
            <Thead>
              <tr>
                <Th className="w-16 text-right">Pos</Th>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Updated</Th>
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </Thead>
            <Tbody>
              {subjects.map((subject) => (
                <Tr key={subject.id}>
                  <Td className="text-right tabular-nums text-muted">
                    {subject.position}
                  </Td>
                  <Td className="font-mono text-xs text-muted">
                    {subject.code ?? '—'}
                  </Td>
                  <Td className="font-medium text-foreground">{subject.name}</Td>
                  <Td className="whitespace-nowrap text-muted">
                    {formatDateTime(subject.updatedAt)}
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/chapters?subjectId=${subject.id}`}
                        className="rounded text-sm font-medium text-primary-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
                      >
                        Chapters
                      </Link>
                      <Link
                        href={`/resources?subjectId=${subject.id}`}
                        className="rounded text-sm font-medium text-primary-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
                      >
                        PDFs
                      </Link>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          updateMutation.reset();
                          setEditErrors({});
                          setEditName(subject.name);
                          setEditCode(subject.code ?? '');
                          setEditPosition(String(subject.position));
                          setEditing(subject);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          deleteMutation.reset();
                          setDeleting(subject);
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

        {subjectsQuery.isPending && semesterId ? (
          <LoadingState label="Loading subjects…" />
        ) : null}

        {!semesterId ? (
          <EmptyState
            title="No semester selected"
            description="Choose a university, program, stream and semester above to see its subjects."
          />
        ) : null}

        {semesterId && !subjectsQuery.isPending && subjects.length === 0 ? (
          <EmptyState
            title="No subjects in this semester"
            description="Create one above, then add chapters to it."
          />
        ) : null}
      </Panel>

      <Modal
        open={editing !== null}
        title="Edit subject"
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
              form="edit-subject-form"
              loading={updateMutation.isPending}
            >
              Save changes
            </Button>
          </>
        }
      >
        <form id="edit-subject-form" onSubmit={submitEdit} className="space-y-3">
          <TextField
            label="Subject name"
            value={editName}
            required
            error={editErrors.name}
            onChange={(event) => setEditName(event.target.value)}
          />
          <TextField
            label="Code"
            value={editCode}
            hint="Leave blank to clear it."
            onChange={(event) => setEditCode(event.target.value)}
          />
          <TextField
            label="Position"
            value={editPosition}
            inputMode="numeric"
            hint="Lower numbers appear first for students."
            error={editErrors.position}
            onChange={(event) => setEditPosition(event.target.value)}
          />
          <p className="text-xs text-muted">
            A subject cannot be moved to another semester from here — the update
            endpoint does not accept a semester.
          </p>
          <FormError error={updateMutation.error} />
        </form>
      </Modal>

      <CascadeDeleteDialog
        target={
          deleting ? { level: 'subject', id: deleting.id, name: deleting.name } : null
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
