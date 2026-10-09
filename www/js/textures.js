// Procedurally painted 16x16 pixel-art textures packed into one atlas.
// No image files needed: everything is drawn with seeded random noise.
import { T, ATLAS_COLS, ATLAS_ROWS, BLOCKS, B } from './blocks.js';
import { mulberry32 } from './noise.js';

export const TILE = 16;

export function createAtlas() {
  const W = TILE * ATLAS_COLS, H = TILE * ATLAS_ROWS;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const rand = mulberry32(20240607);

  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  function set(tile, x, y, c, f = 1, a = 255) {
    const tx = (tile % ATLAS_COLS) * TILE + x;
    const ty = Math.floor(tile / ATLAS_COLS) * TILE + y;
    const i = (ty * W + tx) * 4;
    d[i] = clamp(c[0] * f); d[i + 1] = clamp(c[1] * f); d[i + 2] = clamp(c[2] * f); d[i + 3] = a;
  }
  function get(tile, x, y) {
    const tx = (tile % ATLAS_COLS) * TILE + x;
    const ty = Math.floor(tile / ATLAS_COLS) * TILE + y;
    const i = (ty * W + tx) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  }
  const vary = (v) => 1 + (rand() - 0.5) * v;
  function noiseFill(tile, c, v) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) set(tile, x, y, c, vary(v));
  }
  function copyTile(from, to) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) set(to, x, y, get(from, x, y));
  }

  // --- Grass / dirt ---
  const GRASS = [96, 160, 56];
  const DIRT = [134, 96, 67];
  noiseFill(T.GRASS_TOP, GRASS, 0.3);
  for (let i = 0; i < 30; i++) set(T.GRASS_TOP, (rand() * 16) | 0, (rand() * 16) | 0, GRASS, 0.75);

  noiseFill(T.DIRT, DIRT, 0.25);
  for (let i = 0; i < 25; i++) set(T.DIRT, (rand() * 16) | 0, (rand() * 16) | 0, DIRT, rand() < 0.5 ? 0.7 : 1.25);

  copyTile(T.DIRT, T.GRASS_SIDE);
  for (let x = 0; x < TILE; x++) {
    const h = 3 + ((rand() * 3) | 0);
    for (let y = 0; y < h; y++) set(T.GRASS_SIDE, x, y, GRASS, vary(0.3) * (y === h - 1 ? 0.8 : 1));
  }

  // --- Stone family ---
  const STONE = [125, 125, 125];
  noiseFill(T.STONE, STONE, 0.18);
  for (let i = 0; i < 6; i++) {
    let x = (rand() * 16) | 0, y = (rand() * 16) | 0;
    for (let j = 0; j < 4; j++) {
      set(T.STONE, x & 15, y & 15, STONE, 0.78);
      x += rand() < 0.5 ? 1 : 0; y += rand() < 0.5 ? 1 : -1;
    }
  }

  function ore(tile, color) {
    copyTile(T.STONE, tile);
    for (let i = 0; i < 5; i++) {
      const cx = 2 + ((rand() * 12) | 0), cy = 2 + ((rand() * 12) | 0);
      for (let j = 0; j < 4; j++) {
        const x = cx + ((rand() * 3) | 0) - 1, y = cy + ((rand() * 3) | 0) - 1;
        set(tile, x, y, color, vary(0.25));
      }
    }
  }
  ore(T.COAL_ORE, [35, 35, 35]);
  ore(T.IRON_ORE, [216, 175, 147]);
  ore(T.GOLD_ORE, [250, 215, 60]);

  // Cobblestone: voronoi-ish rounded stones with dark gaps.
  {
    const pts = [];
    for (let i = 0; i < 9; i++) pts.push([rand() * 16, rand() * 16, 0.85 + rand() * 0.35]);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      let d1 = 1e9, d2 = 1e9, best = 0;
      for (const p of pts) {
        for (let ox = -16; ox <= 16; ox += 16) for (let oy = -16; oy <= 16; oy += 16) {
          const dx = x - p[0] - ox, dy = y - p[1] - oy;
          const dd = dx * dx + dy * dy;
          if (dd < d1) { d2 = d1; d1 = dd; best = p[2]; } else if (dd < d2) d2 = dd;
        }
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1) < 1.1;
      set(T.COBBLE, x, y, STONE, edge ? 0.55 : best * vary(0.12));
    }
  }

  // Stone bricks
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const row = y >> 3;
    const bx = (x + (row ? 4 : 0)) & 15;
    const mortar = (y & 7) === 7 || (bx & 7) === 7;
    set(T.STONE_BRICK, x, y, STONE, mortar ? 0.6 : vary(0.12) * ((y & 7) === 0 || (bx & 7) === 0 ? 1.15 : 1));
  }

  // Bedrock
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const v = 40 + rand() * 70;
    set(T.BEDROCK, x, y, [v, v, v]);
  }

  // Gravel
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const r = rand();
    const c = r < 0.3 ? [150, 140, 135] : r < 0.6 ? [115, 110, 108] : r < 0.85 ? [95, 88, 85] : [160, 125, 110];
    set(T.GRAVEL, x, y, c, vary(0.15));
  }

  // --- Sand / snow ---
  noiseFill(T.SAND, [219, 207, 142], 0.12);
  noiseFill(T.SNOW, [240, 248, 255], 0.06);
  copyTile(T.DIRT, T.SNOW_SIDE);
  for (let x = 0; x < TILE; x++) {
    const h = 3 + ((rand() * 3) | 0);
    for (let y = 0; y < h; y++) set(T.SNOW_SIDE, x, y, [240, 248, 255], vary(0.06));
  }

  // --- Water ---
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const w = Math.sin((x + y * 0.5) * 0.8) * 0.5 + Math.sin((x * 0.5 - y) * 0.9) * 0.5;
    set(T.WATER, x, y, [50, 100, 215], 1 + w * 0.12 + (rand() - 0.5) * 0.05);
  }

  // --- Wood ---
  const BARK = [104, 83, 50];
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const stripe = (x % 4 === 0 ? 0.75 : 1) * (1 + Math.sin(x * 1.7) * 0.08);
    set(T.LOG_SIDE, x, y, BARK, stripe * vary(0.15));
  }
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const dx = x - 7.5, dy = y - 7.5;
    const r = Math.max(Math.abs(dx), Math.abs(dy));
    if (r > 6.5) set(T.LOG_TOP, x, y, BARK, vary(0.15));
    else set(T.LOG_TOP, x, y, [176, 143, 92], ((r | 0) % 2 === 0 ? 0.85 : 1) * vary(0.06));
  }

  const PLANK = [184, 148, 95];
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const board = y >> 2;
    const seam = (x + board * 5) % 16 === 0;
    const line = (y & 3) === 3;
    set(T.PLANKS, x, y, PLANK, line || seam ? 0.68 : vary(0.1) * (board % 2 ? 0.95 : 1.02));
  }

  // Bookshelf: plank frame + colorful book spines
  copyTile(T.PLANKS, T.BOOKSHELF);
  const BOOKS = [[160, 40, 40], [40, 80, 160], [60, 130, 60], [200, 170, 70], [110, 60, 130]];
  for (const shelfY of [1, 9]) {
    let x = 1;
    while (x < 15) {
      const w = 1 + ((rand() * 2) | 0);
      const c = BOOKS[(rand() * BOOKS.length) | 0];
      const top = shelfY + ((rand() * 2) | 0);
      for (let bx = x; bx < Math.min(x + w, 15); bx++) for (let y = top; y < shelfY + 6; y++) {
        set(T.BOOKSHELF, bx, y, c, vary(0.1) * (bx === x ? 1.15 : 1));
      }
      x += w;
    }
  }

  // --- Leaves (with holes for alpha-test) ---
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (rand() < 0.16) set(T.LEAVES, x, y, [0, 0, 0], 1, 0);
    else set(T.LEAVES, x, y, [58, 122, 38], vary(0.45));
  }

  // --- Glass ---
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const border = x === 0 || y === 0 || x === 15 || y === 15;
    const streak = (x - y === 3 || x - y === 4 || x - y === -7) && x > 2 && x < 13;
    if (border) set(T.GLASS, x, y, [200, 225, 235]);
    else if (streak) set(T.GLASS, x, y, [235, 245, 250]);
    else set(T.GLASS, x, y, [0, 0, 0], 1, 0);
  }

  // --- Bricks ---
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const row = y >> 2;
    const bx = (x + (row % 2) * 4) % 8;
    const mortar = (y & 3) === 3 || bx === 7;
    if (mortar) set(T.BRICK, x, y, [185, 175, 165], vary(0.08));
    else set(T.BRICK, x, y, [150, 62, 45], vary(0.18));
  }

  // --- Cloth ---
  function cloth(tile, c) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      set(tile, x, y, c, vary(0.1) * ((x + y) % 2 ? 0.96 : 1.04));
    }
  }
  cloth(T.CLOTH_RED, [180, 45, 45]);
  cloth(T.CLOTH_BLUE, [50, 70, 180]);
  cloth(T.CLOTH_YELLOW, [230, 200, 50]);
  cloth(T.CLOTH_WHITE, [228, 228, 228]);
  cloth(T.CLOTH_BLACK, [38, 38, 42]);

  // --- Cactus ---
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const ridge = x % 4 === 1 ? 0.75 : 1;
    const spike = x % 4 === 3 && y % 4 === 2;
    set(T.CACTUS_SIDE, x, y, spike ? [30, 40, 20] : [75, 140, 50], spike ? 1 : ridge * vary(0.12));
  }
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    set(T.CACTUS_TOP, x, y, [95, 160, 65], (r > 6.5 ? 0.75 : (r | 0) % 3 === 0 ? 0.9 : 1) * vary(0.08));
  }

  // --- Gold block ---
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const edge = x === 0 || y === 0 ? 1.18 : x === 15 || y === 15 ? 0.78 : 1;
    set(T.GOLD_BLOCK, x, y, [245, 205, 60], edge * vary(0.08));
  }

  // --- Pumpkin ---
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const ridge = 1 - Math.abs(Math.sin((x / 16) * Math.PI * 4)) * 0.18;
    set(T.PUMPKIN_SIDE, x, y, [222, 135, 30], ridge * vary(0.08));
  }
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const r = Math.hypot(x - 7.5, y - 7.5);
    if (r < 2) set(T.PUMPKIN_TOP, x, y, [90, 110, 40], vary(0.1));
    else set(T.PUMPKIN_TOP, x, y, [222, 135, 30], (1 - Math.abs(Math.sin(Math.atan2(y - 7.5, x - 7.5) * 4)) * 0.15) * vary(0.08));
  }

  // --- Door (bottom half has the knob, top half has two windows) ---
  const DOOR = [160, 118, 68];
  const FRAME = [110, 78, 42];
  for (const tile of [T.DOOR_BOTTOM, T.DOOR_TOP]) {
    const top = tile === T.DOOR_TOP;
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const frame = x < 2 || x > 13 || (top ? y < 2 : y > 13);
      const brace = !top && (y === 6 || y === 7);
      const window = top && y >= 3 && y <= 9 && ((x >= 3 && x <= 6) || (x >= 9 && x <= 12));
      if (window) set(tile, x, y, [0, 0, 0], 1, 0);
      else if (frame || brace) set(tile, x, y, FRAME, vary(0.1));
      else set(tile, x, y, DOOR, vary(0.1) * (x % 4 === 1 ? 0.85 : 1));
    }
  }
  set(T.DOOR_BOTTOM, 11, 1, [40, 40, 40]);
  set(T.DOOR_BOTTOM, 11, 2, [70, 70, 70]);

  // --- Bed ---
  const BLANKET = [176, 40, 44];
  const PILLOW = [236, 236, 230];
  const BEDWOOD = [150, 110, 66];
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const edge = x === 0 || x === 15;
    set(T.BED_TOP_FOOT, x, y, BLANKET, (edge ? 0.8 : 1) * vary(0.08) * (y === 14 ? 0.85 : 1));
    // Head end: pillow along the top rows of the tile (the +v direction).
    const pillow = y >= 1 && y <= 5 && x >= 2 && x <= 13;
    if (pillow) set(T.BED_TOP_HEAD, x, y, PILLOW, vary(0.04) * (y === 5 ? 0.88 : 1));
    else if (y <= 6) set(T.BED_TOP_HEAD, x, y, [220, 220, 214], vary(0.04));
    else set(T.BED_TOP_HEAD, x, y, BLANKET, (edge ? 0.8 : 1) * vary(0.08) * (y === 7 ? 1.15 : 1));
  }
  // Sides only show the bottom 9 rows (the bed is 9/16 tall).
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const leg = (x < 3 || x > 12) && y >= 14;
    set(T.BED_SIDE_FOOT, x, y, y < 11 ? BLANKET : y === 11 ? [120, 28, 30] : BEDWOOD,
      vary(0.08) * (y >= 14 && !leg ? 0.6 : 1));
    set(T.BED_SIDE_HEAD, x, y, y < 9 ? PILLOW : y < 11 ? BLANKET : y === 11 ? [120, 28, 30] : BEDWOOD,
      vary(0.08) * (y >= 14 && !leg ? 0.6 : 1));
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Draws a small item icon for a block (used in the hotbar/inventory): an isometric
// cube for normal blocks, a flat picture for the door and a low box for the bed.
export function makeBlockIcon(atlas, blockId, size = 48) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const src = (tile) => [(tile % ATLAS_COLS) * TILE, Math.floor(tile / ATLAS_COLS) * TILE];

  if (blockId === B.DOOR) {
    const w = size * 0.42, h = size * 0.42, x = (size - w) / 2, y = size / 2 - h;
    ctx.drawImage(atlas, ...src(T.DOOR_TOP), TILE, TILE, x, y, w, h);
    ctx.drawImage(atlas, ...src(T.DOOR_BOTTOM), TILE, TILE, x, y + h, w, h);
    return c.toDataURL();
  }

  const [top, , side] = BLOCKS[blockId].tiles;
  const height = blockId === B.BED ? 9 / 16 : 1;
  const s = size / 64; // geometry is designed on a 64px grid
  const k = s / TILE;
  const drop = (1 - height) * 30; // lower boxes sit at the bottom of the icon
  const cropY = (1 - height) * TILE; // show the bottom rows of side textures

  function face(tile, a, b, cc, dd, e, f, shade, crop) {
    const [sx, sy] = src(tile);
    ctx.setTransform(a * k, b * k, cc * k, dd * k, e * s, f * s);
    const hh = TILE - crop;
    ctx.drawImage(atlas, sx, sy + crop, TILE, hh, 0, 0, TILE, hh);
    if (shade > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(0,0,0,${shade})`;
      ctx.fillRect(0, 0, TILE, hh);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  face(side, 26, 13, 0, 30, 6, 17 + drop, 0.28, cropY); // left
  face(side, 26, -13, 0, 30, 32, 30 + drop, 0.45, cropY); // right
  face(top, 26, -13, 26, 13, 6, 17 + drop, 0, 0); // top
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return c.toDataURL();
}

export function tileDataURL(atlas, tile, scale = 4) {
  const c = document.createElement('canvas');
  c.width = c.height = TILE * scale;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const sx = (tile % ATLAS_COLS) * TILE, sy = Math.floor(tile / ATLAS_COLS) * TILE;
  ctx.drawImage(atlas, sx, sy, TILE, TILE, 0, 0, TILE * scale, TILE * scale);
  return c.toDataURL();
}
