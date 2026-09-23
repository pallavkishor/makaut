'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { NameLevelColumn, SemesterColumn } from './HierarchyColumns';
import { HierarchyTreePanel } from './HierarchyTreePanel';
import {
  createProgram,
  createSemester,
  createStream,
  createUniversity,
  deleteProgram,
  deleteSemester,
  deleteStream,
  deleteUniversity,
  listPrograms,
  listSemesters,
  listStreams,
  listUniversities,
  updateProgram,
  updateSemester,
  updateStream,
  updateUniversity,
} from '@/lib/api/hierarchy';
import { queryKeys } from '@/lib/queryKeys';
import { PageHeader } from '@/components/ui/PageHeader';

/**
 * Academic hierarchy management.
 *
 * Four columns, left to right, each filtered by the selection in the one before
 * it: University > Program > Stream > Semester. The selection lives in the URL,
 * so a particular branch can be bookmarked or shared, and the tree panel below
 * shows the same university in full.
 */
export function HierarchyView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const universityId = searchParams.get('universityId') ?? '';
  const programId = searchParams.get('programId') ?? '';
  const streamId = searchParams.get('streamId') ?? '';
  const semesterId = searchParams.get('semesterId') ?? '';

  /** Writes the selection to the URL, dropping anything below the change. */
  const select = (next: {
    universityId?: string;
    programId?: string;
    streamId?: string;
    semesterId?: string;
  }) => {
    const params = new URLSearchParams();
    const resolved = {
      universityId: next.universityId ?? universityId,
      programId: next.programId ?? programId,
      streamId: next.streamId ?? streamId,
      semesterId: next.semesterId ?? semesterId,
    };

    for (const [key, value] of Object.entries(resolved)) {
      if (value) {
        params.set(key, value);
      }
    }

    const query = params.toString();
    router.replace(query ? `/hierarchy?${query}` : '/hierarchy');
  };

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.universities.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.programs.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.streams.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.semesters.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.subjects.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.all }),
    ]);
  };

  return (
    <>
      <PageHeader
        title="Content hierarchy"
        description="University → Program → Stream → Semester. Subjects hang off a semester, chapters off a subject, notes off a chapter."
        actions={
          semesterId ? (
            <Link
              href={`/subjects?semesterId=${semesterId}`}
              className="rounded text-sm font-medium text-primary-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
            >
              Subjects in this semester →
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <NameLevelColumn
          title="Universities"
          noun="university"
          level="university"
          queryKey={queryKeys.universities.list()}
          parentId=""
          waitingFor=""
          universityId={universityId}
          selectedId={universityId}
          onSelect={(id) =>
            select({ universityId: id, programId: '', streamId: '', semesterId: '' })
          }
          list={listUniversities}
          create={(name) => createUniversity(name)}
          update={(id, name) => updateUniversity(id, name)}
          remove={deleteUniversity}
          invalidate={invalidateAll}
        />

        <NameLevelColumn
          title="Programs"
          noun="program"
          level="program"
          queryKey={queryKeys.programs.list(universityId)}
          parentId={universityId || null}
          waitingFor="Select a university to see its programs."
          universityId={universityId}
          selectedId={programId}
          onSelect={(id) => select({ programId: id, streamId: '', semesterId: '' })}
          list={() => listPrograms(universityId)}
          create={(name) => createProgram({ universityId, name })}
          update={(id, name) => updateProgram(id, { name })}
          remove={deleteProgram}
          invalidate={invalidateAll}
        />

        <NameLevelColumn
          title="Streams"
          noun="stream"
          level="stream"
          queryKey={queryKeys.streams.list(programId)}
          parentId={programId || null}
          waitingFor="Select a program to see its streams."
          universityId={universityId}
          selectedId={streamId}
          onSelect={(id) => select({ streamId: id, semesterId: '' })}
          list={() => listStreams(programId)}
          create={(name) => createStream({ programId, name })}
          update={(id, name) => updateStream(id, { name })}
          remove={deleteStream}
          invalidate={invalidateAll}
        />

        <SemesterColumn
          streamId={streamId}
          universityId={universityId}
          selectedId={semesterId}
          onSelect={(id) => select({ semesterId: id })}
          list={() => listSemesters(streamId)}
          create={(input) => createSemester({ streamId, ...input })}
          update={(id, input) => updateSemester(id, input)}
          remove={deleteSemester}
        />
      </div>

      {universityId ? (
        <div className="mt-4">
          <HierarchyTreePanel universityId={universityId} />
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-border bg-background-surface px-4 py-6 text-center text-sm text-muted">
          Select a university to browse its full tree.
        </p>
      )}
    </>
  );
}
