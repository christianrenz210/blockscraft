// Chunked voxel world: terrain generation, block storage, meshing and raycasts.
import * as THREE from 'three';
import { B, BLOCKS, IS_OPAQUE, IS_SOLID, RENDER, ATLAS_COLS, ATLAS_ROWS } from './blocks.js';
import { Simplex, hash2, hash3 } from './noise.js';

export const CS = 16; // chunk size (x/z)
export const CH = 96; // world height
export const SEA = 34;

const PX = CS + 2; // padded size used during meshing
const PXZ = PX * PX;

const key = (cx, cz) => cx + ',' + cz;
const idx = (x, y, z) => x + z * CS + y * CS * CS;

// ---------------------------------------------------------------------------
// Face tables (built once). Faces: 0 +X, 1 -X, 2 +Y, 3 -Y, 4 +Z, 5 -Z
// ---------------------------------------------------------------------------
const FACE_SHADE = [0.62, 0.62, 1.0, 0.5, 0.8, 0.8];
const AO_CURVE = [0.45, 0.65, 0.82, 1.0];
const FACES = [];
{
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  // For each normal axis, which axes act as the face's (u, v) texture axes.
  const uvAxes = { 0: [2, 1], 1: [0, 2], 2: [0, 1] };
  const pstride = [1, PXZ, PX]; // padded-array stride for x, y, z
  for (let f = 0; f < 6; f++) {
    const n = dirs[f];
    const a = n[0] ? 0 : n[1] ? 1 : 2;
    const s = n[a] > 0 ? 1 : 0;
    const [ua, va] = uvAxes[a];
    let corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => {
      const p = [0, 0, 0];
      p[a] = s; p[ua] = u; p[va] = v;
      return { p, u, v };
    });
    // Make sure the quad winds counter-clockwise when seen from outside.
    const [p0, p1, p2] = corners.map((c) => c.p);
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) corners = corners.reverse();

    const nOff = n[0] * pstride[0] + n[1] * pstride[1] + n[2] * pstride[2];
    const ao = corners.map((c) => {
      const du = (c.p[ua] ? 1 : -1) * pstride[ua];
      const dv = (c.p[va] ? 1 : -1) * pstride[va];
      return [nOff + du, nOff + dv, nOff + du + dv];
    });
    FACES.push({ n, corners, nOff, ao, tile: f === 2 ? 0 : f === 3 ? 1 : 2 });
  }
}

const EPS = 0.001;
function tileUV(tile, u, v) {
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  u = EPS + u * (1 - 2 * EPS);
  v = EPS + v * (1 - 2 * EPS);
  return [(col + u) / ATLAS_COLS, 1 - (row + 1 - v) / ATLAS_ROWS];
}

class MeshBuffer {
  constructor() { this.pos = []; this.uv = []; this.col = []; this.ind = []; this.count = 0; }
}

// ---------------------------------------------------------------------------

export class World {
  constructor(scene, seed, materials, savedMods = null) {
    this.scene = scene;
    this.seed = seed;
    this.materials = materials;
    this.chunks = new Map();
    this.mods = new Map(); // chunkKey -> Map(blockIndex -> blockId)
    this.queue = [];
    this.centerKey = null;
    this.renderDist = 4;
    this.dirty = new Set();
    this.n1 = new Simplex(seed);
    this.n2 = new Simplex(seed + 101);
    this.n3 = new Simplex(seed + 202);
    this.n4 = new Simplex(seed + 303);
    this.pad = new Uint8Array(PX * PX * (CH + 2));
    if (savedMods) this.loadMods(savedMods);
  }

  // ---------------------------------------------------------------- terrain
  columnInfo(wx, wz) {
    const cont = this.n1.fbm2(wx * 0.0022, wz * 0.0022, 3);
    const hills = this.n2.fbm2(wx * 0.011, wz * 0.011, 4);
    const ridge = 1 - Math.abs(this.n3.noise2(wx * 0.005, wz * 0.005));
    const mountain = Math.max(0, cont + 0.1) * ridge * ridge * ridge;
    let h = SEA + 3 + cont * 16 + hills * 7 + mountain * 42;
    h = Math.max(4, Math.min(CH - 14, Math.floor(h)));
    const temp = this.n4.noise2(wx * 0.0016, wz * 0.0016);
    const biome = temp > 0.32 ? 'desert' : temp < -0.38 || h > SEA + 34 ? 'snow' : 'plains';
    const forest = this.n4.noise2(wx * 0.02 + 500, wz * 0.02 - 500);
    return { h, biome, forest };
  }

  generate(cx, cz) {
    const data = new Uint8Array(CS * CS * CH);
    const seed = this.seed;
    const x0 = cx * CS, z0 = cz * CS;
    const M = 2; // margin for trees that overlap from neighbouring chunks
    const SPAN = CS + 2 * M;
    const infos = new Array(SPAN * SPAN);
    for (let z = -M; z < CS + M; z++) {
      for (let x = -M; x < CS + M; x++) infos[(x + M) + (z + M) * SPAN] = this.columnInfo(x0 + x, z0 + z);
    }

    for (let z = 0; z < CS; z++) {
      for (let x = 0; x < CS; x++) {
        const wx = x0 + x, wz = z0 + z;
        const { h, biome } = infos[(x + M) + (z + M) * SPAN];
        const beach = h <= SEA + 1 && h >= SEA - 3;
        let top, filler;
        if (h < SEA - 3) { top = hash2(seed, wx, wz) < 0.5 ? B.GRAVEL : B.SAND; filler = B.SAND; }
        else if (biome === 'desert' || beach) { top = B.SAND; filler = B.SAND; }
        else if (biome === 'snow') { top = B.SNOW; filler = B.DIRT; }
        else { top = B.GRASS; filler = B.DIRT; }
        if (h > SEA + 40) { top = B.SNOW; filler = B.STONE; }

        for (let y = 0; y < CH; y++) {
          let id = B.AIR;
          if (y === 0) id = B.BEDROCK;
          else if (y === 1 && hash3(seed, wx, y, wz) < 0.5) id = B.BEDROCK;
          else if (y < h - 3) {
            id = B.STONE;
            const r = hash3(seed + 7, wx, y, wz);
            if (r < 0.011) id = B.COAL_ORE;
            else if (r < 0.016 && y < 48) id = B.IRON_ORE;
            else if (r < 0.0185 && y < 24) id = B.GOLD_ORE;
          } else if (y < h) id = filler;
          else if (y === h) id = top;
          else if (y <= SEA) id = B.WATER;
          data[idx(x, y, z)] = id;
        }

        // Spaghetti caves: carve where two 3D noise fields are both near zero.
        const caveTop = Math.min(h - 5, CH - 1);
        for (let y = 2; y < caveTop; y++) {
          const a = this.n2.noise3(wx * 0.045, y * 0.07, wz * 0.045);
          const b = this.n3.noise3(wx * 0.045 + 300, y * 0.07, wz * 0.045);
          if (a * a + b * b < 0.011) data[idx(x, y, z)] = B.AIR;
        }
      }
    }

    // Trees / cacti (deterministic per world column, so they line up across chunks)
    const setIfAir = (x, y, z, id) => {
      if (x < 0 || x >= CS || z < 0 || z >= CS || y < 0 || y >= CH) return;
      const i = idx(x, y, z);
      if (data[i] === B.AIR) data[i] = id;
    };
    const setForce = (x, y, z, id) => {
      if (x < 0 || x >= CS || z < 0 || z >= CS || y < 0 || y >= CH) return;
      data[idx(x, y, z)] = id;
    };
    for (let z = -M; z < CS + M; z++) {
      for (let x = -M; x < CS + M; x++) {
        const wx = x0 + x, wz = z0 + z;
        const { h, biome, forest } = infos[(x + M) + (z + M) * SPAN];
        if (h <= SEA + 1 || h > SEA + 38) continue;
        const r = hash2(seed + 999, wx, wz);
        if (biome === 'desert') {
          if (r < 0.004 && x >= 0 && x < CS && z >= 0 && z < CS) {
            const ch = 1 + Math.floor(hash2(seed + 5, wx, wz) * 3);
            for (let i = 1; i <= ch; i++) setForce(x, h + i, z, B.CACTUS);
          }
          continue;
        }
        const chance = forest > 0.25 ? 0.045 : forest > 0 ? 0.012 : 0.003;
        if (r >= chance) continue;
        const th = 4 + Math.floor(hash2(seed + 3, wx, wz) * 3);
        const base = h + 1;
        for (let dy = th - 3; dy <= th + 1; dy++) {
          const rad = dy >= th ? 1 : 2;
          for (let dz = -rad; dz <= rad; dz++) {
            for (let dx = -rad; dx <= rad; dx++) {
              const corner = Math.abs(dx) === rad && Math.abs(dz) === rad;
              if (corner && (dy === th + 1 || hash3(seed, wx + dx, base + dy, wz + dz) < 0.5)) continue;
              setIfAir(x + dx, base + dy, z + dz, B.LEAVES);
            }
          }
        }
        for (let i = 0; i < th; i++) setForce(x, base + i, z, B.LOG);
        setForce(x, h, z, B.DIRT);
      }
    }

    // Apply the player's saved edits.
    const m = this.mods.get(key(cx, cz));
    if (m) for (const [i, id] of m) data[i] = id;

    const chunk = { cx, cz, data, meshes: null, built: false };
    this.chunks.set(key(cx, cz), chunk);
    return chunk;
  }

  // ----------------------------------------------------------------- access
  getChunk(cx, cz) { return this.chunks.get(key(cx, cz)); }

  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= CH) return B.AIR;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.chunks.get(key(cx, cz));
    if (!c) return B.AIR;
    return c.data[idx(x - cx * CS, y, z - cz * CS)];
  }

  isLoaded(x, z) {
    return this.chunks.has(key(Math.floor(x / CS), Math.floor(z / CS)));
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= CH) return false;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.chunks.get(key(cx, cz));
    if (!c) return false;
    const lx = x - cx * CS, lz = z - cz * CS;
    const i = idx(lx, y, lz);
    c.data[i] = id;
    const k = key(cx, cz);
    if (!this.mods.has(k)) this.mods.set(k, new Map());
    this.mods.get(k).set(i, id);
    this.dirty.add(k);
    if (lx === 0) this.dirty.add(key(cx - 1, cz));
    if (lx === CS - 1) this.dirty.add(key(cx + 1, cz));
    if (lz === 0) this.dirty.add(key(cx, cz - 1));
    if (lz === CS - 1) this.dirty.add(key(cx, cz + 1));
    return true;
  }

  // Y of the highest solid block in a loaded column (-1 if none).
  topSolidY(x, z) {
    for (let y = CH - 1; y >= 0; y--) if (this.isSolid(x, y, z)) return y;
    return -1;
  }

  // --------------------------------------------------------------- meshing
  buildMesh(chunk) {
    const { cx, cz } = chunk;
    const pad = this.pad;
    pad.fill(0);
    // Copy this chunk plus a 1-block border from its neighbours into `pad`.
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = this.chunks.get(key(cx + dx, cz + dz));
        if (!n) continue;
        const xs = dx === -1 ? CS - 1 : 0, xe = dx === 1 ? 1 : CS;
        const zs = dz === -1 ? CS - 1 : 0, ze = dz === 1 ? 1 : CS;
        const ox = dx * CS + 1, oz = dz * CS + 1;
        const nd = n.data;
        for (let y = 0; y < CH; y++) {
          for (let z = zs; z < ze; z++) {
            const src = z * CS + y * CS * CS;
            const dst = (z + oz) * PX + (y + 1) * PXZ + ox;
            for (let x = xs; x < xe; x++) pad[dst + x] = nd[src + x];
          }
        }
      }
    }
    // Below the world counts as solid so the bedrock floor isn't drawn.
    for (let i = 0; i < PXZ; i++) pad[i] = B.BEDROCK;

    const bufs = { opaque: new MeshBuffer(), cutout: new MeshBuffer(), liquid: new MeshBuffer() };

    for (let y = 0; y < CH; y++) {
      for (let z = 0; z < CS; z++) {
        let pi = 1 + (z + 1) * PX + (y + 1) * PXZ;
        for (let x = 0; x < CS; x++, pi++) {
          const id = pad[pi];
          if (id === B.AIR) continue;
          const render = RENDER[id];
          const tiles = BLOCKS[id].tiles;
          const buf = bufs[render];
          const liquid = render === 'liquid';
          const waterTop = liquid && pad[pi + PXZ] !== B.WATER;

          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            const nid = pad[pi + face.nOff];
            if (IS_OPAQUE[nid]) continue;
            if (nid === id && id !== B.LEAVES) continue;

            const tile = tiles[face.tile];
            const shade = FACE_SHADE[f];
            const base = buf.count;
            const aos = [3, 3, 3, 3];
            for (let c = 0; c < 4; c++) {
              const corner = face.corners[c];
              let py = corner.p[1];
              if (waterTop && py === 1) py = 0.88;
              buf.pos.push(x + corner.p[0], y + py, z + corner.p[2]);
              const [u, v] = tileUV(tile, corner.u, corner.v);
              buf.uv.push(u, v);
              let ao = 3;
              if (!liquid) {
                const o = face.ao[c];
                const s1 = IS_OPAQUE[pad[pi + o[0]]], s2 = IS_OPAQUE[pad[pi + o[1]]], cn = IS_OPAQUE[pad[pi + o[2]]];
                ao = s1 && s2 ? 0 : 3 - (s1 + s2 + cn);
              }
              aos[c] = ao;
              const l = shade * AO_CURVE[ao];
              buf.col.push(l, l, l);
            }
            if (aos[0] + aos[2] < aos[1] + aos[3]) {
              buf.ind.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
            } else {
              buf.ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
            }
            buf.count += 4;
          }
        }
      }
    }

    this.disposeMeshes(chunk);
    chunk.meshes = [];
    for (const type of ['opaque', 'cutout', 'liquid']) {
      const b = bufs[type];
      if (b.count === 0) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setIndex(b.count > 65535 ? new THREE.Uint32BufferAttribute(b.ind, 1) : new THREE.Uint16BufferAttribute(b.ind, 1));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, this.materials[type]);
      mesh.position.set(cx * CS, 0, cz * CS);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      if (type === 'liquid') mesh.renderOrder = 1;
      this.scene.add(mesh);
      chunk.meshes.push(mesh);
    }
    chunk.built = true;
  }

  disposeMeshes(chunk) {
    if (!chunk.meshes) return;
    for (const m of chunk.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    chunk.meshes = null;
  }

  // ------------------------------------------------------------ streaming
  hasNeighbours(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) if (!this.chunks.has(key(cx + dx, cz + dz))) return false;
    }
    return true;
  }

  // Generate/mesh chunks around (px, pz) within a per-frame time budget.
  update(px, pz, budgetMs = 6) {
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
    const R = this.renderDist;
    const ck = pcx + ',' + pcz + ',' + R;
    if (ck !== this.centerKey) {
      this.centerKey = ck;
      const q = [];
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = dx * dx + dz * dz;
          if (d <= R * R + 1) q.push({ cx: pcx + dx, cz: pcz + dz, d });
        }
      }
      q.sort((a, b) => a.d - b.d);
      this.queue = q;
      // Unload far chunks.
      const far = (R + 2) * (R + 2) + 2;
      for (const [k, c] of this.chunks) {
        const dx = c.cx - pcx, dz = c.cz - pcz;
        if (dx * dx + dz * dz > far) {
          this.disposeMeshes(c);
          this.chunks.delete(k);
        }
      }
    }

    // Edited chunks are rebuilt right away so block changes feel instant.
    for (const k of this.dirty) {
      const c = this.chunks.get(k);
      if (c && c.built) this.buildMesh(c);
    }
    this.dirty.clear();

    const start = performance.now();
    let i = 0;
    while (i < this.queue.length && performance.now() - start < budgetMs) {
      const { cx, cz } = this.queue[i];
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!this.chunks.has(key(cx + dx, cz + dz))) this.generate(cx + dx, cz + dz);
        }
      }
      const c = this.chunks.get(key(cx, cz));
      if (!c.built) this.buildMesh(c);
      i++;
    }
    this.queue.splice(0, i);
    return this.queue.length;
  }

  // ------------------------------------------------------------- raycast
  // Voxel DDA. Returns the first targetable block hit, plus the face normal.
  raycast(origin, dir, maxDist) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
    const tdx = sx ? Math.abs(1 / dir.x) : Infinity;
    const tdy = sy ? Math.abs(1 / dir.y) : Infinity;
    const tdz = sz ? Math.abs(1 / dir.z) : Infinity;
    let tmx = sx > 0 ? (x + 1 - origin.x) * tdx : sx < 0 ? (origin.x - x) * tdx : Infinity;
    let tmy = sy > 0 ? (y + 1 - origin.y) * tdy : sy < 0 ? (origin.y - y) * tdy : Infinity;
    let tmz = sz > 0 ? (z + 1 - origin.z) * tdz : sz < 0 ? (origin.z - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    while (t <= maxDist) {
      const id = this.getBlock(x, y, z);
      if (id !== B.AIR && id !== B.WATER) return { x, y, z, id, nx, ny, nz };
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }

  isSolid(x, y, z) { return IS_SOLID[this.getBlock(x, y, z)] === 1; }

  // ------------------------------------------------------------ saving
  serializeMods() {
    const out = {};
    for (const [k, m] of this.mods) {
      const arr = [];
      for (const [i, id] of m) arr.push(i, id);
      if (arr.length) out[k] = arr;
    }
    return out;
  }

  loadMods(obj) {
    for (const k of Object.keys(obj)) {
      const arr = obj[k];
      const m = new Map();
      for (let i = 0; i + 1 < arr.length; i += 2) m.set(arr[i], arr[i + 1]);
      this.mods.set(k, m);
    }
  }

  dispose() {
    for (const c of this.chunks.values()) this.disposeMeshes(c);
    this.chunks.clear();
  }
}
