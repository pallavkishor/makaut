'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ResourceEditModal } from './ResourceEditModal';
import { ResourceUploadForm } from './ResourceUploadForm';
import { SubjectPicker } from '@/features/hierarchy/ContentPicker';
import { useContentSelection } from '@/features/hierarchy/useContentSelection';
import {
  deleteResource,
  listResources,
  setResourcePublished,
} from '@/lib/api/resources';
import { formatDateTime } from '@/lib/dates';
import { formatBytes } from '@/lib/pdf';
import { queryKeys } from '@/lib/queryKeys';
import { PublishedBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CheckboxField, SelectField } from '@/components/ui/Field';
import { EmptyState, ErrorState, SuccessNotice } from '@/components/ui/Feedback';
import { PageHeader, Panel } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
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
import {
  RESOURCE_TYPES,
  RESOURCE_TYPE_LABELS,
  type Resource,
  type ResourceType,
} from '@/types';

const PAGE_SIZE = 20;

/**
 * PDF resource management: upload, list, filter, edit metadata, publish and
 * delete.
 *
 * A resource attaches to a subject, a chapter, or both. The list filter only
 * narrows in one direction - the server understands "published only" but cannot
 * filter to drafts - so the published filter is a checkbox, not a tri-state.
 */
export function ResourcesView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const { selection, setSelection, resolving } = useContentSelection({
    subjectId: searchParams.get('subjectId') ?? '',
    chapterId: searchParams.get('chapterId') ?? '',
  });

  const [resourceType, setResourceType] = useState<ResourceType | ''>('');
  const [publishedOnly, setPublishedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [deleting, setDeleting] = useState<Resource | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filters = {
    subjectId: selection.subjectId || undefined,
    chapterId: selection.chapterId || undefined,
    resourceType: resourceType || undefined,
    publishedOnly,
  };

  const resourcesQuery = useQuery({
    queryKey: queryKeys.resources.list(filters, page),
    queryFn: () => listResources({ ...filters, page, pageSize: PAGE_SIZE }),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.resources.all });

  const publishMutation = useMutation({
    mutationFn: (variables: { id: string; published: boolean }) =>
      setResourcePublished(variables.id, variables.published),
    onSuccess: async (resource) => {
      setNotice(
        resource.isPublished
          ? `“${resource.title}” is now visible to students.`
          : `“${resource.title}” is hidden from students, including any download link already issued.`
      );
      await invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteResource(id),
    onSuccess: async () => {
      setNotice(`Deleted “${deleting?.title ?? 'resource'}” and its stored file.`);
      setDeleting(null);
      await invalidate();
    },
  });

  const resources = resourcesQuery.data?.items ?? [];
  const pagination = resourcesQuery.data?.pagination;

  return (
    <>
      <PageHeader
        title="PDF resources"
        description="Reference PDFs, past papers, question papers and syllabi, attached to a subject or a chapter."
        actions={
          <Button
            variant={showUpload ? 'secondary' : 'primary'}
            aria-expanded={showUpload}
            onClick={() => setShowUpload((open) => !open)}
          >
            {showUpload ? 'Hide upload form' : 'Upload PDF'}
          </Button>
        }
      />

      {showUpload ? (
        <div className="mb-4">
          <ResourceUploadForm
            initialSelection={selection}
            onUploaded={() => setPage(1)}
          />
        </div>
      ) : null}

      <div className="mb-4">
        <Panel
          title="Filters"
          description="Narrow by where the PDF is attached, its type, or whether students can see it"
        >
          <div className="space-y-3 px-4 py-4">
            {resolving ? (
              <LoadingState label="Locating that subject…" />
            ) : (
              <SubjectPicker
                value={selection}
                filterMode
                includeChapter
                onChange={(next) => {
                  setSelection(next);
                  setPage(1);

                  const params = new URLSearchParams();
                  if (next.subjectId) {
                    params.set('subjectId', next.subjectId);
                  }
                  if (next.chapterId) {
                    params.set('chapterId', next.chapterId);
                  }
                  const query = params.toString();
                  router.replace(query ? `/resources?${query}` : '/resources');
                }}
              />
            )}

            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
              <SelectField
                label="Resource type"
                value={resourceType}
                onChange={(event) => {
                  setResourceType(event.target.value as ResourceType | '');
                  setPage(1);
                }}
              >
                <option value="">All types</option>
                {RESOURCE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {RESOURCE_TYPE_LABELS[type]}
                  </option>
                ))}
              </SelectField>

              <CheckboxField
                label="Published only"
                hint="Leave unchecked to see drafts as well."
                checked={publishedOnly}
                onChange={(checked) => {
                  setPublishedOnly(checked);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </Panel>
      </div>

      {notice ? (
        <div className="mb-3">
          <SuccessNotice>{notice}</SuccessNotice>
        </div>
      ) : null}

      {resourcesQuery.isError ? (
        <div className="mb-3">
          <ErrorState
            error={resourcesQuery.error}
            title="Could not load resources"
            onRetry={() => void resourcesQuery.refetch()}
          />
        </div>
      ) : null}

      <Panel
        title="Resources"
        description={pagination ? `${pagination.total} matching` : undefined}
      >
        <TableScroll>
          <Table caption="PDF resources">
            <Thead>
              <tr>
                <Th className="w-12 text-right">Pos</Th>
                <Th>Title</Th>
                <Th>Type</Th>
                <Th>Attached to</Th>
                <Th className="text-right">Size</Th>
                <Th>Visibility</Th>
                <Th>Uploaded</Th>
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </Thead>
            <Tbody>
              {resources.map((resource) => (
                <Tr key={resource.id}>
                  <Td className="text-right tabular-nums text-muted">
                    {resource.position}
                  </Td>
                  <Td className="font-medium text-foreground">
                    {resource.title}
                    {resource.description ? (
                      <span className="block max-w-md truncate text-xs font-normal text-muted">
                        {resource.description}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap text-muted">
                    {RESOURCE_TYPE_LABELS[resource.resourceType] ??
                      resource.resourceType}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-muted">
                    {resource.chapterId ? 'Chapter' : null}
                    {resource.chapterId && resource.subjectId ? ' + ' : null}
                    {resource.subjectId ? 'Subject' : null}
                    {!resource.chapterId && !resource.subjectId ? '—' : null}
                  </Td>
                  <Td className="whitespace-nowrap text-right tabular-nums text-muted">
                    {formatBytes(resource.fileSizeBytes)}
                  </Td>
                  <Td>
                    <PublishedBadge published={resource.isPublished} />
                  </Td>
                  <Td className="whitespace-nowrap text-muted">
                    {formatDateTime(resource.createdAt)}
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={
                          publishMutation.isPending &&
                          publishMutation.variables?.id === resource.id
                        }
                        onClick={() =>
                          publishMutation.mutate({
                            id: resource.id,
                            published: !resource.isPublished,
                          })
                        }
                      >
                        {resource.isPublished ? 'Unpublish' : 'Publish'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditing(resource)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          deleteMutation.reset();
                          setDeleting(resource);
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

        {resourcesQuery.isPending ? <LoadingState label="Loading resources…" /> : null}

        {!resourcesQuery.isPending && resources.length === 0 ? (
          <EmptyState
            title="No PDFs found"
            description="Upload one, or widen the filters above."
          />
        ) : null}

        {pagination && pagination.total > PAGE_SIZE ? (
          <Pagination
            pagination={pagination}
            disabled={resourcesQuery.isFetching}
            onPageChange={setPage}
          />
        ) : null}
      </Panel>

      <ResourceEditModal
        key={editing?.id ?? 'none'}
        resource={editing}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this PDF?"
        confirmLabel="Delete PDF"
        pending={deleteMutation.isPending}
        error={deleteMutation.error}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            deleteMutation.mutate(deleting.id);
          }
        }}
      >
        <p className="text-sm text-foreground">
          <span className="font-semibold">{deleting?.title}</span> and its stored
          file will be removed.
        </p>
        <p className="mt-2 text-sm font-medium text-red-700">
          The file is deleted from disk as well, so this cannot be undone. To take
          it away from students without losing it, unpublish instead.
        </p>
      </ConfirmDialog>
    </>
  );
}
