'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { CascadeDeleteDialog } from './CascadeDeleteDialog';
import { semesterLabel } from './ContentPicker';
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
import { LoadingState } from '@/components/ui/Spinner';
import type { DeletedCounts, Semester } from '@/types';

/**
 * The four hierarchy levels as selectable columns.
 *
 * Picking a row in one column loads the next, which is how an admin walks down
 * to the semester they want without leaving the page. Every column carries its
 * own create field, rename dialog and cascade-aware delete.
 */

interface ColumnShellProps {
  title: string;
  /** Shown instead of the list when there is no parent selected yet. */
  waitingFor?: string;
  count: number;
  children: ReactNode;
  form: ReactNode;
  notice?: string | null;
  onDismissNotice?: () => void;
}

function ColumnShell({
  title,
  waitingFor,
  count,
  children,
  form,
  notice,
  onDismissNotice,
}: ColumnShellProps) {
  return (
    <section className="flex min-h-[18rem] flex-col overflow-hidden rounded-lg border border-border bg-background-surface shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="text-xs tabular-nums text-muted">{count}</span>
      </div>

      {notice ? (
        <div className="border-b border-border px-3 py-2">
          <SuccessNotice>
            <span className="flex items-start justify-between gap-2">
              <span>{notice}</span>
              {onDismissNotice ? (
                <button
                  type="button"
                  onClick={onDismissNotice}
                  className="shrink-0 rounded text-xs font-medium underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
                >
                  Dismiss
                </button>
              ) : null}
            </span>
          </SuccessNotice>
        </div>
      ) : null}

      {waitingFor ? (
        <p className="px-3 py-6 text-center text-xs text-muted">{waitingFor}</p>
      ) : (
        <>
          <div className="border-b border-border px-3 py-2">{form}</div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </>
      )}
    </section>
  );
}

interface RowProps {
  label: string;
  sublabel?: string;
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function Row({
  label,
  sublabel,
  selected,
  selectable,
  onSelect,
  onEdit,
  onDelete,
}: RowProps) {
  return (
    <div
      className={`flex items-center gap-1 border-b border-border-subtle px-2 py-1 last:border-b-0 ${
        selected ? 'bg-primary-50' : 'hover:bg-primary-50/40'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        disabled={!selectable}
        className="min-w-0 flex-1 rounded px-1 py-1 text-left text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700 disabled:cursor-default"
      >
        <span className={`block truncate ${selected ? 'font-semibold' : ''}`}>
          {label}
        </span>
        {sublabel ? (
          <span className="block truncate text-xs text-muted">{sublabel}</span>
        ) : null}
      </button>
      <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Rename ${label}`}>
        Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-red-700 hover:bg-red-50"
        onClick={onDelete}
        aria-label={`Delete ${label}`}
      >
        Delete
      </Button>
    </div>
  );
}

/**
 * Column for a level whose only editable field is a name: university, program,
 * stream. `name` is required and capped at 255 characters server-side.
 */
export function NameLevelColumn({
  title,
  noun,
  level,
  queryKey,
  parentId,
  waitingFor,
  universityId,
  selectedId,
  onSelect,
  list,
  create,
  update,
  remove,
  invalidate,
}: {
  title: string;
  noun: string;
  level: 'university' | 'program' | 'stream';
  queryKey: QueryKey;
  /** Null when a parent must be chosen first. */
  parentId: string | null;
  waitingFor: string;
  universityId: string;
  selectedId: string;
  onSelect: (id: string) => void;
  list: () => Promise<Array<{ id: string; name: string }>>;
  create: (name: string) => Promise<unknown>;
  update: (id: string, name: string) => Promise<unknown>;
  remove: (id: string) => Promise<DeletedCounts>;
  invalidate: () => Promise<void>;
}) {
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState<string | undefined>();
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rowsQuery = useQuery({
    queryKey,
    queryFn: list,
    enabled: parentId !== null,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => create(name),
    onSuccess: async () => {
      setNewName('');
      await invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (variables: { id: string; name: string }) =>
      update(variables.id, variables.name),
    onSuccess: async () => {
      setEditing(null);
      await invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove(id),
    onSuccess: async (counts, id) => {
      const name = deleting?.name ?? noun;
      setDeleting(null);
      setNotice(`Deleted ${name}, along with ${describeDeletedCounts(counts)}.`);

      if (selectedId === id) {
        onSelect('');
      }

      await invalidate();
    },
  });

  const rows = rowsQuery.data ?? [];

  const submitCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newName.trim();

    if (!name) {
      setNameError(`${noun} name is required`);
      return;
    }

    setNameError(undefined);
    createMutation.mutate(name);
  };

  const submitEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = editName.trim();

    if (!name) {
      setEditError(`${noun} name is required`);
      return;
    }

    if (!editing) {
      return;
    }

    setEditError(undefined);
    updateMutation.mutate({ id: editing.id, name });
  };

  return (
    <>
      <ColumnShell
        title={title}
        count={rows.length}
        waitingFor={parentId === null ? waitingFor : undefined}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
        form={
          <form onSubmit={submitCreate} className="space-y-2">
            <TextField
              label={`New ${noun}`}
              value={newName}
              required
              placeholder={`${noun} name`}
              error={nameError}
              onChange={(event) => setNewName(event.target.value)}
            />
            <div className="flex items-center justify-between gap-2">
              <Button type="submit" size="sm" loading={createMutation.isPending}>
                Add {noun}
              </Button>
            </div>
            <FormError error={createMutation.error} />
          </form>
        }
      >
        {rowsQuery.isError ? (
          <div className="p-3">
            <ErrorState
              error={rowsQuery.error}
              title={`Could not load ${title.toLowerCase()}`}
              onRetry={() => void rowsQuery.refetch()}
            />
          </div>
        ) : null}

        {rowsQuery.isPending && parentId !== null ? (
          <LoadingState label={`Loading ${title.toLowerCase()}…`} />
        ) : null}

        {rows.map((row) => (
          <Row
            key={row.id}
            label={row.name}
            selected={row.id === selectedId}
            selectable
            onSelect={() => onSelect(row.id === selectedId ? '' : row.id)}
            onEdit={() => {
              updateMutation.reset();
              setEditError(undefined);
              setEditName(row.name);
              setEditing(row);
            }}
            onDelete={() => {
              deleteMutation.reset();
              setDeleting(row);
            }}
          />
        ))}

        {!rowsQuery.isPending && rows.length === 0 && parentId !== null ? (
          <EmptyState title={`No ${title.toLowerCase()} yet`} />
        ) : null}
      </ColumnShell>

      <Modal
        open={editing !== null}
        title={`Rename ${noun}`}
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
              form={`rename-${level}-form`}
              loading={updateMutation.isPending}
            >
              Save
            </Button>
          </>
        }
      >
        <form id={`rename-${level}-form`} onSubmit={submitEdit} className="space-y-3">
          <TextField
            label={`${noun} name`}
            value={editName}
            required
            error={editError}
            onChange={(event) => setEditName(event.target.value)}
          />
          <FormError error={updateMutation.error} />
        </form>
      </Modal>

      <CascadeDeleteDialog
        target={
          deleting
            ? {
                level,
                id: deleting.id,
                name: deleting.name,
                universityId: level === 'university' ? deleting.id : universityId,
              }
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

/**
 * Semester column. A semester is identified by its `number` (1-20) and may carry
 * an optional name; sending `null` for the name clears it.
 */
export function SemesterColumn({
  streamId,
  universityId,
  selectedId,
  onSelect,
  list,
  create,
  update,
  remove,
}: {
  streamId: string;
  universityId: string;
  selectedId: string;
  onSelect: (id: string) => void;
  list: () => Promise<Semester[]>;
  create: (input: { number: number; name: string | null }) => Promise<unknown>;
  update: (
    id: string,
    input: { number: number; name: string | null }
  ) => Promise<unknown>;
  remove: (id: string) => Promise<DeletedCounts>;
}) {
  const queryClient = useQueryClient();

  const [newNumber, setNewNumber] = useState('');
  const [newName, setNewName] = useState('');
  const [errors, setErrors] = useState<{ number?: string }>({});
  const [editing, setEditing] = useState<Semester | null>(null);
  const [editNumber, setEditNumber] = useState('');
  const [editName, setEditName] = useState('');
  const [editErrors, setEditErrors] = useState<{ number?: string }>({});
  const [deleting, setDeleting] = useState<Semester | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.semesters.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.subjects.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.all }),
    ]);
  };

  const rowsQuery = useQuery({
    queryKey: queryKeys.semesters.list(streamId),
    queryFn: list,
    enabled: Boolean(streamId),
  });

  const createMutation = useMutation({
    mutationFn: create,
    onSuccess: async () => {
      setNewNumber('');
      setNewName('');
      await invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (variables: {
      id: string;
      number: number;
      name: string | null;
    }) => update(variables.id, { number: variables.number, name: variables.name }),
    onSuccess: async () => {
      setEditing(null);
      await invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove(id),
    onSuccess: async (counts, id) => {
      const label = deleting ? semesterLabel(deleting) : 'semester';
      setDeleting(null);
      setNotice(`Deleted ${label}, along with ${describeDeletedCounts(counts)}.`);

      if (selectedId === id) {
        onSelect('');
      }

      await invalidate();
    },
  });

  const rows = rowsQuery.data ?? [];

  const parseNumber = (raw: string): number | null => {
    const parsed = Number(raw);

    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 20 ? parsed : null;
  };

  const submitCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const number = parseNumber(newNumber);

    if (number === null) {
      setErrors({ number: 'Enter a semester number between 1 and 20' });
      return;
    }

    setErrors({});
    createMutation.mutate({ number, name: newName.trim() || null });
  };

  const submitEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const number = parseNumber(editNumber);

    if (number === null) {
      setEditErrors({ number: 'Enter a semester number between 1 and 20' });
      return;
    }

    if (!editing) {
      return;
    }

    setEditErrors({});
    updateMutation.mutate({
      id: editing.id,
      number,
      name: editName.trim() || null,
    });
  };

  return (
    <>
      <ColumnShell
        title="Semesters"
        count={rows.length}
        waitingFor={streamId ? undefined : 'Select a stream to see its semesters.'}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
        form={
          <form onSubmit={submitCreate} className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <TextField
                label="No."
                value={newNumber}
                required
                inputMode="numeric"
                placeholder="1"
                error={errors.number}
                onChange={(event) => setNewNumber(event.target.value)}
              />
              <div className="col-span-2">
                <TextField
                  label="Name (optional)"
                  value={newName}
                  placeholder="e.g. Autumn 2024"
                  onChange={(event) => setNewName(event.target.value)}
                />
              </div>
            </div>
            <Button type="submit" size="sm" loading={createMutation.isPending}>
              Add semester
            </Button>
            <FormError error={createMutation.error} />
          </form>
        }
      >
        {rowsQuery.isError ? (
          <div className="p-3">
            <ErrorState
              error={rowsQuery.error}
              title="Could not load semesters"
              onRetry={() => void rowsQuery.refetch()}
            />
          </div>
        ) : null}

        {rowsQuery.isPending && streamId ? <LoadingState label="Loading semesters…" /> : null}

        {rows.map((semester) => (
          <Row
            key={semester.id}
            label={semesterLabel(semester)}
            selected={semester.id === selectedId}
            selectable
            onSelect={() => onSelect(semester.id === selectedId ? '' : semester.id)}
            onEdit={() => {
              updateMutation.reset();
              setEditErrors({});
              setEditNumber(String(semester.number));
              setEditName(semester.name ?? '');
              setEditing(semester);
            }}
            onDelete={() => {
              deleteMutation.reset();
              setDeleting(semester);
            }}
          />
        ))}

        {!rowsQuery.isPending && rows.length === 0 && streamId ? (
          <EmptyState title="No semesters yet" />
        ) : null}
      </ColumnShell>

      <Modal
        open={editing !== null}
        title="Edit semester"
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
              form="edit-semester-form"
              loading={updateMutation.isPending}
            >
              Save
            </Button>
          </>
        }
      >
        <form id="edit-semester-form" onSubmit={submitEdit} className="space-y-3">
          <TextField
            label="Semester number"
            value={editNumber}
            required
            inputMode="numeric"
            error={editErrors.number}
            onChange={(event) => setEditNumber(event.target.value)}
          />
          <TextField
            label="Name (optional)"
            value={editName}
            hint="Leave blank to clear the name."
            onChange={(event) => setEditName(event.target.value)}
          />
          <FormError error={updateMutation.error} />
        </form>
      </Modal>

      <CascadeDeleteDialog
        target={
          deleting
            ? {
                level: 'semester',
                id: deleting.id,
                name: semesterLabel(deleting),
                universityId,
              }
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
