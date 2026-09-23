import type { PageMeta, Paginated } from '@/types';

/**
 * Response shape helpers.
 *
 * The backend wraps collections in a named key (`{ subjects: [...] }`, see the
 * existing student routes). These helpers read that key while tolerating a bare
 * array, which keeps the admin panel working against either shape.
 */

export function unwrapObject<T>(body: unknown, key: string): T {
  if (body && typeof body === 'object' && key in body) {
    return (body as Record<string, T>)[key];
  }

  return body as T;
}

export function unwrapList<T>(body: unknown, key: string): T[] {
  if (Array.isArray(body)) {
    return body as T[];
  }

  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const candidate = record[key] ?? record.items ?? record.data;

    if (Array.isArray(candidate)) {
      return candidate as T[];
    }
  }

  return [];
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Reads `pagination.total` off a list response.
 *
 * This is how the admin panel counts rows it does not need to display: request
 * one row and read the total. Returns null when the server omitted it.
 */
export function readTotal(body: unknown): number | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const pagination = (body as { pagination?: unknown }).pagination;

  if (pagination && typeof pagination === 'object') {
    return readNumber(pagination as Record<string, unknown>, 'total');
  }

  return null;
}

/**
 * Reads pagination metadata, falling back to a single page containing whatever
 * items were returned when the server omits the metadata.
 */
export function unwrapPaginated<T>(
  body: unknown,
  key: string,
  requested: { page: number; pageSize: number }
): Paginated<T> {
  const items = unwrapList<T>(body, key);
  const record =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const metaSource =
    record.pagination && typeof record.pagination === 'object'
      ? (record.pagination as Record<string, unknown>)
      : record.meta && typeof record.meta === 'object'
        ? (record.meta as Record<string, unknown>)
        : record;

  const total = readNumber(metaSource, 'total') ?? items.length;
  const pageSize = readNumber(metaSource, 'pageSize') ?? requested.pageSize;
  const page = readNumber(metaSource, 'page') ?? requested.page;
  const totalPages =
    readNumber(metaSource, 'totalPages') ??
    Math.max(1, Math.ceil(total / Math.max(1, pageSize)));

  const pagination: PageMeta = { page, pageSize, total, totalPages };

  return { items, pagination };
}
