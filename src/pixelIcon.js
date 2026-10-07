// The app icon as pixel art (a page with a check mark), drawn pixel by pixel in the Windows 98 16-color palette.
// Hand-tuned 16x16 and 32x32 versions; bigger sizes are those pixels scaled up with hard edges.
import zlib from 'node:zlib';

const PALETTE = {
  '.': [0, 0, 0, 0], // transparent
  K: [0, 0, 0, 255], // black outline
  W: [255, 255, 255, 255], // page
  G: [192, 192, 192, 255], // folded corner
  D: [128, 128, 128, 255], // drop shadow
  N: [0, 0, 128, 255], // text lines
  g: [0, 128, 0, 255], // check mark
  L: [0, 255, 0, 255], // check mark highlight
};

const LAYOUTS = {
  16: { l: 2, r: 11, t: 1, b: 14, fold: 3, lines: [[5, 4, 7], [7, 4, 9], [9, 4, 6]], check: [[5, 10], [7, 12], [13, 6]], pen: 2, outline8: false },
  32: {
    l: 5, r: 23, t: 2, b: 28, fold: 7,
    lines: [[8, 9, 15], [11, 9, 19], [14, 9, 19], [17, 9, 14]],
    check: [[11, 21], [15, 25], [27, 13]], pen: 3, outline8: true,
  },
};

/** Returns rows of palette letters, e.g. ["..KKKK..", ...]. */
export function drawIcon(n) {
  const s = LAYOUTS[n];
  const px = Array.from({ length: n }, () => Array(n).fill('.'));
  const set = (x, y, c) => {
    if (x >= 0 && y >= 0 && x < n && y < n) px[y][x] = c;
  };
  const inPage = (x, y) => x >= s.l && x <= s.r && y >= s.t && y <= s.b && !(x - (s.r - s.fold) > y - s.t);

  // page with a 1px drop shadow, black outline, white fill
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (inPage(x, y)) {
        const edge = !inPage(x - 1, y) || !inPage(x + 1, y) || !inPage(x, y - 1) || !inPage(x, y + 1);
        set(x, y, edge ? 'K' : 'W');
      } else if (inPage(x - 1, y - 1)) set(x, y, 'D');
    }
  }
  // folded corner
  const fx = s.r - s.fold;
  for (let y = s.t; y <= s.t + s.fold; y++) {
    for (let x = fx; x <= s.r; x++) {
      if (x - fx > y - s.t) continue;
      set(x, y, x === fx || y === s.t + s.fold || x - fx === y - s.t ? 'K' : 'G');
    }
  }
  // "text" lines
  for (const [y, x1, x2] of s.lines) for (let x = x1; x <= x2; x++) set(x, y, 'N');

  // check mark: thick strokes between points
  const mask = new Set();
  const stamp = (x, y) => {
    const lo = s.pen === 3 ? -1 : 0;
    for (let dy = lo; dy < lo + s.pen; dy++) for (let dx = lo; dx < lo + s.pen; dx++) mask.add(`${x + dx},${y + dy}`);
  };
  for (let i = 0; i < s.check.length - 1; i++) {
    let [x0, y0] = s.check[i];
    const [x1, y1] = s.check[i + 1];
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      stamp(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  const has = (x, y) => mask.has(`${x},${y}`);
  const near = s.outline8
    ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
    : [[0, -1], [-1, 0], [1, 0], [0, 1]];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!has(x, y) && near.some(([dx, dy]) => has(x + dx, y + dy))) set(x, y, 'K');
    }
  }
  for (const key of mask) {
    const [x, y] = key.split(',').map(Number);
    set(x, y, has(x, y - 1) ? 'g' : 'L');
  }
  return px.map((row) => row.join(''));
}

/** Encode rows of palette letters as a PNG, each pixel blown up to scale x scale. */
export function encodePng(rows, scale = 1) {
  const n = rows.length * scale;
  const raw = Buffer.alloc((n * 4 + 1) * n);
  for (let y = 0; y < n; y++) {
    const row = rows[Math.floor(y / scale)];
    raw[y * (n * 4 + 1)] = 0; // no filter
    for (let x = 0; x < n; x++) {
      const [r, g, b, a] = PALETTE[row[Math.floor(x / scale)]];
      raw.set([r, g, b, a], y * (n * 4 + 1) + 1 + x * 4);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
