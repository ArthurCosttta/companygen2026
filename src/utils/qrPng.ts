/**
 * Lightweight zero-dependency QR Code generator (Byte mode, EC Level L, Versions 1..6)
 * that renders directly to an HTMLCanvasElement PNG data URL for offline sharing.
 */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function rsGeneratorPoly(ecLen: number): number[] {
  let g = [1];
  for (let i = 0; i < ecLen; i += 1) {
    const next = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j += 1) {
      next[j] ^= g[j];
      next[j + 1] ^= gfMul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

function rsRemainder(data: number[], ecLen: number): number[] {
  const gen = rsGeneratorPoly(ecLen);
  const res = [...data, ...new Array<number>(ecLen).fill(0)];
  for (let i = 0; i < data.length; i += 1) {
    const factor = res[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j += 1) {
      res[i + j] ^= gfMul(gen[j], factor);
    }
  }
  return res.slice(data.length);
}

// Level L specs (versions 1..6): [version, size, totalCodewords, ecPerBlock, blocks]
const QR_SPECS: Array<[number, number, number, number, number, number[]]> = [
  [1, 21, 19, 7, 1, []],
  [2, 25, 34, 10, 1, [6, 18]],
  [3, 29, 55, 15, 1, [6, 22]],
  [4, 33, 80, 20, 1, [6, 26]],
  [5, 37, 108, 26, 1, [6, 30]],
  [6, 41, 136, 18, 2, [6, 34]],
];

function computeFormatInfo(maskId: number): number {
  const data = (1 << 3) | maskId; // EC L = 01
  let rem = data << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

export function buildQrMatrix(text: string): number[][] {
  const bytes = Array.from(new TextEncoder().encode(text || 'https://companygen.store'));
  const spec =
    QR_SPECS.find(([, , dataCw]) => bytes.length + 2 <= dataCw) ||
    QR_SPECS[QR_SPECS.length - 1];
  const [, size, dataCw, ecPerBlock, blocks, alignCoords] = spec;
  const payloadBytes = bytes.slice(0, Math.max(1, dataCw - 2));

  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i -= 1) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4); // Byte mode
  pushBits(payloadBytes.length, 8);
  for (const b of payloadBytes) pushBits(b, 8);
  pushBits(0, Math.min(4, dataCw * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | (bits[i + j] || 0);
    codewords.push(byte);
  }
  const padBytes = [0xec, 0x11];
  for (let p = 0; codewords.length < dataCw; p += 1) {
    codewords.push(padBytes[p % 2]);
  }

  // Split blocks & compute RS EC
  const blockSize = Math.floor(dataCw / blocks);
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  for (let b = 0; b < blocks; b += 1) {
    const start = b * blockSize;
    const chunk = codewords.slice(start, b === blocks - 1 ? dataCw : start + blockSize);
    dataBlocks.push(chunk);
    ecBlocks.push(rsRemainder(chunk, ecPerBlock));
  }
  const finalStream: number[] = [];
  const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i += 1) {
    for (const db of dataBlocks) if (i < db.length) finalStream.push(db[i]);
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const eb of ecBlocks) if (i < eb.length) finalStream.push(eb[i]);
  }

  const grid = Array.from({ length: size }, () => new Array<number>(size).fill(-1));
  const reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  const placeFinder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr += 1) {
      for (let dc = -1; dc <= 7; dc += 1) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const on =
          dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        grid[r][c] = on ? 1 : 0;
        reserved[r][c] = true;
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i += 1) {
    const bit = i % 2 === 0 ? 1 : 0;
    grid[6][i] = bit;
    grid[i][6] = bit;
    reserved[6][i] = true;
    reserved[i][6] = true;
  }

  for (const r of alignCoords) {
    for (const c of alignCoords) {
      if (reserved[r][c]) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const on = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          grid[r + dr][c + dc] = on ? 1 : 0;
          reserved[r + dr][c + dc] = true;
        }
      }
    }
  }

  // Reserve format info & dark module
  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      reserved[8][i] = true;
      reserved[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i += 1) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
  grid[size - 8][8] = 1;
  reserved[size - 8][8] = true;

  // Place data bits (mask 0: (r + c) % 2 === 0)
  const bitStream: number[] = [];
  for (const cw of finalStream) {
    for (let i = 7; i >= 0; i -= 1) bitStream.push((cw >> i) & 1);
  }
  let bitIdx = 0;
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let step = 0; step < size; step += 1) {
      const r = up ? size - 1 - step : step;
      for (const c of [col, col - 1]) {
        if (reserved[r][c]) continue;
        const rawBit = bitIdx < bitStream.length ? bitStream[bitIdx++] : 0;
        const maskBit = (r + c) % 2 === 0 ? 1 : 0;
        grid[r][c] = rawBit ^ maskBit;
      }
    }
    up = !up;
  }

  const fmt = computeFormatInfo(0);
  for (let i = 0; i < 15; i += 1) {
    const bit = (fmt >> i) & 1;
    if (i < 6) grid[8][i] = bit;
    else if (i < 8) grid[8][i + 1] = bit;
    else grid[8][size - 15 + i] = bit;

    if (i < 8) grid[size - 1 - i][8] = bit;
    else if (i < 9) grid[7][8] = bit;
    else grid[14 - i][8] = bit;
  }

  return grid;
}

export function renderQrPngDataUrl(text: string, pxSize = 240): string {
  if (typeof document === 'undefined') return '';
  const matrix = buildQrMatrix(text);
  const quiet = 3;
  const cells = matrix.length + quiet * 2;
  const scale = Math.max(4, Math.floor(pxSize / cells));
  const finalPx = cells * scale;
  const canvas = document.createElement('canvas');
  canvas.width = finalPx;
  canvas.height = finalPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, finalPx, finalPx);
  ctx.fillStyle = '#0F172A';
  for (let r = 0; r < matrix.length; r += 1) {
    for (let c = 0; c < matrix.length; c += 1) {
      if (matrix[r][c] === 1) {
        ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
      }
    }
  }
  return canvas.toDataURL('image/png');
}
