import fc from 'fast-check';
import {
  browseDepth,
  browseHref,
  levelAtDepth,
  parseBrowseSegments,
} from './browsePaths';

describe('browseHref', () => {
  it('returns the catalogue root when nothing is known', () => {
    expect(browseHref({})).toBe('/browse');
  });

  it('builds a path in hierarchy order', () => {
    expect(
      browseHref({
        universityId: 'u1',
        programId: 'p1',
        streamId: 's1',
        semesterId: 'sem1',
      })
    ).toBe('/browse/u1/p1/s1/sem1');
  });

  it('stops at the first missing level, so every link resolves', () => {
    expect(browseHref({ universityId: 'u1', streamId: 's1' })).toBe('/browse/u1');
  });

  it('encodes ids', () => {
    expect(browseHref({ universityId: 'a/b' })).toBe('/browse/a%2Fb');
  });
});

describe('parseBrowseSegments', () => {
  it('names the segments it finds', () => {
    expect(parseBrowseSegments(['u1', 'p1'])).toEqual({
      universityId: 'u1',
      programId: 'p1',
    });
  });

  it('treats no segments as the root', () => {
    expect(parseBrowseSegments(undefined)).toEqual({});
  });
});

describe('levelAtDepth', () => {
  it('maps depth onto the level the URL points at', () => {
    expect(levelAtDepth(0)).toBeNull();
    expect(levelAtDepth(1)).toBe('university');
    expect(levelAtDepth(6)).toBe('chapter');
    expect(levelAtDepth(7)).toBeNull();
  });
});

describe('browse path properties', () => {
  const idArbitrary = fc.string({ minLength: 1, maxLength: 8 });

  it('round-trips a complete path through build and parse', () => {
    fc.assert(
      fc.property(fc.array(idArbitrary, { minLength: 0, maxLength: 6 }), (ids) => {
        const keys = [
          'universityId',
          'programId',
          'streamId',
          'semesterId',
          'subjectId',
          'chapterId',
        ] as const;

        const input = Object.fromEntries(
          ids.map((id, index) => [keys[index], id])
        );

        const href = browseHref(input);
        const segments = href === '/browse' ? [] : href.slice('/browse/'.length).split('/');

        expect(browseDepth(segments)).toBe(ids.length);
        expect(parseBrowseSegments(segments)).toEqual(input);
      })
    );
  });
});
