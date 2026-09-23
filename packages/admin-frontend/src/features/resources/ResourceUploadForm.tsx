'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { SubjectPicker, type ContentSelection } from '@/features/hierarchy/ContentPicker';
import { ApiError } from '@/lib/apiError';
import { uploadResource } from '@/lib/api/resources';
import {
  MAX_RESOURCE_BYTES,
  formatBytes,
  hasPdfSignature,
  validatePdfFile,
} from '@/lib/pdf';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/Button';
import {
  CheckboxField,
  FileField,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/ui/Field';
import { FormError, SuccessNotice } from '@/components/ui/Feedback';
import { Panel } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RESOURCE_TYPES, RESOURCE_TYPE_LABELS, type ResourceType } from '@/types';

/**
 * PDF upload form.
 *
 * Sends the file through the raw `Content-Type: application/pdf` path, which
 * allows 25MB and reports real progress. The base64 JSON alternative would cap
 * out near 7.5MB because of the app-wide JSON body limit.
 *
 * The file is checked here for type, emptiness, size and the `%PDF-` signature
 * before a single byte goes over the wire; the server checks all of it again.
 * Nothing in the form is cleared on a failed submit.
 */
export function ResourceUploadForm({
  initialSelection,
  onUploaded,
}: {
  initialSelection: ContentSelection;
  onUploaded?: () => void;
}) {
  const queryClient = useQueryClient();

  const [selection, setSelection] = useState<ContentSelection>(initialSelection);
  const [file, setFile] = useState<File | null>(null);
  /** Bumped to remount the file input, which is the only way to clear it. */
  const [fileKey, setFileKey] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [resourceType, setResourceType] = useState<ResourceType>('REFERENCE');
  const [publishNow, setPublishNow] = useState(false);
  const [errors, setErrors] = useState<{
    file?: string;
    title?: string;
    subjectId?: string;
  }>({});
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadedTitle, setUploadedTitle] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (input: { file: File }) => {
      setProgress(0);

      return uploadResource({
        file: input.file,
        title: title.trim(),
        description: description.trim() || null,
        resourceType,
        subjectId: selection.subjectId || null,
        chapterId: selection.chapterId || null,
        isPublished: publishNow,
        onProgress: setProgress,
      });
    },
    onSuccess: async (resource) => {
      setProgress(null);
      setUploadedTitle(resource.title);
      setFile(null);
      setFileKey((key) => key + 1);
      setTitle('');
      setDescription('');

      await queryClient.invalidateQueries({ queryKey: queryKeys.resources.all });
      onUploaded?.();
    },
    onError: () => setProgress(null),
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUploadedTitle(null);

    const nextErrors: typeof errors = {};
    const fileError = validatePdfFile(file);

    if (fileError) {
      nextErrors.file = fileError;
    }

    if (!title.trim()) {
      nextErrors.title = 'Title is required';
    }

    // The server insists a resource hangs off something, or it would be
    // invisible in every listing.
    if (!selection.subjectId && !selection.chapterId) {
      nextErrors.subjectId = 'Attach the PDF to a subject, a chapter, or both';
    }

    if (!fileError && file && !(await hasPdfSignature(file))) {
      nextErrors.file = 'That file is not a real PDF — the header does not match';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0 || !file) {
      return;
    }

    mutation.mutate({ file });
  };

  const tooLarge = mutation.error instanceof ApiError && mutation.error.status === 413;

  return (
    <Panel
      title="Upload a PDF"
      description={`Up to ${formatBytes(MAX_RESOURCE_BYTES)} per file. The file itself cannot be replaced later — metadata can.`}
    >
      <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4" noValidate>
        {uploadedTitle ? (
          <SuccessNotice>Uploaded “{uploadedTitle}”.</SuccessNotice>
        ) : null}

        {mutation.error ? (
          <div className="space-y-2">
            <FormError error={mutation.error} />
            {tooLarge ? (
              <p className="text-xs text-muted">
                The server rejected the file as too large. Split the PDF or compress
                it, then upload again — nothing else in this form was lost.
              </p>
            ) : null}
          </div>
        ) : null}

        <SubjectPicker
          value={selection}
          onChange={setSelection}
          includeChapter
          errors={{ subjectId: errors.subjectId }}
          disabled={mutation.isPending}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <FileField
              key={fileKey}
              label="PDF file"
              required
              accept="application/pdf,.pdf"
              disabled={mutation.isPending}
              error={errors.file}
              hint={
                file
                  ? `${file.name} — ${formatBytes(file.size)}`
                  : 'PDF only, checked before upload'
              }
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setFile(selected);
                setErrors((previous) => ({ ...previous, file: undefined }));

                // Save a keystroke: default the title to the filename.
                if (selected && !title.trim()) {
                  setTitle(selected.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '));
                }
              }}
            />

            <TextField
              label="Title"
              value={title}
              required
              maxLength={500}
              disabled={mutation.isPending}
              error={errors.title}
              onChange={(event) => setTitle(event.target.value)}
            />

            <SelectField
              label="Resource type"
              value={resourceType}
              required
              disabled={mutation.isPending}
              onChange={(event) => setResourceType(event.target.value as ResourceType)}
            >
              {RESOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {RESOURCE_TYPE_LABELS[type]}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="space-y-3">
            <TextAreaField
              label="Description (optional)"
              value={description}
              rows={5}
              disabled={mutation.isPending}
              onChange={(event) => setDescription(event.target.value)}
            />

            <CheckboxField
              label="Publish immediately"
              hint="Unpublished PDFs are invisible to students until you publish them."
              checked={publishNow}
              disabled={mutation.isPending}
              onChange={setPublishNow}
            />
          </div>
        </div>

        {mutation.isPending ? (
          <ProgressBar fraction={progress} label={`Uploading ${file?.name ?? 'file'}`} />
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" loading={mutation.isPending}>
            Upload PDF
          </Button>
          <p className="text-xs text-muted">
            Sent as a raw PDF body, so the 25MB limit applies rather than the much
            smaller JSON one.
          </p>
        </div>
      </form>
    </Panel>
  );
}
