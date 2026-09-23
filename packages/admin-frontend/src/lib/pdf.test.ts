import { MAX_RESOURCE_BYTES, formatBytes, validatePdfFile } from './pdf';

const pdf = (overrides: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: 'unit-1.pdf',
  type: 'application/pdf',
  size: 1024,
  ...overrides,
});

describe('validatePdfFile', () => {
  it('accepts a PDF within the cap', () => {
    expect(validatePdfFile(pdf())).toBeNull();
  });

  it('accepts a .pdf whose MIME type the browser could not determine', () => {
    expect(validatePdfFile(pdf({ type: '' }))).toBeNull();
  });

  it('requires a file', () => {
    expect(validatePdfFile(null)).toBe('Choose a PDF file to upload');
  });

  it('rejects a non-PDF extension', () => {
    expect(validatePdfFile(pdf({ name: 'notes.docx', type: '' }))).toBe(
      'Only PDF files can be uploaded'
    );
  });

  it('rejects a mismatched MIME type', () => {
    expect(validatePdfFile(pdf({ type: 'image/png' }))).toBe(
      'Only PDF files can be uploaded'
    );
  });

  it('rejects an empty file', () => {
    expect(validatePdfFile(pdf({ size: 0 }))).toBe('That file is empty');
  });

  it('rejects a file above the cap and names both sizes', () => {
    const message = validatePdfFile(pdf({ size: MAX_RESOURCE_BYTES + 1 }));

    expect(message).toContain('25.0 MB');
  });

  it('honours a caller-supplied cap', () => {
    expect(validatePdfFile(pdf({ size: 2048 }), 1024)).toContain('The limit is 1.0 KB');
  });
});

describe('formatBytes', () => {
  it('scales the unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(1024 * 1024 * 3)).toBe('3.0 MB');
  });

  it('handles nonsense defensively', () => {
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });
});
