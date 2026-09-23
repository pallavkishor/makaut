import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

/**
 * Labelled form controls. Every input is tied to a visible `<label>` and, when
 * invalid, to its error text via `aria-describedby` + `aria-invalid`.
 */

const CONTROL_CLASS =
  'block w-full rounded-md border-0 px-3 py-2 text-sm text-foreground shadow-sm ring-1 ring-inset ring-border-strong placeholder:text-muted-300 focus:ring-2 focus:ring-inset focus:ring-primary-600 disabled:bg-tertiary disabled:text-muted';

const ERROR_RING = 'ring-red-400 focus:ring-red-500';

function FieldShell({
  label,
  htmlFor,
  hint,
  error,
  errorId,
  hintId,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  errorId: string;
  hintId: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
        {required ? (
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <div className="mt-1">{children}</div>
      {hint && !error ? (
        <p id={hintId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ label, hint, error, required, ...rest }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <FieldShell
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      errorId={errorId}
      hintId={hintId}
      required={required}
    >
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`${CONTROL_CLASS} ${error ? ERROR_RING : ''}`}
        {...rest}
      />
    </FieldShell>
  );
}

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'> {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function SelectField({
  label,
  hint,
  error,
  required,
  children,
  ...rest
}: SelectFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <FieldShell
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      errorId={errorId}
      hintId={hintId}
      required={required}
    >
      <select
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`${CONTROL_CLASS} ${error ? ERROR_RING : ''}`}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export interface TextAreaFieldProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'> {
  label: string;
  hint?: string;
  error?: string;
  /** Renders the control in a monospace face, for Markdown. */
  mono?: boolean;
}

export function TextAreaField({
  label,
  hint,
  error,
  required,
  mono = false,
  ...rest
}: TextAreaFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <FieldShell
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      errorId={errorId}
      hintId={hintId}
      required={required}
    >
      <textarea
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`${CONTROL_CLASS} ${mono ? 'font-mono text-xs leading-relaxed' : ''} ${
          error ? ERROR_RING : ''
        }`}
        {...rest}
      />
    </FieldShell>
  );
}

export interface FileFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className' | 'type'> {
  label: string;
  hint?: string;
  error?: string;
}

/**
 * File input. Styled through the `file:` variants rather than being hidden
 * behind a button, so it keeps its native keyboard behaviour.
 */
export function FileField({ label, hint, error, required, ...rest }: FileFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <FieldShell
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      errorId={errorId}
      hintId={hintId}
      required={required}
    >
      <input
        id={id}
        type="file"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`block w-full rounded-md text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-secondary-200 ${
          error ? 'ring-1 ring-inset ring-red-400' : ''
        }`}
        {...rest}
      />
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border-strong text-primary-600 focus:ring-2 focus:ring-primary-600"
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {hint ? (
          <p id={hintId} className="text-xs text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
