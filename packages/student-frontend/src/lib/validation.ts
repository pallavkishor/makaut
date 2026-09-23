import { z } from 'zod';

/**
 * Client-side credential validation.
 *
 * Mirrors the backend rules (valid email, password of at least 8 characters)
 * so students get immediate feedback, while the server stays the authority.
 */

export const MIN_PASSWORD_LENGTH = 8;

const emailField = z
  .string()
  .trim()
  .min(1, 'Enter your email address')
  .email('Enter a valid email address, for example name@example.com');

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password'),
});

export const registerSchema = z.object({
  email: emailField,
  password: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `Use at least ${MIN_PASSWORD_LENGTH} characters for your password`
    ),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;

/** Per-field error messages, keyed by field name. */
export type FieldErrors<T> = Partial<Record<keyof T, string>>;

/**
 * Runs a schema and returns either the parsed data or the first error per field.
 */
export function validate<TSchema extends z.ZodType>(
  schema: TSchema,
  values: unknown
):
  | { success: true; data: z.infer<TSchema> }
  | { success: false; errors: FieldErrors<z.infer<TSchema>> } {
  const result = schema.safeParse(values);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !errors[key]) {
      errors[key] = issue.message;
    }
  }

  return {
    success: false,
    errors: errors as FieldErrors<z.infer<TSchema>>,
  };
}
