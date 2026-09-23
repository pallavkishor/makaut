import { unwrapList, unwrapObject, unwrapPaginated } from './normalize';

describe('unwrapList', () => {
  it('reads the named collection key', () => {
    expect(unwrapList<{ id: string }>({ subjects: [{ id: 'a' }] }, 'subjects')).toEqual([
      { id: 'a' },
    ]);
  });

  it('accepts a bare array', () => {
    expect(unwrapList<number>([1, 2], 'subjects')).toEqual([1, 2]);
  });

  it('returns an empty list when the key is missing', () => {
    expect(unwrapList({ unrelated: 1 }, 'subjects')).toEqual([]);
  });
});

describe('unwrapObject', () => {
  it('reads the named key', () => {
    expect(unwrapObject<{ id: string }>({ subject: { id: 'a' } }, 'subject')).toEqual({
      id: 'a',
    });
  });
});

describe('unwrapPaginated', () => {
  it('reads pagination metadata when present', () => {
    const result = unwrapPaginated<{ id: string }>(
      {
        students: [{ id: 'a' }],
        pagination: { page: 2, pageSize: 25, total: 51, totalPages: 3 },
      },
      'students',
      { page: 2, pageSize: 25 }
    );

    expect(result.items).toHaveLength(1);
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 25,
      total: 51,
      totalPages: 3,
    });
  });

  it('derives the page count when the server only reports a total', () => {
    const result = unwrapPaginated<number>(
      { students: [1, 2, 3], total: 51 },
      'students',
      { page: 1, pageSize: 25 }
    );

    expect(result.pagination.totalPages).toBe(3);
  });

  it('falls back to a single page when metadata is absent', () => {
    const result = unwrapPaginated<number>([1, 2], 'students', {
      page: 1,
      pageSize: 25,
    });

    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 25,
      total: 2,
      totalPages: 1,
    });
  });
});
