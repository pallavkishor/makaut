/**
 * Client-side PDF checks for the resource uploader.
 *
 * The server is the authority - it verifies the magic number and enforces the
 * byte cap regardless of what the browser sends - but catching a wrong file or
 * an oversized one here saves an admin from waiting out a 25MB upload only to
 * be told no.
 */

/** Matches `RESOURCE_MAX_FILE_SIZE_BYTES`, the server default. */
export const MAX_RESOURCE_BYTES = 25 * 1024 * 1024;

/**
 * Practical ceiling of the base64 JSON upload path: base64 inflates by 4/3 and
 * the app-wide JSON body limit is 10MB, so anything above roughly 7.5MB has to
 * go through the raw `application/pdf` path. The uploader always uses raw, so
 * this exists to explain the difference in the UI.
 */
export const BASE64_PATH_LIMIT_BYTES = Math.floor((10 * 1024 * 1024 * 3) / 4);

export const PDF_MIME_TYPE = 'application/pdf';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;

  if (kb < 1024) {
    return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  }

  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * Validates a selected file before upload.
 *
 * @returns An admin-facing message, or null when the file is acceptable.
 */
export function validatePdfFile(
  file: { name: string; type: string; size: number } | null | undefined,
  maxBytes: number = MAX_RESOURCE_BYTES
): string | null {
  if (!file) {
    return 'Choose a PDF file to upload';
  }

  const isPdfExtension = /\.pdf$/i.test(file.name);
  const isPdfType = file.type === PDF_MIME_TYPE || file.type === '';

  if (!isPdfExtension || !isPdfType) {
    return 'Only PDF files can be uploaded';
  }

  if (file.size === 0) {
    return 'That file is empty';
  }

  if (file.size > maxBytes) {
    return `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`;
  }

  return null;
}

/**
 * Reads the first bytes of the file to confirm the `%PDF-` signature, which is
 * what the server actually checks. Cheap: only the header is read.
 */
export async function hasPdfSignature(file: Blob): Promise<boolean> {
  try {
    const header = await file.slice(0, 5).arrayBuffer();
    const bytes = new Uint8Array(header);

    return (
      bytes.length === 5 &&
      bytes[0] === 0x25 && // %
      bytes[1] === 0x50 && // P
      bytes[2] === 0x44 && // D
      bytes[3] === 0x46 && // F
      bytes[4] === 0x2d //  -
    );
  } catch {
    // If the browser cannot read the slice, let the server decide.
    return true;
  }
}
