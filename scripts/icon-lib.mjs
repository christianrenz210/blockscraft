// Paints the BlocksCraft grass-block icon into PNG files with no image libraries
// (used for the Android launcher icon/splash and the website favicon).
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
export function pngSize(path) {
  const b = readFileSync(path);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

// Tiny deterministic 16x16 grass-block textures.
function hash(x, y, s) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const GRASS = [96, 160, 56], DIRT = [134, 96, 67];
function texel(face, tx, ty) {
  const n = 1 + (hash(tx, ty, face) - 0.5) * 0.3;
  if (face === 0) return GRASS.map((c) => c * n);
  const edge = 3 + Math.floor(hash(tx, 99, 7) * 3);
  return (ty < edge ? GRASS : DIRT).map((c) => c * n);
}

// Isometric cube laid out on a 64-unit grid (same layout as the in-game icons).
const FACES = [
  { o: [6, 17], ex: [26, -13], ey: [26, 13], shade: 1 },     // top
  { o: [6, 17], ex: [26, 13], ey: [0, 30], shade: 0.72 },    // left
  { o: [32, 30], ex: [26, -13], ey: [0, 30], shade: 0.55 },  // right
];
function blockColor(gx, gy) {
  for (let f = 0; f < 3; f++) {
    const { o, ex, ey, shade } = FACES[f];
    const dx = gx - o[0], dy = gy - o[1];
    const det = ex[0] * ey[1] - ex[1] * ey[0];
    const a = (dx * ey[1] - dy * ey[0]) / det;
    const b = (ex[0] * dy - ex[1] * dx) / det;
    if (a >= 0 && a < 1 && b >= 0 && b < 1) {
      const c = texel(f, Math.floor(a * 16), Math.floor(b * 16));
      return c.map((v) => Math.min(255, v * shade));
    }
  }
  return null;
}

// Draw an image: optional background (rounded square or full), cube scaled to `blockFrac`.
export function paintBlock(w, h, { bg = null, rounded = false, circle = false, blockFrac = 0.7 }) {
  const out = Buffer.alloc(w * h * 4);
  const size = Math.min(w, h) * blockFrac;
  const ox = (w - size) / 2, oy = (h - size) / 2;
  const r = Math.min(w, h) * 0.18;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let inside = true;
      if (circle) inside = Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2) <= w / 2;
      else if (rounded) {
        const cx = Math.min(Math.max(x + 0.5, r), w - r), cy = Math.min(Math.max(y + 0.5, r), h - r);
        inside = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;
      }
      if (bg && inside) {
        const t = y / h; // subtle vertical gradient
        const k = 1.06 - t * 0.14;
        out[i] = Math.min(255, bg[0] * k); out[i + 1] = Math.min(255, bg[1] * k); out[i + 2] = Math.min(255, bg[2] * k);
        out[i + 3] = 255;
      }
      const gx = ((x + 0.5 - ox) / size) * 64, gy = ((y + 0.5 - oy) / size) * 64;
      if (inside && gx >= 0 && gx < 64 && gy >= 0 && gy < 64) {
        const c = blockColor(gx, gy);
        if (c) { out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255; }
      }
    }
  }
  return encodePNG(w, h, out);
}