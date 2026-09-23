'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { SubjectPicker } from '@/features/hierarchy/ContentPicker';
import { updateResource } from '@/lib/api/resources';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { LoadingState } from '@/components/ui/Spinner';
import {
  RESOURCE_TYPES,
  RESOURCE_TYPE_LABELS,
  type Resource,
  type ResourceType,
} from '@/types';
import { useContentSelection } from '@/features/hierarchy/useContentSelection';

/**
 * Edits a resource's metadata. The stored PDF is immutable - replacing the file
 * means uploading a new resource - so only the fields the server accepts on
 * `PUT` are here.
 *
 * The endpoint revalidates everything, including the "must reference a subject or
 * a chapter" rule, so this sends a complete metadata block rather than a patch.
 */
export function ResourceEditModal({
  resource,
  onClose,
}: {
  resource: Resource | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [resourceType, setResourceType] = useState<ResourceType>('REFERENCE');
  const [position, setPosition] = useState('0');
  const [errors, setErrors] = useState<{
    title?: string;
    position?: string;
    subjectId?: string;
  }>({});

  // Resolves the hierarchy above whatever the resource is currently attached to.
  const { selection, setSelection, resolving } = useContentSelection({
    subjectId: resource?.subjectId ?? undefined,
    chapterId: resource?.chapterId ?? undefined,
  });

  useEffect(() => {
    if (!resource) {
      return;
    }

    setTitle(resource.title);
    setDescription(resource.description ?? '');
    setResourceType(resource.resourceType);
    setPosition(String(resource.position));
    setErrors({});
  }, [resource]);

  const mutation = useMutation({
    mutationFn: (id: string) =>
      updateResource(id, {
        title: title.trim(),
        description: description.trim() || null,
        resourceType,
        subjectId: selection.subjectId || null,
        chapterId: selection.chapterId || null,
        position: Number(position),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.resources.all });
      onClose();
    },
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!resource) {
      return;
    }

    const nextErrors: typeof errors = {};

    if (!title.trim()) {
      nextErrors.title = 'Title is required';
    }

    const parsedPosition = Number(position);

    if (!Number.isInteger(parsedPosition) || parsedPosition < 0) {
      nextErrors.position = 'Position must be a whole number, 0 or greater';
    }

    if (!selection.subjectId && !selection.chapterId) {
      nextErrors.subjectId = 'Attach the PDF to a subject, a chapter, or both';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    mutation.mutate(resource.id);
  };

  return (
    <Modal
      open={resource !== null}
      title="Edit PDF details"
      description="The file itself cannot be changed. Upload a new resource to replace it."
      size="lg"
      dismissible={!mutation.isPending}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-resource-form"
            loading={mutation.isPending}
          >
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-resource-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <TextField
          label="Title"
          value={title}
          required
          maxLength={500}
          error={errors.title}
          onChange={(event) => setTitle(event.target.value)}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField
            label="Resource type"
            value={resourceType}
            required
            onChange={(event) => setResourceType(event.target.value as ResourceType)}
          >
            {RESOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {RESOURCE_TYPE_LABELS[type]}
              </option>
            ))}
          </SelectField>

          <TextField
            label="Position"
            value={position}
            inputMode="numeric"
            hint="Lower numbers appear first."
            error={errors.position}
            onChange={(event) => setPosition(event.target.value)}
          />
        </div>

        <TextAreaField
          label="Description (optional)"
          value={description}
          rows={3}
          onChange={(event) => setDescription(event.target.value)}
        />

        {resolving ? (
          <LoadingState label="Locating the current attachment…" />
        ) : (
          <SubjectPicker
            value={selection}
            onChange={setSelection}
            includeChapter
            columns={2}
            errors={{ subjectId: errors.subjectId }}
          />
        )}

        <FormError error={mutation.error} />
      </form>
    </Modal>
  );
}

