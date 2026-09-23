'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { semesterLabel } from './ContentPicker';
import { getHierarchyTree } from '@/lib/api/hierarchy';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Panel } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/Spinner';
import type { HierarchyTree } from '@/types';

/**
 * Read-only navigator for one university's whole hierarchy.
 *
 * `GET /hierarchy/tree` returns every level down to chapters in a single
 * request, so this is the cheapest way to see where content actually lives.
 * Native `<details>` elements do the expanding: keyboard support and screen
 * reader semantics come for free, and the state survives re-renders.
 */
export function HierarchyTreePanel({ universityId }: { universityId: string }) {
  const [expandAllKey, setExpandAllKey] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const treeQuery = useQuery({
    queryKey: queryKeys.hierarchy.tree(universityId),
    queryFn: () => getHierarchyTree(universityId),
    enabled: Boolean(universityId),
  });

  if (!universityId) {
    return null;
  }

  const tree = treeQuery.data;

  return (
    <Panel
      title="Tree"
      description={tree ? tree.name : 'Everything under the selected university'}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setExpanded((open) => !open);
              setExpandAllKey((key) => key + 1);
            }}
          >
            {expanded ? 'Collapse all' : 'Expand all'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void treeQuery.refetch()}
            loading={treeQuery.isFetching}
          >
            Refresh
          </Button>
        </div>
      }
    >
      {treeQuery.isError ? (
        <div className="px-4 py-3">
          <ErrorState
            error={treeQuery.error}
            title="Could not load the tree"
            onRetry={() => void treeQuery.refetch()}
          />
        </div>
      ) : null}

      {treeQuery.isPending ? <LoadingState label="Loading tree…" /> : null}

      {tree ? <TreeBody key={expandAllKey} tree={tree} open={expanded} /> : null}
    </Panel>
  );
}

function TreeBody({ tree, open }: { tree: HierarchyTree; open: boolean }) {
  if (tree.programs.length === 0) {
    return (
      <EmptyState
        title="This university has no programs yet"
        description="Add a program in the columns above and it will appear here."
      />
    );
  }

  return (
    <div className="px-3 py-2 text-sm">
      {tree.programs.map((program) => (
        <details key={program.id} open={open} className="group">
          <summary className="cursor-pointer rounded px-1 py-1 font-medium text-foreground marker:text-muted hover:bg-primary-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700">
            {program.name}
            <Count n={program.streams.length} noun="stream" />
          </summary>

          <div className="ml-4 border-l border-border pl-3">
            {program.streams.map((stream) => (
              <details key={stream.id} open={open}>
                <summary className="cursor-pointer rounded px-1 py-1 text-foreground marker:text-muted hover:bg-primary-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700">
                  {stream.name}
                  <Count n={stream.semesters.length} noun="semester" />
                </summary>

                <div className="ml-4 border-l border-border pl-3">
                  {stream.semesters.map((semester) => (
                    <details key={semester.id} open={open}>
                      <summary className="cursor-pointer rounded px-1 py-1 text-foreground marker:text-muted hover:bg-primary-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700">
                        {semesterLabel(semester)}
                        <Count n={semester.subjects.length} noun="subject" />
                      </summary>

                      <div className="ml-4 border-l border-border pl-3">
                        {semester.subjects.map((subject) => (
                          <details key={subject.id} open={open}>
                            <summary className="cursor-pointer rounded px-1 py-1 text-foreground marker:text-muted hover:bg-primary-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700">
                              {subject.code ? (
                                <span className="font-mono text-xs text-muted">
                                  {subject.code}{' '}
                                </span>
                              ) : null}
                              {subject.name}
                              <Count n={subject.chapters.length} noun="chapter" />
                            </summary>

                            <ul className="ml-4 border-l border-border pl-3">
                              {subject.chapters.map((chapter) => (
                                <li
                                  key={chapter.id}
                                  className="flex items-center justify-between gap-2 px-1 py-0.5 text-muted"
                                >
                                  <span className="truncate">{chapter.title}</span>
                                  <Link
                                    href={`/notes?chapterId=${chapter.id}`}
                                    className="shrink-0 rounded text-xs font-medium text-primary-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
                                  >
                                    Notes
                                  </Link>
                                </li>
                              ))}
                              {subject.chapters.length === 0 ? (
                                <li className="px-1 py-0.5 text-xs text-muted">
                                  No chapters.{' '}
                                  <Link
                                    href={`/chapters?subjectId=${subject.id}`}
                                    className="rounded font-medium text-primary-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
                                  >
                                    Add one
                                  </Link>
                                </li>
                              ) : null}
                            </ul>
                          </details>
                        ))}
                        {semester.subjects.length === 0 ? (
                          <p className="px-1 py-0.5 text-xs text-muted">No subjects.</p>
                        ) : null}
                      </div>
                    </details>
                  ))}
                  {stream.semesters.length === 0 ? (
                    <p className="px-1 py-0.5 text-xs text-muted">No semesters.</p>
                  ) : null}
                </div>
              </details>
            ))}
            {program.streams.length === 0 ? (
              <p className="px-1 py-0.5 text-xs text-muted">No streams.</p>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  );
}

function Count({ n, noun }: { n: number; noun: string }) {
  return (
    <span className="ml-1.5 text-xs font-normal tabular-nums text-muted">
      {n} {n === 1 ? noun : `${noun}s`}
    </span>
  );
}
