import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import fc from 'fast-check';
import {
  DEFAULT_MAX_RESOURCE_BYTES,
  ResourceUploadError,
  ResourceUploadFailure,
  assertValidResourceUpload,
  deleteResourceFile,
  isPdfBuffer,
  openResourceFile,
  resolveMaxResourceBytes,
  resolveResourceFilePath,
  resolveStorageRoot,
  storeResourceFile,
  toDownloadFilename,
  toPublicResourceData,
  type ResourceData,
} from './resource';

/**
 * Resource storage and validation tests.
 *
 * Database-backed CRUD is not covered here (it needs a live Postgres); these
 * exercise the parts that decide what is allowed onto disk and what comes back
 * off it.
 */

/** Minimal byte sequence that passes the PDF magic number check. */
function pdfBytes(body = 'test'): Buffer {
  return Buffer.concat([
    Buffer.from('%PDF-1.7\n', 'ascii'),
    Buffer.from(body, 'utf8'),
    Buffer.from('\n%%EOF\n', 'ascii'),
  ]);
}

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

describe('resource file handling', () => {
  let storageRoot: string;

  beforeEach(async () => {
    storageRoot = path.join(os.tmpdir(), `resource-test-${randomUUID()}`);
    process.env.RESOURCE_STORAGE_PATH = storageRoot;
    delete process.env.RESOURCE_MAX_FILE_SIZE_BYTES;
    await fs.mkdir(storageRoot, { recursive: true });
  });

  afterEach(async () => {
    delete process.env.RESOURCE_STORAGE_PATH;
    delete process.env.RESOURCE_MAX_FILE_SIZE_BYTES;
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  describe('PDF detection', () => {
    it('accepts bytes that start with the PDF magic number', () => {
      expect(isPdfBuffer(pdfBytes())).toBe(true);
    });

    it('rejects an HTML file regardless of what it is named or declared as', () => {
      expect(isPdfBuffer(Buffer.from('<html><script>alert(1)</script>', 'utf8'))).toBe(
        false
      );
    });

    it('rejects a PNG', () => {
      expect(
        isPdfBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ).toBe(false);
    });

    it('rejects a buffer shorter than the magic number', () => {
      expect(isPdfBuffer(Buffer.from('%PD', 'ascii'))).toBe(false);
    });

    it('rejects a file where the magic number is not at the start', () => {
      expect(
        isPdfBuffer(Buffer.concat([Buffer.from('GIF89a', 'ascii'), pdfBytes()]))
      ).toBe(false);
    });
  });

  describe('upload validation', () => {
    it('rejects an empty upload', () => {
      try {
        assertValidResourceUpload(Buffer.alloc(0));
        throw new Error('expected an empty upload to be rejected');
      } catch (error) {
        expect(error).toBeInstanceOf(ResourceUploadError);
        expect((error as ResourceUploadError).reason).toBe(
          ResourceUploadFailure.EMPTY_FILE
        );
      }
    });

    it('rejects a non-PDF upload', () => {
      try {
        assertValidResourceUpload(Buffer.from('not a pdf at all', 'utf8'));
        throw new Error('expected a non-PDF upload to be rejected');
      } catch (error) {
        expect((error as ResourceUploadError).reason).toBe(
          ResourceUploadFailure.NOT_A_PDF
        );
      }
    });

    it('rejects an upload above the configured cap', () => {
      process.env.RESOURCE_MAX_FILE_SIZE_BYTES = String(1024 * 1024);

      const oversized = Buffer.concat([
        Buffer.from('%PDF-1.7\n', 'ascii'),
        Buffer.alloc(1024 * 1024 + 1, 0x20),
      ]);

      try {
        assertValidResourceUpload(oversized);
        throw new Error('expected an oversized upload to be rejected');
      } catch (error) {
        expect((error as ResourceUploadError).reason).toBe(
          ResourceUploadFailure.FILE_TOO_LARGE
        );
      }
    });

    it('checks the size before the PDF magic number so a huge non-PDF is cheap to reject', () => {
      process.env.RESOURCE_MAX_FILE_SIZE_BYTES = '16';

      try {
        assertValidResourceUpload(Buffer.alloc(64, 0x41));
        throw new Error('expected rejection');
      } catch (error) {
        expect((error as ResourceUploadError).reason).toBe(
          ResourceUploadFailure.FILE_TOO_LARGE
        );
      }
    });

    it('defaults the cap to 25MB', () => {
      expect(resolveMaxResourceBytes()).toBe(DEFAULT_MAX_RESOURCE_BYTES);
      expect(DEFAULT_MAX_RESOURCE_BYTES).toBe(25 * 1024 * 1024);
    });

    it('ignores an unusable cap and falls back to the default', () => {
      process.env.RESOURCE_MAX_FILE_SIZE_BYTES = '-5';
      expect(resolveMaxResourceBytes()).toBe(DEFAULT_MAX_RESOURCE_BYTES);

      process.env.RESOURCE_MAX_FILE_SIZE_BYTES = 'plenty';
      expect(resolveMaxResourceBytes()).toBe(DEFAULT_MAX_RESOURCE_BYTES);
    });
  });

  describe('storage', () => {
    it('writes the file under a generated uuid name inside the storage root', async () => {
      const buffer = pdfBytes('stored');

      const { storagePath, fileSizeBytes } = await storeResourceFile(buffer);

      expect(storagePath).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/
      );
      expect(fileSizeBytes).toBe(buffer.length);

      const onDisk = await fs.readFile(path.join(storageRoot, storagePath));
      expect(onDisk.equals(buffer)).toBe(true);
    });

    it('creates the storage directory when it does not exist yet', async () => {
      await fs.rm(storageRoot, { recursive: true, force: true });

      const { storagePath } = await storeResourceFile(pdfBytes());

      await expect(
        fs.stat(path.join(storageRoot, storagePath))
      ).resolves.toBeDefined();
    });

    it('gives every upload its own name', async () => {
      const first = await storeResourceFile(pdfBytes('one'));
      const second = await storeResourceFile(pdfBytes('two'));

      expect(first.storagePath).not.toBe(second.storagePath);
    });

    it('refuses to store a file that is not a PDF', async () => {
      await expect(
        storeResourceFile(Buffer.from('<html></html>', 'utf8'))
      ).rejects.toBeInstanceOf(ResourceUploadError);

      const entries = await fs.readdir(storageRoot);
      expect(entries).toHaveLength(0);
    });

    it('keeps the storage root outside the served uploads directory by default', () => {
      delete process.env.RESOURCE_STORAGE_PATH;

      const root = resolveStorageRoot();

      expect(root).toBe(path.resolve('./storage/resources'));
      expect(root).not.toContain(`${path.sep}uploads${path.sep}`);
    });
  });

  describe('path containment', () => {
    it('resolves a stored filename inside the root', () => {
      expect(resolveResourceFilePath('abc.pdf')).toBe(
        path.join(storageRoot, 'abc.pdf')
      );
    });

    it.each([
      ['a parent traversal', '../../etc/passwd'],
      ['a nested traversal', 'nested/../../escape.pdf'],
      ['an absolute path', path.join(os.tmpdir(), 'elsewhere.pdf')],
      ['the root itself', ''],
    ])('refuses %s', (_label, candidate) => {
      expect(() => resolveResourceFilePath(candidate)).toThrow(
        /escapes the storage root/
      );
    });
  });

  describe('reading and deleting', () => {
    it('streams back exactly what was stored', async () => {
      const buffer = pdfBytes('streamed content');
      const { storagePath } = await storeResourceFile(buffer);

      const file = await openResourceFile(storagePath);

      expect(file.sizeBytes).toBe(buffer.length);
      expect((await readStream(file.stream)).equals(buffer)).toBe(true);
    });

    it('fails when the stored file is missing', async () => {
      await expect(openResourceFile('missing.pdf')).rejects.toThrow();
    });

    it('deletes a stored file and is idempotent', async () => {
      const { storagePath } = await storeResourceFile(pdfBytes());

      await expect(deleteResourceFile(storagePath)).resolves.toBe(true);
      await expect(deleteResourceFile(storagePath)).resolves.toBe(false);
    });
  });

  describe('download filenames', () => {
    it.each([
      ['Unit 3 Notes', 'Unit 3 Notes.pdf'],
      ['../../etc/passwd', 'passwd.pdf'],
      ['report.pdf', 'report.pdf'],
      ['quote"; attachment; x=1', 'quote attachment x1.pdf'],
      ['', 'resource.pdf'],
      ['???', 'resource.pdf'],
      ['..', 'resource.pdf'],
    ])('turns %p into %p', (title, expected) => {
      expect(toDownloadFilename(title)).toBe(expected);
    });

    it('never emits a character that could break the Content-Disposition header', () => {
      fc.assert(
        fc.property(fc.string(), (title) => {
          const filename = toDownloadFilename(title);

          expect(filename.endsWith('.pdf')).toBe(true);
          expect(filename).not.toMatch(/["\\/\r\n;]/);
          expect(path.basename(filename)).toBe(filename);
        })
      );
    });
  });

  describe('student-facing shape', () => {
    it('does not expose the storage path or publish state', () => {
      const resource: ResourceData = {
        id: randomUUID(),
        subjectId: randomUUID(),
        chapterId: null,
        title: 'Previous year paper',
        description: null,
        resourceType: 'PREVIOUS_YEAR_PAPER',
        storagePath: 'secret-location.pdf',
        fileSizeBytes: 1234,
        mimeType: 'application/pdf',
        isPublished: true,
        position: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const publicView = toPublicResourceData(resource);

      expect(publicView).not.toHaveProperty('storagePath');
      expect(publicView).not.toHaveProperty('isPublished');
      expect(JSON.stringify(publicView)).not.toContain('secret-location');
      expect(publicView.id).toBe(resource.id);
    });
  });

  describe('properties', () => {
    it('round trips any valid PDF payload through storage', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 0, maxLength: 512 }),
          async (body) => {
            const buffer = Buffer.concat([
              Buffer.from('%PDF-1.4\n', 'ascii'),
              Buffer.from(body),
            ]);

            const { storagePath, fileSizeBytes } = await storeResourceFile(buffer);

            expect(fileSizeBytes).toBe(buffer.length);
            expect(resolveResourceFilePath(storagePath).startsWith(storageRoot)).toBe(
              true
            );

            const file = await openResourceFile(storagePath);
            expect((await readStream(file.stream)).equals(buffer)).toBe(true);

            await deleteResourceFile(storagePath);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('never stores a payload that does not start with the PDF magic number', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 64 }), async (bytes) => {
          const buffer = Buffer.from(bytes);
          fc.pre(!isPdfBuffer(buffer));

          await expect(storeResourceFile(buffer)).rejects.toBeInstanceOf(
            ResourceUploadError
          );
        }),
        { numRuns: 25 }
      );
    });
  });
});
