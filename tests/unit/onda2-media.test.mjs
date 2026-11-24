import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { sanitizeImageUrl } from '../../server/media-sanitize.mjs';

test('sanitizeImageUrl accepts HTTPS, local assets and safe raster data URLs, blocking SVG/XSS', () => {
  assert.equal(sanitizeImageUrl('https://cdn.example.com/foto.webp'), 'https://cdn.example.com/foto.webp');
  assert.equal(sanitizeImageUrl('/api/store-molde/u1/assets/generated/logo.png'), '/api/store-molde/u1/assets/generated/logo.png');
  assert.equal(sanitizeImageUrl('/media/foto.jpg'), '/media/foto.jpg');
  assert.equal(sanitizeImageUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeImageUrl('data:image/svg+xml;base64,PHN2Zz4='), '');
  assert.equal(sanitizeImageUrl('//evil.com/x.png'), '');
  assert.equal(sanitizeImageUrl('/api/store-molde/../secret.png'), '');
  assert.equal(
    sanitizeImageUrl('data:image/webp;base64,UklGRh4AAABXRUJQVlA4'),
    'data:image/webp;base64,UklGRh4AAABXRUJQVlA4',
  );
});

test('storefront-molde-fs defaults generateImages to false unless explicitly requested', () => {
  const src = readFileSync(new URL('../../server/storefront-molde-fs.mjs', import.meta.url), 'utf8');
  assert.match(src, /generateImages\s*=\s*false,/);
  assert.match(src, /generateImages:\s*Boolean\(body\?\.generateImages\)/);
  assert.match(src, /\/api\/store-molde\/media\/upload/);
});
