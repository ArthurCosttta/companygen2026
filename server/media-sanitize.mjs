/**
 * Server-side binary image magic-byte validation to reject disguised SVG/HTML payloads.
 */

const REJECTED_MEDIA_ERROR =
  'Formato de imagem inválido ou não permitido. Envie JPG, PNG ou WebP real.';

function detectMagicMimeFromBytes(bytes) {
  if (!bytes || bytes.length < 4) return '';

  // Reject SVG / XML / HTML / script payloads masquerading as raster images
  const headText = Buffer.from(bytes.subarray(0, 256))
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart()
    .toLowerCase();
  if (
    headText.startsWith('<svg') ||
    headText.startsWith('<?xml') ||
    headText.startsWith('<!doctype') ||
    headText.startsWith('<html') ||
    headText.includes('<script') ||
    headText.includes('<svg')
  ) {
    return '';
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: "RIFF" + 4 bytes + "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  // GIF: "GIF87a" / "GIF89a"
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'image/gif';
  }

  return '';
}

export function validateImageMagicBytes(input) {
  let buf = null;

  if (Buffer.isBuffer(input)) {
    buf = input;
  } else if (input instanceof Uint8Array) {
    buf = Buffer.from(input);
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return { ok: false, status: 415, error: REJECTED_MEDIA_ERROR };
    }
    if (/^data:/i.test(trimmed)) {
      if (/^data:image\/svg\+xml/i.test(trimmed) || !/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i.test(trimmed)) {
        return { ok: false, status: 415, error: REJECTED_MEDIA_ERROR };
      }
      const commaIdx = trimmed.indexOf(',');
      const b64 = commaIdx >= 0 ? trimmed.slice(commaIdx + 1) : '';
      if (!b64) {
        return { ok: false, status: 415, error: REJECTED_MEDIA_ERROR };
      }
      buf = Buffer.from(b64, 'base64');
    } else {
      buf = Buffer.from(trimmed, 'utf8');
    }
  }

  const detectedMime = detectMagicMimeFromBytes(buf);
  if (!detectedMime) {
    return { ok: false, status: 415, error: REJECTED_MEDIA_ERROR };
  }
  return { ok: true, status: 200, mimeType: detectedMime };
}
