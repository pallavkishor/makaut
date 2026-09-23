import {
  MAX_NOTE_PROBES,
  countContent,
  describeDeletedCounts,
  impactLines,
  scopeFromTree,
  type ImpactCounters,
} from './deletionImpact';
import type { HierarchyTree } from '@/types';

/**
 * university
 *  ├ program A
 *  │  ├ stream A1 ─ sem 1 ─ subject s1 (ch c1, c2)
 *  │  │             sem 2 ─ subject s2 (ch c3)
 *  │  └ stream A2 ─ sem 1 ─ (no subjects)
 *  └ program B    ─ stream B1 ─ sem 1 ─ subject s3 (no chapters)
 */
const tree: HierarchyTree = {
  id: 'u1',
  name: 'Example University',
  programs: [
    {
      id: 'pA',
      name: 'B.Tech',
      streams: [
        {
          id: 'sA1',
          name: 'CSE',
          semesters: [
            {
              id: 'sem1',
              number: 1,
              name: null,
              subjects: [
                {
                  id: 's1',
                  name: 'Maths I',
                  code: 'M1',
                  position: 0,
                  chapters: [
                    { id: 'c1', title: 'Limits', position: 0 },
                    { id: 'c2', title: 'Series', position: 1 },
                  ],
                },
              ],
            },
            {
              id: 'sem2',
              number: 2,
              name: null,
              subjects: [
                {
                  id: 's2',
                  name: 'Maths II',
                  code: null,
                  position: 0,
                  chapters: [{ id: 'c3', title: 'Integrals', position: 0 }],
                },
              ],
            },
          ],
        },
        { id: 'sA2', name: 'ECE', semesters: [{ id: 'sem3', number: 1, name: null, subjects: [] }] },
      ],
    },
    {
      id: 'pB',
      name: 'MBA',
      streams: [
        {
          id: 'sB1',
          name: 'Finance',
          semesters: [
            {
              id: 'sem4',
              number: 1,
              name: null,
              subjects: [
                { id: 's3', name: 'Accounting', code: null, position: 0, chapters: [] },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('scopeFromTree', () => {
  it('spans the whole tree for a university', () => {
    const scope = scopeFromTree(tree, { level: 'university', id: 'u1' });

    expect(scope).not.toBeNull();
    expect(scope?.structural).toEqual({
      programs: 2,
      streams: 3,
      semesters: 4,
      subjects: 3,
      chapters: 3,
    });
    expect(scope?.subjectIds).toEqual(['s1', 's2', 's3']);
    expect(scope?.chapterIds).toEqual(['c1', 'c2', 'c3']);
  });

  it('omits the levels at or above the target', () => {
    const program = scopeFromTree(tree, { level: 'program', id: 'pA' });
    expect(program?.structural).toEqual({
      streams: 2,
      semesters: 3,
      subjects: 2,
      chapters: 3,
    });
    expect('programs' in (program?.structural ?? {})).toBe(false);

    const stream = scopeFromTree(tree, { level: 'stream', id: 'sA1' });
    expect(stream?.structural).toEqual({ semesters: 2, subjects: 2, chapters: 3 });

    const semester = scopeFromTree(tree, { level: 'semester', id: 'sem1' });
    expect(semester?.structural).toEqual({ subjects: 1, chapters: 2 });
    expect(semester?.chapterIds).toEqual(['c1', 'c2']);
  });

  it('reports an empty branch as zeroes rather than as missing', () => {
    const scope = scopeFromTree(tree, { level: 'stream', id: 'sA2' });

    expect(scope?.structural).toEqual({ semesters: 1, subjects: 0, chapters: 0 });
    expect(scope?.subjectIds).toEqual([]);
  });

  it('returns null when the target is not in the loaded tree', () => {
    expect(scopeFromTree(tree, { level: 'program', id: 'nope' })).toBeNull();
    expect(scopeFromTree(tree, { level: 'university', id: 'other' })).toBeNull();
  });
});

describe('countContent', () => {
  const counters = (): ImpactCounters => ({
    countNotesForSubject: jest.fn(async (subjectId: string) =>
      subjectId === 's1' ? 12 : 3
    ),
    countResourcesForSubject: jest.fn(async () => 1),
    countResourcesForChapter: jest.fn(async () => 2),
  });

  it('sums notes per subject and resources on both sides of the join', () => {
    const scope = scopeFromTree(tree, { level: 'university', id: 'u1' })!;

    return countContent(scope, counters()).then((impact) => {
      expect(impact.notes).toBe(12 + 3 + 3);
      // 3 subjects x 1 + 3 chapters x 2
      expect(impact.resources).toBe(3 + 6);
      expect(impact.notesExact).toBe(true);
      expect(impact.resourcesExact).toBe(true);
      expect(impact.subjects).toBe(3);
    });
  });

  it('probes every subject exactly once', async () => {
    const scope = scopeFromTree(tree, { level: 'stream', id: 'sA1' })!;
    const probes = counters();

    await countContent(scope, probes);

    expect(probes.countNotesForSubject).toHaveBeenCalledTimes(2);
    expect(probes.countResourcesForChapter).toHaveBeenCalledTimes(3);
  });

  it('degrades to a lower bound instead of firing thousands of probes', async () => {
    const many = Array.from({ length: MAX_NOTE_PROBES + 1 }, (_, index) => `s${index}`);
    const probes = counters();

    const impact = await countContent(
      { structural: { subjects: many.length, chapters: 0 }, subjectIds: many, chapterIds: [] },
      probes
    );

    expect(impact.notesExact).toBe(false);
    expect(probes.countNotesForSubject).not.toHaveBeenCalled();
  });
});

describe('impactLines', () => {
  it('lists the cascade from the widest level down', () => {
    expect(
      impactLines({ programs: 2, subjects: 1, notes: 480, resources: 0 })
    ).toEqual(['2 programs', '1 subject', '480 notes', '0 PDF resources']);
  });

  it('skips levels the response did not mention', () => {
    expect(impactLines({ notes: 1 })).toEqual(['1 note']);
  });
});

describe('describeDeletedCounts', () => {
  it('drops the zeroes so the message reads naturally', () => {
    expect(describeDeletedCounts({ subjects: 0, chapters: 2, notes: 7 })).toBe(
      '2 chapters, 7 notes'
    );
  });

  it('says so when nothing was below the record', () => {
    expect(describeDeletedCounts({ notes: 0 })).toBe('nothing below it');
  });
});
