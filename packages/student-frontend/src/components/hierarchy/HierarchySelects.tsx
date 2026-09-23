'use client';

import {
  HIERARCHY_FIELD,
  setHierarchyLevel,
  type HierarchyField,
  type HierarchySelection,
} from '@/lib/hierarchy';
import {
  usePrograms,
  useSemesterSubjects,
  useSemesters,
  useStreams,
  useUniversities,
} from '@/lib/queries';
import { Select } from '@/components/ui/Select';

interface HierarchySelectsProps {
  value: HierarchySelection;
  onChange: (next: HierarchySelection) => void;
  /** Field-level messages, keyed exactly as the API reports `details.field`. */
  errors?: Partial<Record<HierarchyField, string>>;
  /** Adds a subject filter below the semester. Search only. */
  includeSubject?: boolean;
  disabled?: boolean;
}

/**
 * The chained university / program / stream / semester (/ subject) selects.
 *
 * Each level stays disabled until its parent is chosen, and choosing a level
 * clears the ones below it, so the combination submitted is always coherent -
 * the backend rejects an incoherent chain with a 400 naming the field, and this
 * keeps that from being a route students can reach by accident.
 */
export function HierarchySelects({
  value,
  onChange,
  errors = {},
  includeSubject = false,
  disabled = false,
}: HierarchySelectsProps) {
  const universities = useUniversities();
  const programs = usePrograms(value.universityId || undefined, {
    enabled: Boolean(value.universityId),
  });
  const streams = useStreams(value.programId || undefined, {
    enabled: Boolean(value.programId),
  });
  const semesters = useSemesters(value.streamId || undefined, {
    enabled: Boolean(value.streamId),
  });
  const subjects = useSemesterSubjects(
    includeSubject ? value.semesterId : ''
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Select
        label="University"
        placeholder={
          universities.isPending ? 'Loading universities…' : 'Select a university'
        }
        value={value.universityId}
        disabled={disabled || universities.isPending}
        error={errors[HIERARCHY_FIELD.university]}
        options={(universities.data?.universities ?? []).map((university) => ({
          value: university.id,
          label: university.name,
        }))}
        onChange={(event) =>
          onChange(setHierarchyLevel(value, 'university', event.target.value))
        }
      />

      <Select
        label="Program"
        placeholder={
          !value.universityId
            ? 'Select a university first'
            : programs.isPending
              ? 'Loading programs…'
              : 'Select a program'
        }
        value={value.programId}
        disabled={disabled || !value.universityId || programs.isPending}
        error={errors[HIERARCHY_FIELD.program]}
        options={(programs.data?.programs ?? []).map((program) => ({
          value: program.id,
          label: program.name,
        }))}
        onChange={(event) =>
          onChange(setHierarchyLevel(value, 'program', event.target.value))
        }
      />

      <Select
        label="Stream"
        placeholder={
          !value.programId
            ? 'Select a program first'
            : streams.isPending
              ? 'Loading streams…'
              : 'Select a stream'
        }
        value={value.streamId}
        disabled={disabled || !value.programId || streams.isPending}
        error={errors[HIERARCHY_FIELD.stream]}
        options={(streams.data?.streams ?? []).map((stream) => ({
          value: stream.id,
          label: stream.name,
        }))}
        onChange={(event) =>
          onChange(setHierarchyLevel(value, 'stream', event.target.value))
        }
      />

      <Select
        label="Semester"
        placeholder={
          !value.streamId
            ? 'Select a stream first'
            : semesters.isPending
              ? 'Loading semesters…'
              : 'Select a semester'
        }
        value={value.semesterId}
        disabled={disabled || !value.streamId || semesters.isPending}
        error={errors[HIERARCHY_FIELD.semester]}
        options={(semesters.data?.semesters ?? []).map((semester) => ({
          value: semester.id,
          label: semester.label,
        }))}
        onChange={(event) =>
          onChange(setHierarchyLevel(value, 'semester', event.target.value))
        }
      />

      {includeSubject ? (
        <Select
          label="Subject"
          placeholder={
            !value.semesterId
              ? 'Select a semester first'
              : subjects.isPending
                ? 'Loading subjects…'
                : 'All subjects'
          }
          value={value.subjectId}
          disabled={disabled || !value.semesterId || subjects.isPending}
          error={errors[HIERARCHY_FIELD.subject]}
          options={(subjects.data?.subjects ?? []).map((subject) => ({
            value: subject.id,
            label: subject.code ? `${subject.name} (${subject.code})` : subject.name,
          }))}
          onChange={(event) =>
            onChange(setHierarchyLevel(value, 'subject', event.target.value))
          }
        />
      ) : null}
    </div>
  );
}
