import * as fc from 'fast-check';
import {
  PROGRESS_MAX,
  PROGRESS_MIN,
  addBookmark,
  clampProgressPercent,
  clampRecentLimit,
  getBookmark,
  getReadingProgress,
  listBookmarks,
  listRecentReadingProgress,
  removeBookmark,
  resetPrismaClient,
  setPrismaClient,
  upsertReadingProgress,
} from './engagement';
import {
  getTestDatabaseClient,
  disconnectTestDatabase,
} from '../test/config/database';
import { hashPassword } from '../utils/password';

/**
 * Student Engagement Service tests
 *
 * Covers the behaviour the endpoints depend on: idempotent bookmarking,
 * student isolation, server-side progress clamping, and completedAt being
 * stamped exactly once.
 *
 * Fixtures use fixed UUIDs and are upserted before every test, so the suite
 * neither wipes shared test data nor depends on it surviving between tests.
 */

// Fixed fixture ids, namespaced to this suite
const UNIVERSITY_ID = 'e0000000-0000-4000-8000-000000000001';
const PROGRAM_ID = 'e0000000-0000-4000-8000-000000000002';
const STREAM_ID = 'e0000000-0000-4000-8000-000000000003';
const SEMESTER_ID = 'e0000000-0000-4000-8000-000000000004';
const SUBJECT_ID = 'e0000000-0000-4000-8000-000000000005';
const CHAPTER_ID = 'e0000000-0000-4000-8000-000000000006';
const NOTE_ID = 'e0000000-0000-4000-8000-000000000007';
const SECOND_NOTE_ID = 'e0000000-0000-4000-8000-000000000008';
const STUDENT_ID = 'e0000000-0000-4000-8000-000000000009';
const OTHER_STUDENT_ID = 'e0000000-0000-4000-8000-00000000000a';

const SUBJECT_NAME = 'Data Structures';
const CHAPTER_TITLE = 'Linked Lists';
const NOTE_TITLE = 'Singly linked lists';

describe('Student Engagement Service', () => {
  let prisma: ReturnType<typeof getTestDatabaseClient>;

  beforeAll(() => {
    prisma = getTestDatabaseClient();
    setPrismaClient(prisma);
  });

  /**
   * Creates the academic hierarchy and the two student accounts this suite
   * reads and writes.
   *
   * Everything is keyed by a fixed id and created only when missing, so this is
   * safe to call repeatedly. `upsert` is avoided on notes: the table carries a
   * generated tsvector column, which Prisma cannot drive through an upsert.
   */
  async function createFixtures(): Promise<void> {
    const passwordHash = await hashPassword('password123');

    await prisma.student.createMany({
      data: [
        {
          id: STUDENT_ID,
          email: 'engagement-owner@example.test',
          passwordHash,
        },
        {
          id: OTHER_STUDENT_ID,
          email: 'engagement-other@example.test',
          passwordHash,
        },
      ],
      skipDuplicates: true,
    });

    // University > Program > Stream > Semester > Subject > Chapter > Note
    await prisma.university.createMany({
      data: [{ id: UNIVERSITY_ID, name: 'Engagement Test University' }],
      skipDuplicates: true,
    });

    await prisma.program.createMany({
      data: [{ id: PROGRAM_ID, universityId: UNIVERSITY_ID, name: 'B.Tech' }],
      skipDuplicates: true,
    });

    await prisma.stream.createMany({
      data: [{ id: STREAM_ID, programId: PROGRAM_ID, name: 'Computer Science' }],
      skipDuplicates: true,
    });

    await prisma.semester.createMany({
      data: [{ id: SEMESTER_ID, streamId: STREAM_ID, number: 1 }],
      skipDuplicates: true,
    });

    await prisma.subject.createMany({
      data: [{ id: SUBJECT_ID, semesterId: SEMESTER_ID, name: SUBJECT_NAME }],
      skipDuplicates: true,
    });

    await prisma.chapter.createMany({
      data: [{ id: CHAPTER_ID, subjectId: SUBJECT_ID, title: CHAPTER_TITLE }],
      skipDuplicates: true,
    });

    await prisma.note.createMany({
      data: [
        {
          id: NOTE_ID,
          chapterId: CHAPTER_ID,
          title: NOTE_TITLE,
          content: 'Notes on singly linked lists',
          isPublished: true,
        },
        {
          id: SECOND_NOTE_ID,
          chapterId: CHAPTER_ID,
          title: 'Doubly linked lists',
          content: 'Notes on doubly linked lists',
          isPublished: true,
        },
      ],
      skipDuplicates: true,
    });
  }

  /**
   * Restores the fixtures if they went missing (the test database is shared, so
   * another suite's cleanup can remove them) and clears this suite's engagement
   * rows so each test starts from a known state.
   */
  async function resetEngagementState(): Promise<void> {
    const [noteCount, studentCount] = await Promise.all([
      prisma.note.count({ where: { id: { in: [NOTE_ID, SECOND_NOTE_ID] } } }),
      prisma.student.count({
        where: { id: { in: [STUDENT_ID, OTHER_STUDENT_ID] } },
      }),
    ]);

    if (noteCount < 2 || studentCount < 2) {
      await createFixtures();
    }

    // Test isolation: only this suite's engagement rows are cleared
    const studentIds = [STUDENT_ID, OTHER_STUDENT_ID];

    await prisma.bookmark.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.readingProgress.deleteMany({
      where: { studentId: { in: studentIds } },
    });
  }

  beforeEach(async () => {
    await resetEngagementState();
  });

  afterAll(async () => {
    // Remove only this suite's fixtures; cascades clear the hierarchy below
    await prisma.student.deleteMany({
      where: { id: { in: [STUDENT_ID, OTHER_STUDENT_ID] } },
    });
    await prisma.university.deleteMany({ where: { id: UNIVERSITY_ID } });

    await disconnectTestDatabase();
    resetPrismaClient();
  });

  describe('clampProgressPercent', () => {
    it('clamps out-of-range and fractional values', () => {
      expect(clampProgressPercent(-1)).toBe(0);
      expect(clampProgressPercent(-1000)).toBe(0);
      expect(clampProgressPercent(0)).toBe(0);
      expect(clampProgressPercent(33.7)).toBe(33);
      expect(clampProgressPercent(100)).toBe(100);
      expect(clampProgressPercent(101)).toBe(100);
      expect(clampProgressPercent(Number.NaN)).toBe(0);
      expect(clampProgressPercent(Number.POSITIVE_INFINITY)).toBe(0);
    });

    it('always produces an integer within 0-100 for any numeric input', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer({ min: -1000, max: 1000 }),
            fc.double({ min: -1000, max: 1000, noNaN: true }),
            fc.constant(Number.NaN)
          ),
          (value) => {
            const result = clampProgressPercent(value);

            return (
              Number.isInteger(result) &&
              result >= PROGRESS_MIN &&
              result <= PROGRESS_MAX &&
              // Clamping is idempotent: a stored value is never rewritten
              clampProgressPercent(result) === result
            );
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('clampRecentLimit', () => {
    it('falls back to the default and caps the maximum', () => {
      expect(clampRecentLimit(undefined)).toBe(10);
      expect(clampRecentLimit(0)).toBe(1);
      expect(clampRecentLimit(5)).toBe(5);
      expect(clampRecentLimit(500)).toBe(50);
    });
  });

  describe('addBookmark', () => {
    it('is idempotent - re-bookmarking returns the existing row', async () => {
      const first = await addBookmark(STUDENT_ID, NOTE_ID);
      expect(first.created).toBe(true);

      const second = await addBookmark(STUDENT_ID, NOTE_ID);

      expect(second.created).toBe(false);
      expect(second.bookmark.id).toBe(first.bookmark.id);
      expect(second.bookmark.createdAt.getTime()).toBe(
        first.bookmark.createdAt.getTime()
      );

      const count = await prisma.bookmark.count({
        where: { studentId: STUDENT_ID },
      });
      expect(count).toBe(1);
    });
  });

  describe('listBookmarks', () => {
    it("returns only the student's own bookmarks, enriched with hierarchy names", async () => {
      await addBookmark(STUDENT_ID, NOTE_ID);
      await addBookmark(OTHER_STUDENT_ID, SECOND_NOTE_ID);

      const { bookmarks, total } = await listBookmarks(STUDENT_ID, {
        skip: 0,
        take: 20,
      });

      expect(total).toBe(1);
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].noteId).toBe(NOTE_ID);
      expect(bookmarks[0].note).toMatchObject({
        title: NOTE_TITLE,
        chapterTitle: CHAPTER_TITLE,
        subjectName: SUBJECT_NAME,
      });
    });
  });

  describe('removeBookmark', () => {
    it('reports whether a bookmark was removed and never touches another student', async () => {
      await addBookmark(STUDENT_ID, NOTE_ID);
      await addBookmark(OTHER_STUDENT_ID, NOTE_ID);

      expect(await removeBookmark(STUDENT_ID, NOTE_ID)).toBe(true);
      // Already gone
      expect(await removeBookmark(STUDENT_ID, NOTE_ID)).toBe(false);
      // The other student's bookmark for the same note survived
      expect(await getBookmark(OTHER_STUDENT_ID, NOTE_ID)).not.toBeNull();
    });
  });

  describe('upsertReadingProgress', () => {
    it('clamps the stored percentage to 0-100', async () => {
      const tooHigh = await upsertReadingProgress(STUDENT_ID, NOTE_ID, 150);
      expect(tooHigh.progressPercent).toBe(100);

      const tooLow = await upsertReadingProgress(STUDENT_ID, NOTE_ID, -20);
      expect(tooLow.progressPercent).toBe(0);

      const fractional = await upsertReadingProgress(STUDENT_ID, NOTE_ID, 42.9);
      expect(fractional.progressPercent).toBe(42);
    });

    it('stamps completedAt once and keeps it on later updates', async () => {
      const partial = await upsertReadingProgress(STUDENT_ID, NOTE_ID, 50);
      expect(partial.completedAt).toBeNull();

      const completed = await upsertReadingProgress(STUDENT_ID, NOTE_ID, 100);
      expect(completed.completedAt).not.toBeNull();

      await new Promise((resolve) => setTimeout(resolve, 10));

      const recompleted = await upsertReadingProgress(STUDENT_ID, NOTE_ID, 100);
      expect(recompleted.completedAt?.getTime()).toBe(
        completed.completedAt?.getTime()
      );

      // Re-reading the note does not erase the completion record
      const reread = await upsertReadingProgress(STUDENT_ID, NOTE_ID, 10);
      expect(reread.progressPercent).toBe(10);
      expect(reread.completedAt?.getTime()).toBe(completed.completedAt?.getTime());
    });

    it('moves lastViewedAt forward on every write', async () => {
      const first = await upsertReadingProgress(STUDENT_ID, NOTE_ID, 10);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const second = await upsertReadingProgress(STUDENT_ID, NOTE_ID, 20);

      expect(second.id).toBe(first.id);
      expect(second.lastViewedAt.getTime()).toBeGreaterThan(
        first.lastViewedAt.getTime()
      );
    });
  });

  describe('getReadingProgress', () => {
    it('returns null for a note the student has never viewed', async () => {
      await upsertReadingProgress(OTHER_STUDENT_ID, NOTE_ID, 40);

      expect(await getReadingProgress(STUDENT_ID, NOTE_ID)).toBeNull();
    });
  });

  describe('listRecentReadingProgress', () => {
    it('orders by lastViewedAt descending and respects the limit', async () => {
      await upsertReadingProgress(STUDENT_ID, NOTE_ID, 30);

      await new Promise((resolve) => setTimeout(resolve, 10));

      await upsertReadingProgress(STUDENT_ID, SECOND_NOTE_ID, 60);
      await upsertReadingProgress(OTHER_STUDENT_ID, NOTE_ID, 90);

      const recent = await listRecentReadingProgress(STUDENT_ID);

      expect(recent.map((row) => row.noteId)).toEqual([SECOND_NOTE_ID, NOTE_ID]);
      expect(recent[0].note.subjectName).toBe(SUBJECT_NAME);

      const limited = await listRecentReadingProgress(STUDENT_ID, 1);
      expect(limited).toHaveLength(1);
      expect(limited[0].noteId).toBe(SECOND_NOTE_ID);
    });
  });
});
