'use client';

import { useMemo, useState } from 'react';
import { SelectField } from '@/components/ui/Field';
import type { Student } from '@/types';

/**
 * Student picker: a free-text filter narrows the option list, which keeps the
 * control keyboard-driven and usable once there are hundreds of accounts.
 */
export function StudentSelect({
  label,
  value,
  students,
  onChange,
  error,
  anyOptionLabel,
  required,
  disabled,
}: {
  label: string;
  value: string;
  students: Student[];
  onChange: (studentId: string) => void;
  error?: string;
  /** When provided, adds an "any student" choice (used for filtering). */
  anyOptionLabel?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const [filter, setFilter] = useState('');

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();

    if (!needle) {
      return students;
    }

    // Always keep the current selection visible so it cannot be silently lost.
    return students.filter(
      (student) => student.id === value || student.email.toLowerCase().includes(needle)
    );
  }, [filter, students, value]);

  const filterId = `${label.replace(/\s+/g, '-').toLowerCase()}-filter`;

  return (
    <div className="space-y-2">
      <div>
        <label htmlFor={filterId} className="block text-xs font-medium text-muted">
          Filter students by email
        </label>
        <input
          id={filterId}
          type="search"
          value={filter}
          disabled={disabled}
          autoComplete="off"
          placeholder="Start typing an email…"
          onChange={(event) => setFilter(event.target.value)}
          className="mt-1 block w-full rounded-md border-0 px-3 py-1.5 text-xs text-foreground shadow-sm ring-1 ring-inset ring-border-strong placeholder:text-muted-300 focus:ring-2 focus:ring-inset focus:ring-primary-600 disabled:bg-tertiary"
        />
      </div>

      <SelectField
        label={label}
        value={value}
        required={required}
        disabled={disabled}
        error={error}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{anyOptionLabel ?? 'Select a student…'}</option>
        {visible.map((student) => (
          <option key={student.id} value={student.id}>
            {student.email}
          </option>
        ))}
      </SelectField>
    </div>
  );
}
