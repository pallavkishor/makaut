'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { errorMessageOf, isApiError, validationFieldOf } from '@/lib/api';
import { browseHref } from '@/lib/browsePaths';
import {
  EMPTY_HIERARCHY,
  HIERARCHY_FIELD,
  toSelectionInput,
  type HierarchyField,
  type HierarchySelection,
} from '@/lib/hierarchy';
import { useSaveSelection, useSelection } from '@/lib/queries';
import { ErrorState } from '@/components/ErrorState';
import { HierarchySelects } from '@/components/hierarchy/HierarchySelects';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { SkeletonList } from '@/components/ui/Skeleton';

/** Fields the selection endpoint can blame, in hierarchy order. */
const SELECTION_FIELDS: readonly HierarchyField[] = [
  HIERARCHY_FIELD.university,
  HIERARCHY_FIELD.program,
  HIERARCHY_FIELD.stream,
  HIERARCHY_FIELD.semester,
];

/**
 * Lets a student record the university / program / stream / semester they study,
 * persisted with `PUT /api/catalog/me/selection`.
 *
 * The deepest level chosen defines the selection: the backend fills in its
 * ancestry and validates that everything sent agrees with it. When it does not,
 * the 400 carries `details.field`, and that message is shown on the offending
 * select rather than as a generic banner.
 *
 * Requirements: 3.4, 4.1
 */
export function SelectionForm() {
  const selectionQuery = useSelection();
  const save = useSaveSelection();

  const [value, setValue] = useState<HierarchySelection>(EMPTY_HIERARCHY);
  const [fieldError, setFieldError] = useState<{
    field: HierarchyField;
    message: string;
  } | null>(null);
  const [saved, setSaved] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Seed the form from the stored selection, once
  useEffect(() => {
    if (hydrated || !selectionQuery.data) return;

    const { selection } = selectionQuery.data;

    setValue({
      universityId: selection.university?.id ?? '',
      programId: selection.program?.id ?? '',
      streamId: selection.stream?.id ?? '',
      semesterId: selection.semester?.id ?? '',
      subjectId: '',
    });
    setHydrated(true);
  }, [selectionQuery.data, hydrated]);

  function handleChange(next: HierarchySelection) {
    setValue(next);
    setFieldError(null);
    setSaved(false);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldError(null);
    setSaved(false);

    try {
      await save.mutateAsync(toSelectionInput(value));
      setSaved(true);
    } catch (error) {
      const field = validationFieldOf(error);

      if (field && SELECTION_FIELDS.includes(field as HierarchyField)) {
        setFieldError({
          field: field as HierarchyField,
          message: errorMessageOf(error),
        });
      }
      // Anything else is surfaced by the banner below, driven by save.error
    }
  }

  async function handleClear() {
    setFieldError(null);
    setSaved(false);
    setValue(EMPTY_HIERARCHY);

    try {
      await save.mutateAsync({});
      setSaved(true);
    } catch {
      // Reported through save.error
    }
  }

  if (selectionQuery.isPending) {
    return <SkeletonList rows={2} label="Loading your current selection" />;
  }

  const errors = fieldError ? { [fieldError.field]: fieldError.message } : {};

  // A field-level message is already rendered on the input; don't repeat it
  const showBanner =
    save.isError && !fieldError && !isValidationWithField(save.error);

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {selectionQuery.isError ? (
        <ErrorState
          error={selectionQuery.error}
          title="We could not load your current selection"
          onRetry={() => void selectionQuery.refetch()}
        />
      ) : null}

      <HierarchySelects
        value={value}
        onChange={handleChange}
        errors={errors}
        disabled={save.isPending}
      />

      {showBanner ? (
        <ErrorState error={save.error} title="We could not save your selection" />
      ) : null}

      {saved ? (
        <Alert tone="success" title="Selection saved">
          <p>
            Your dashboard now shows this semester.{' '}
            {value.semesterId ? (
              <Link
                href={browseHref({
                  universityId: value.universityId,
                  programId: value.programId,
                  streamId: value.streamId,
                  semesterId: value.semesterId,
                })}
                className="font-medium text-primary-700 underline decoration-primary-300 underline-offset-2 hover:decoration-primary-600"
              >
                Browse its subjects
              </Link>
            ) : null}
          </p>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" isLoading={save.isPending}>
          Save selection
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() => void handleClear()}
          disabled={save.isPending}
        >
          Clear selection
        </Button>
      </div>
    </form>
  );
}

/** True when the failure was already attributed to a specific field. */
function isValidationWithField(error: unknown): boolean {
  return isApiError(error) && validationFieldOf(error) !== null;
}
