'use client';

import { useQuery } from '@tanstack/react-query';
import { listChapters } from '@/lib/api/chapters';
import {
  listPrograms,
  listSemesters,
  listStreams,
  listUniversities,
} from '@/lib/api/hierarchy';
import { listSubjects } from '@/lib/api/subjects';
import { queryKeys } from '@/lib/queryKeys';
import { SelectField } from '@/components/ui/Field';
import type { Semester } from '@/types';

/**
 * Cascading pickers for the content hierarchy.
 *
 * A subject lives at the bottom of University > Program > Stream > Semester, so
 * anything that creates or filters content needs all four steps. Each level only
 * loads once its parent is chosen, and choosing a new parent clears the levels
 * below it - a stale child id would otherwise be submitted against the wrong
 * branch.
 */

export interface HierarchyPath {
  universityId: string;
  programId: string;
  streamId: string;
  semesterId: string;
}

export const EMPTY_PATH: HierarchyPath = {
  universityId: '',
  programId: '',
  streamId: '',
  semesterId: '',
};

export function semesterLabel(semester: Semester | { number: number; name: string | null }): string {
  return semester.name
    ? `Semester ${semester.number} — ${semester.name}`
    : `Semester ${semester.number}`;
}

export interface HierarchyPickerProps {
  value: HierarchyPath;
  onChange: (next: HierarchyPath) => void;
  /** Field-level errors, keyed by the level they belong to. */
  errors?: Partial<Record<keyof HierarchyPath, string>>;
  /** Filter mode: adds an "all" choice at every level and drops the asterisks. */
  filterMode?: boolean;
  disabled?: boolean;
  /** Layout: four across on wide screens, or stacked inside a narrow modal. */
  columns?: 1 | 2 | 4;
}

export function HierarchyPicker({
  value,
  onChange,
  errors = {},
  filterMode = false,
  disabled = false,
  columns = 4,
}: HierarchyPickerProps) {
  const universities = useQuery({
    queryKey: queryKeys.universities.list(),
    queryFn: listUniversities,
  });

  const programs = useQuery({
    queryKey: queryKeys.programs.list(value.universityId),
    queryFn: () => listPrograms(value.universityId),
    enabled: Boolean(value.universityId),
  });

  const streams = useQuery({
    queryKey: queryKeys.streams.list(value.programId),
    queryFn: () => listStreams(value.programId),
    enabled: Boolean(value.programId),
  });

  const semesters = useQuery({
    queryKey: queryKeys.semesters.list(value.streamId),
    queryFn: () => listSemesters(value.streamId),
    enabled: Boolean(value.streamId),
  });

  const anyLabel = (label: string) => (filterMode ? `All ${label}` : `Select a ${label}…`);

  return (
    <div className={`grid grid-cols-1 gap-3 ${GRID[columns]}`}>
      <SelectField
        label="University"
        value={value.universityId}
        required={!filterMode}
        disabled={disabled}
        error={errors.universityId}
        onChange={(event) =>
          // Everything below a changed university is meaningless.
          onChange({ ...EMPTY_PATH, universityId: event.target.value })
        }
      >
        <option value="">{anyLabel('university')}</option>
        {(universities.data ?? []).map((university) => (
          <option key={university.id} value={university.id}>
            {university.name}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Program"
        value={value.programId}
        required={!filterMode}
        disabled={disabled || !value.universityId}
        error={errors.programId}
        hint={
          value.universityId && programs.isSuccess && programs.data.length === 0
            ? 'No programs in this university yet'
            : undefined
        }
        onChange={(event) =>
          onChange({
            ...EMPTY_PATH,
            universityId: value.universityId,
            programId: event.target.value,
          })
        }
      >
        <option value="">{anyLabel('program')}</option>
        {(programs.data ?? []).map((program) => (
          <option key={program.id} value={program.id}>
            {program.name}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Stream"
        value={value.streamId}
        required={!filterMode}
        disabled={disabled || !value.programId}
        error={errors.streamId}
        hint={
          value.programId && streams.isSuccess && streams.data.length === 0
            ? 'No streams in this program yet'
            : undefined
        }
        onChange={(event) =>
          onChange({
            ...value,
            streamId: event.target.value,
            semesterId: '',
          })
        }
      >
        <option value="">{anyLabel('stream')}</option>
        {(streams.data ?? []).map((stream) => (
          <option key={stream.id} value={stream.id}>
            {stream.name}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Semester"
        value={value.semesterId}
        required={!filterMode}
        disabled={disabled || !value.streamId}
        error={errors.semesterId}
        hint={
          value.streamId && semesters.isSuccess && semesters.data.length === 0
            ? 'No semesters in this stream yet'
            : undefined
        }
        onChange={(event) => onChange({ ...value, semesterId: event.target.value })}
      >
        <option value="">{anyLabel('semester')}</option>
        {(semesters.data ?? []).map((semester) => (
          <option key={semester.id} value={semester.id}>
            {semesterLabel(semester)}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

const GRID: Record<1 | 2 | 4, string> = {
  1: '',
  2: 'sm:grid-cols-2',
  4: 'sm:grid-cols-2 xl:grid-cols-4',
};

export interface ContentSelection extends HierarchyPath {
  subjectId: string;
  chapterId: string;
}

export const EMPTY_SELECTION: ContentSelection = {
  ...EMPTY_PATH,
  subjectId: '',
  chapterId: '',
};

/**
 * The hierarchy picker plus subject, and optionally chapter.
 *
 * Used by anything that has to name a subject or a chapter: the chapter manager,
 * the note editor, and the PDF uploader.
 */
export function SubjectPicker({
  value,
  onChange,
  errors = {},
  filterMode = false,
  disabled = false,
  includeChapter = false,
  chapterRequired = false,
  columns = 4,
}: {
  value: ContentSelection;
  onChange: (next: ContentSelection) => void;
  errors?: Partial<Record<keyof ContentSelection, string>>;
  filterMode?: boolean;
  disabled?: boolean;
  includeChapter?: boolean;
  chapterRequired?: boolean;
  columns?: 1 | 2 | 4;
}) {
  const subjects = useQuery({
    queryKey: queryKeys.subjects.list(value.semesterId),
    queryFn: () => listSubjects(value.semesterId),
    enabled: Boolean(value.semesterId),
  });

  const chapters = useQuery({
    queryKey: queryKeys.chapters.list(value.subjectId),
    queryFn: () => listChapters(value.subjectId),
    enabled: includeChapter && Boolean(value.subjectId),
  });

  return (
    <div className="space-y-3">
      <HierarchyPicker
        value={value}
        errors={errors}
        filterMode={filterMode}
        disabled={disabled}
        columns={columns}
        onChange={(path) =>
          // A different branch cannot keep the previous subject or chapter.
          onChange({ ...path, subjectId: '', chapterId: '' })
        }
      />

      <div className={`grid grid-cols-1 gap-3 ${includeChapter ? 'sm:grid-cols-2' : ''}`}>
        <SelectField
          label="Subject"
          value={value.subjectId}
          required={!filterMode}
          disabled={disabled || !value.semesterId}
          error={errors.subjectId}
          hint={
            value.semesterId && subjects.isSuccess && subjects.data.length === 0
              ? 'No subjects in this semester yet'
              : undefined
          }
          onChange={(event) =>
            onChange({ ...value, subjectId: event.target.value, chapterId: '' })
          }
        >
          <option value="">{filterMode ? 'All subjects' : 'Select a subject…'}</option>
          {(subjects.data ?? []).map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.code ? `${subject.code} — ${subject.name}` : subject.name}
            </option>
          ))}
        </SelectField>

        {includeChapter ? (
          <SelectField
            label="Chapter"
            value={value.chapterId}
            required={chapterRequired}
            disabled={disabled || !value.subjectId}
            error={errors.chapterId}
            hint={
              value.subjectId && chapters.isSuccess && chapters.data.length === 0
                ? 'No chapters in this subject yet'
                : undefined
            }
            onChange={(event) => onChange({ ...value, chapterId: event.target.value })}
          >
            <option value="">
              {chapterRequired
                ? 'Select a chapter…'
                : filterMode
                  ? 'All chapters'
                  : 'No chapter (attach to the subject)'}
            </option>
            {(chapters.data ?? []).map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.title}
              </option>
            ))}
          </SelectField>
        ) : null}
      </div>
    </div>
  );
}
