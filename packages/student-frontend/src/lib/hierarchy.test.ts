import fc from 'fast-check';
import {
  EMPTY_HIERARCHY,
  HIERARCHY_FIELD,
  HIERARCHY_LEVELS,
  deepestSelectedLevel,
  setHierarchyLevel,
  toSearchFilters,
  toSelectionInput,
  type HierarchySelection,
} from './hierarchy';

const FULL: HierarchySelection = {
  universityId: 'u1',
  programId: 'p1',
  streamId: 's1',
  semesterId: 'sem1',
  subjectId: 'sub1',
};

describe('setHierarchyLevel', () => {
  it('clears every level below the one that changed', () => {
    expect(setHierarchyLevel(FULL, 'program', 'p2')).toEqual({
      universityId: 'u1',
      programId: 'p2',
      streamId: '',
      semesterId: '',
      subjectId: '',
    });
  });

  it('clearing a level clears the levels below it too', () => {
    expect(setHierarchyLevel(FULL, 'university', '')).toEqual(EMPTY_HIERARCHY);
  });

  it('leaves the deepest level on its own', () => {
    expect(setHierarchyLevel(FULL, 'subject', 'sub2')).toEqual({
      ...FULL,
      subjectId: 'sub2',
    });
  });

  it('does not mutate the input', () => {
    const before = { ...FULL };
    setHierarchyLevel(FULL, 'stream', 's2');
    expect(FULL).toEqual(before);
  });
});

describe('toSelectionInput', () => {
  it('sends nulls for unset levels and drops the subject', () => {
    expect(toSelectionInput({ ...EMPTY_HIERARCHY, universityId: 'u1' })).toEqual({
      universityId: 'u1',
      programId: null,
      streamId: null,
      semesterId: null,
    });
  });
});

describe('toSearchFilters', () => {
  it('omits unset levels entirely', () => {
    expect(toSearchFilters({ ...EMPTY_HIERARCHY, semesterId: 'sem1' })).toEqual({
      semesterId: 'sem1',
    });
  });
});

describe('hierarchy selection properties', () => {
  const levelArbitrary = fc.constantFrom(...HIERARCHY_LEVELS);
  const idArbitrary = fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 6 }));
  const selectionArbitrary: fc.Arbitrary<HierarchySelection> = fc.record({
    universityId: idArbitrary,
    programId: idArbitrary,
    streamId: idArbitrary,
    semesterId: idArbitrary,
    subjectId: idArbitrary,
  });

  it('preserves shallower levels and clears deeper ones', () => {
    fc.assert(
      fc.property(
        selectionArbitrary,
        levelArbitrary,
        idArbitrary,
        (selection, level, id) => {
          const next = setHierarchyLevel(selection, level, id);
          const index = HIERARCHY_LEVELS.indexOf(level);

          HIERARCHY_LEVELS.forEach((other, otherIndex) => {
            const field = HIERARCHY_FIELD[other];

            if (otherIndex < index) {
              expect(next[field]).toBe(selection[field]);
            } else if (otherIndex === index) {
              expect(next[field]).toBe(id);
            } else {
              expect(next[field]).toBe('');
            }
          });
        }
      )
    );
  });

  it('leaves no gap in the chain once a level is set', () => {
    // A selection produced through the UI can only ever be a prefix of the
    // hierarchy, which is exactly what the backend's consistency check expects
    fc.assert(
      fc.property(
        levelArbitrary,
        fc.string({ minLength: 1, maxLength: 6 }),
        (level, id) => {
          const next = setHierarchyLevel(EMPTY_HIERARCHY, level, id);
          expect(deepestSelectedLevel(next)).toBe(level);
        }
      )
    );
  });
});
