/**
 * Minimal QR code encoder producing a boolean module matrix.
 *
 * Only the subset needed for the login QR code is implemented: byte mode,
 * error correction level L, versions 1..10. No canvas, DOM or image output is
 * involved, the caller decides how to render the matrix.
 */

const EC_LEVEL_L = 1;

// Format info: error correction level indicator, 2 bits.
const FORMAT_EC_BITS: { readonly [level: number]: number } = {
  1: 0b01, // L
  0: 0b00, // M
  3: 0b11, // Q
  2: 0b10, // H
};

// Total codewords per version, indexed by version (1..10).
const TOTAL_CODEWORDS: readonly number[] = [
  0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346,
];

// Error correction codewords for level L, indexed by version.
const EC_CODEWORDS: readonly number[] = [0, 7, 10, 15, 20, 26, 36, 40, 48, 60, 72];

// (total blocks, data blocks) for level L, indexed by version.
const BLOCK_STRUCTURE: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 1],
  [1, 1],
  [1, 1],
  [1, 1],
  [1, 1],
  [2, 2],
  [2, 2],
  [2, 2],
  [2, 2],
  [4, 4],
];

// Alignment pattern center coordinates per version.
const ALIGNMENT_POSITIONS: readonly (readonly number[])[] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

const MASK_COUNT = 8;

interface GfTables {
  readonly exp: Uint8Array;
  readonly log: Uint8Array;
}

function createGfTables(): GfTables {
  const exp = new Uint8Array(512);
  const log = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    exp[i] = x;
    log[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    exp[i] = exp[i - 255];
  }
  return { exp, log };
}

const GF = createGfTables();

function gfMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) {
    return 0;
  }
  return GF.exp[GF.log[a] + GF.log[b]];
}

function reedSolomonDivisor(degree: number): Uint8Array {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) {
        result[j] ^= result[j + 1];
      }
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
  const result = new Uint8Array(divisor.length);
  for (const byte of data) {
    const factor = byte ^ (result[0] ?? 0);
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < result.length; i++) {
      result[i] ^= gfMultiply(divisor[i], factor);
    }
  }
  return result;
}

class BitBuffer {
  private readonly bits: number[] = [];

  get length(): number {
    return this.bits.length;
  }

  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1);
    }
  }

  toBytes(): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(this.bits.length / 8));
    this.bits.forEach((bit, index) => {
      if (bit) {
        bytes[index >>> 3] |= 0x80 >>> (index & 7);
      }
    });
    return bytes;
  }
}

function charCountBitLength(version: number): number {
  return version <= 9 ? 8 : 16;
}

function encodeData(text: string, version: number, ecCodewords: number): Uint8Array {
  const totalCodewords = TOTAL_CODEWORDS[version];
  const dataCodewords = totalCodewords - ecCodewords;

  const buffer = new BitBuffer();
  buffer.push(0b0100, 4); // byte mode
  buffer.push(text.length, charCountBitLength(version));
  for (let i = 0; i < text.length; i++) {
    buffer.push(text.charCodeAt(i) & 0xff, 8);
  }

  const capacityBits = dataCodewords * 8;
  if (buffer.length > capacityBits) {
    throw new Error('QR code data too long');
  }

  // Terminator, then pad to a byte boundary.
  buffer.push(0, Math.min(4, capacityBits - buffer.length));
  buffer.push(0, (8 - (buffer.length % 8)) % 8);

  const bytes = buffer.toBytes();
  const padded = new Uint8Array(dataCodewords);
  padded.set(bytes);
  // Alternating pad codewords.
  for (let i = bytes.length, pad = 0xec; i < dataCodewords; i++, pad ^= 0xec ^ 0x11) {
    padded[i] = pad;
  }
  return padded;
}

function interleave(
  data: Uint8Array,
  version: number,
  ecCodewords: number
): Uint8Array {
  const dataCodewords = data.length;
  const [totalBlocks] = BLOCK_STRUCTURE[version];
  const shortBlockSize = Math.floor(dataCodewords / totalBlocks);
  const longBlockCount = dataCodewords % totalBlocks;
  const ecPerBlock = Math.floor(ecCodewords / totalBlocks);

  const dataChunks: Uint8Array[] = [];
  const ecChunks: Uint8Array[] = [];
  const divisor = reedSolomonDivisor(ecPerBlock);

  // Blocks with an extra codeword come last, per the specification.
  const offsetOf = (index: number): number =>
    index * shortBlockSize + Math.max(0, index - (totalBlocks - longBlockCount));

  for (let i = 0; i < totalBlocks; i++) {
    const size = shortBlockSize + (i >= totalBlocks - longBlockCount ? 1 : 0);
    const chunk = data.subarray(offsetOf(i), offsetOf(i) + size);
    dataChunks.push(chunk);
    ecChunks.push(reedSolomonRemainder(chunk, divisor));
  }

  const result = new Uint8Array(dataCodewords + ecPerBlock * totalBlocks);
  const dataLength = Math.max(...dataChunks.map((chunk) => chunk.length));
  let index = 0;
  for (let i = 0; i < dataLength; i++) {
    for (const chunk of dataChunks) {
      if (i < chunk.length) {
        result[index++] = chunk[i];
      }
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const chunk of ecChunks) {
      result[index++] = chunk[i];
    }
  }
  return result;
}

function formatInfoBits(ecLevel: number, mask: number): number {
  // 5 data bits followed by 10 BCH error correction bits.
  const data = (FORMAT_EC_BITS[ecLevel] << 3) | mask;
  let remainder = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((remainder >>> i) & 1) {
      remainder ^= 0x537 << (i - 10);
    }
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

function maskCondition(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

/**
 * Encode `text` into a QR code module matrix.
 *
 * @param text content to encode
 * @param border number of quiet zone modules to add on each side
 * @returns row-major matrix, `true` marks a dark module
 */
export function encodeQrMatrix(text: string, border: number = 4): boolean[][] {
  const version = guessVersion(text);
  const ecCodewords = EC_CODEWORDS[version];
  const data = encodeData(text, version, ecCodewords);
  const codewords = interleave(data, version, ecCodewords);

  const size = version * 4 + 17;
  const modules: (boolean | null)[][] = Array.from({ length: size }, () =>
    new Array<boolean | null>(size).fill(null)
  );
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false)
  );

  drawFunctionPatterns(modules, reserved, version);

  let bitIndex = 0;
  const totalBits = codewords.length * 8;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) {
      col--; // skip the vertical timing column
    }
    for (let i = 0; i < size; i++) {
      const upward = ((col + 1) & 2) === 0;
      const row = upward ? size - 1 - i : i;
      for (let j = 0; j < 2; j++) {
        const currentCol = col - j;
        if (reserved[row][currentCol]) {
          continue;
        }
        let dark = false;
        if (bitIndex < totalBits) {
          const byte = codewords[bitIndex >>> 3];
          dark = ((byte >>> (7 - (bitIndex & 7))) & 1) !== 0;
        }
        modules[row][currentCol] = dark;
        bitIndex++;
      }
    }
  }

  const mask = chooseMask(modules, reserved, size);
  applyMask(modules, reserved, size, mask);
  drawFormatBits(modules, size, EC_LEVEL_L, mask);

  const result: boolean[][] = [];
  const padding = Math.max(0, border);
  for (let i = 0; i < size + padding * 2; i++) {
    const row: boolean[] = new Array(size + padding * 2).fill(false);
    if (i >= padding && i < size + padding) {
      for (let j = 0; j < size; j++) {
        row[j + padding] = modules[i - padding][j] === true;
      }
    }
    result.push(row);
  }
  return result;
}

function guessVersion(text: string): number {
  for (let version = 1; version <= 10; version++) {
    const dataCodewords = TOTAL_CODEWORDS[version] - EC_CODEWORDS[version];
    const capacityBits = dataCodewords * 8;
    const neededBits = 4 + charCountBitLength(version) + text.length * 8;
    if (neededBits <= capacityBits) {
      return version;
    }
  }
  throw new Error('QR code data too long');
}

function drawFunctionPatterns(
  modules: (boolean | null)[][],
  reserved: boolean[][],
  version: number
): void {
  const size = modules.length;

  // Finder patterns and separators.
  const drawFinder = (row: number, col: number): void => {
    for (let i = -1; i <= 7; i++) {
      for (let j = -1; j <= 7; j++) {
        const r = row + i;
        const c = col + j;
        if (r < 0 || r >= size || c < 0 || c >= size) {
          continue;
        }
        const inRing =
          (i >= 0 && i <= 6 && (j === 0 || j === 6)) ||
          (j >= 0 && j <= 6 && (i === 0 || i === 6));
        const inCore = i >= 2 && i <= 4 && j >= 2 && j <= 4;
        modules[r][c] = inRing || inCore;
        reserved[r][c] = true;
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    modules[6][i] = dark;
    reserved[6][i] = true;
    modules[i][6] = dark;
    reserved[i][6] = true;
  }

  // Alignment patterns.
  const positions = ALIGNMENT_POSITIONS[version];
  for (const row of positions) {
    for (const col of positions) {
      if (reserved[row][col]) {
        continue;
      }
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          const r = row + i;
          const c = col + j;
          if (r < 0 || r >= size || c < 0 || c >= size) {
            continue;
          }
          modules[r][c] =
            Math.max(Math.abs(i), Math.abs(j)) !== 1;
          reserved[r][c] = true;
        }
      }
    }
  }

  // Reserve format information areas.
  for (let i = 0; i <= 8; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
  modules[size - 8][8] = true; // fixed dark module
}

function drawFormatBits(
  modules: (boolean | null)[][],
  size: number,
  ecLevel: number,
  mask: number,
  blank: boolean = false
): void {
  const bits = formatInfoBits(ecLevel, mask);
  // In blank mode the format area is cleared instead of written, which is how
  // the mask penalty is evaluated.
  const bit = (index: number): boolean =>
    !blank && ((bits >>> index) & 1) !== 0;

  // Vertical copy, upward along column 8.
  for (let i = 0; i < 15; i++) {
    let row: number;
    if (i < 6) {
      row = i;
    } else if (i < 8) {
      row = i + 1;
    } else {
      row = size - 15 + i;
    }
    modules[row][8] = bit(i);
  }

  // Horizontal copy, leftward along row 8.
  for (let i = 0; i < 15; i++) {
    let col: number;
    if (i < 8) {
      col = size - i - 1;
    } else if (i < 9) {
      col = 15 - i;
    } else {
      col = 14 - i;
    }
    modules[8][col] = bit(i);
  }

  modules[size - 8][8] = !blank; // fixed dark module
}

function applyMask(
  modules: (boolean | null)[][],
  reserved: boolean[][],
  size: number,
  mask: number
): void {
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!reserved[row][col] && maskCondition(mask, row, col)) {
        modules[row][col] = !modules[row][col];
      }
    }
  }
}

function chooseMask(
  modules: (boolean | null)[][],
  reserved: boolean[][],
  size: number
): number {
  let bestMask = 0;
  let bestScore = Infinity;
  // Captured before any mask is applied: masking toggles modules in place, so
  // each candidate must start from this pristine state.
  const unmasked: (boolean | null)[][] = modules.map((row) => row.slice());
  for (let mask = 0; mask < MASK_COUNT; mask++) {
    for (let i = 0; i < size; i++) {
      modules[i] = unmasked[i].slice();
    }
    applyMask(modules, reserved, size, mask);
    // Format bits are not drawn while scoring; their positions stay light.
    drawFormatBits(modules, size, EC_LEVEL_L, mask, true);
    const score = penaltyScore(modules, size);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
    }
  }
  for (let i = 0; i < size; i++) {
    modules[i] = unmasked[i].slice();
  }
  return bestMask;
}

function penaltyScore(modules: (boolean | null)[][], size: number): number {
  return (
    penaltyRule1(modules, size) +
    penaltyRule2(modules, size) +
    penaltyRule3(modules, size) +
    penaltyRule4(modules, size)
  );
}

function penaltyRule1(modules: (boolean | null)[][], size: number): number {
  let score = 0;

  // Rule 1: runs of five or more same-coloured modules.
  const runs = (getter: (index: number, offset: number) => boolean | null) => {
    for (let a = 0; a < size; a++) {
      let runColor: boolean | null = getter(a, 0);
      let runLength = 0;
      for (let b = 0; b < size; b++) {
        const color = getter(a, b);
        if (color === runColor) {
          runLength++;
        } else {
          if (runLength >= 5) {
            score += runLength - 2;
          }
          runColor = color;
          runLength = 1;
        }
      }
      if (runLength >= 5) {
        score += runLength - 2;
      }
    }
  };
  runs((row, col) => modules[row][col]);
  runs((col, row) => modules[row][col]);
  return score;
}

function penaltyRule2(modules: (boolean | null)[][], size: number): number {
  let score = 0;

  // Rule 2: 2x2 blocks of the same colour.
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const color = modules[row][col];
      if (
        color === modules[row][col + 1] &&
        color === modules[row + 1][col] &&
        color === modules[row + 1][col + 1]
      ) {
        score += 3;
      }
    }
  }
  return score;
}

function penaltyRule3(modules: (boolean | null)[][], size: number): number {
  let score = 0;

  // Rule 3: the 1:1:3:1:1 finder-like pattern preceded or followed by a
  // four module wide light area, matched over an 11 module window.
  const matchesFinderLike = (get: (i: number) => boolean | null): boolean => {
    const at = (i: number): boolean => get(i) === true;
    const light = (i: number): boolean => get(i) === false;
    // 10111010000
    const forward =
      at(0) &&
      light(1) &&
      at(2) &&
      at(3) &&
      at(4) &&
      light(5) &&
      at(6) &&
      light(7) &&
      light(8) &&
      light(9) &&
      light(10);
    // 00001011101
    const backward =
      light(0) &&
      light(1) &&
      light(2) &&
      light(3) &&
      at(4) &&
      light(5) &&
      at(6) &&
      at(7) &&
      at(8) &&
      light(9) &&
      at(10);
    return forward || backward;
  };
  for (let row = 0; row < size; row++) {
    for (let col = 0; col + 10 < size; col++) {
      if (matchesFinderLike((i) => modules[row][col + i])) {
        score += 40;
      }
    }
  }
  for (let col = 0; col < size; col++) {
    for (let row = 0; row + 10 < size; row++) {
      if (matchesFinderLike((i) => modules[row + i][col])) {
        score += 40;
      }
    }
  }
  return score;
}

function penaltyRule4(modules: (boolean | null)[][], size: number): number {
  // Rule 4: deviation from a 50% dark module ratio.
  let darkCount = 0;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (modules[row][col]) {
        darkCount++;
      }
    }
  }
  const total = size * size;
  const percent = (darkCount * 100) / total;
  return Math.floor(Math.abs(percent - 50) / 5) * 10;
}
