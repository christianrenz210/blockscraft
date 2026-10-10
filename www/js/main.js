// BlocksCraft - entry point: renderer, game loop, menus and HUD.
import * as THREE from '../lib/three.module.min.js';
import {
  B, BLOCKS, PLACEABLE, DEFAULT_HOTBAR, T, IS_SOLID, ATLAS_COLS, FACING_DIRS, facingFromYaw,
  isDoor, isBed, doorId, doorFacing, doorOpen, doorUpper, doorMirror, doorHingeDir, bedId, bedFacing, bedHead, itemOf,
} from './blocks.js';
import { createAtlas, makeBlockIcon, tileDataURL, TILE } from './textures.js';
import { World, CS, CH, SEA } from './world.js';
import { Player } from './player.js';
import { Input, isTouchDevice } from './input.js';
import { initAudio, sfx, setSoundEnabled, playBlockSound, measureSound } from './sound.js';
import { seedFromString } from './noise.js';
import * as store from './storage.js';

// Colors are used exactly as painted (no sRGB conversion) for a crisp retro look.
THREE.ColorManagement.enabled = false;

const $ = (id) => document.getElementById(id);
const DAY_LENGTH = 600; // seconds for a full day/night cycle
const REACH = 6;
const SPLASHES = [
  'Build anything!', 'Mabuhay!', 'Made with blocks!', 'Now with caves!', 'Try flying!',
  'Infinite worlds!', 'Gawa sa Pinas!', '100% cubes!', 'Punch a tree!', 'Watch the sunset!',
];

// ------------------------------------------------------------------ settings
const settings = store.loadSettings({
  renderDist: isTouchDevice ? 4 : 6,
  sensitivity: 1,
  autoJump: isTouchDevice,
  hiRes: !isTouchDevice,
  sound: true,
  showFps: false,
});

// ------------------------------------------------------------------ renderer
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 1000);
camera.rotation.order = 'YXZ';
scene.fog = new THREE.Fog(0x9ccaff, 40, 90);
const skyColor = new THREE.Color(0x9ccaff);
scene.background = skyColor;

function applyResolution() {
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(settings.hiRes ? Math.min(dpr, 2) : Math.min(dpr, 1));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
applyResolution();
window.addEventListener('resize', applyResolution);

// ------------------------------------------------------------------ textures
const atlas = createAtlas();
const atlasTex = new THREE.CanvasTexture(atlas);
atlasTex.magFilter = THREE.NearestFilter;
atlasTex.minFilter = THREE.NearestFilter;
atlasTex.generateMipmaps = false;

const materials = {
  opaque: new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true }),
  cutout: new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
  liquid: new THREE.MeshBasicMaterial({
    map: atlasTex, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide,
  }),
};

const icons = {};
for (const id of PLACEABLE) icons[id] = makeBlockIcon(atlas, id);
const dirtURL = tileDataURL(atlas, T.DIRT, 4);
document.querySelectorAll('.screen.dirt').forEach((el) => { el.style.backgroundImage = `url(${dirtURL})`; });

// Average color of each atlas tile (for break particles).
const tileColors = [];
{
  const data = atlas.getContext('2d').getImageData(0, 0, atlas.width, atlas.height).data;
  const tiles = (atlas.width / TILE) * (atlas.height / TILE);
  for (let t = 0; t < tiles; t++) {
    let r = 0, g = 0, b = 0, n = 0;
    const tx = (t % ATLAS_COLS) * TILE, ty = Math.floor(t / ATLAS_COLS) * TILE;
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const i = ((ty + y) * atlas.width + tx + x) * 4;
      if (data[i + 3] < 128) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    tileColors[t] = n ? new THREE.Color(r / n / 255, g / n / 255, b / n / 255) : new THREE.Color(1, 1, 1);
  }
}

// ------------------------------------------------------------- scene props
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }),
);
highlight.visible = false;
scene.add(highlight);

function skyQuad(size, color) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ color, fog: false, depthTest: false, depthWrite: false }),
  );
  m.renderOrder = -10;
  m.frustumCulled = false;
  scene.add(m);
  return m;
}
const sun = skyQuad(26, 0xfff2a8);
const moon = skyQuad(18, 0xdfe8ff);

// Stars: random points on a big sphere around the camera, faded in at night.
const stars = (() => {
  const pos = [];
  for (let i = 0; i < 700; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos.push(Math.cos(a) * r * 400, Math.abs(u) * 400 - 40, Math.sin(a) * r * 400);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false,
  }));
  p.frustumCulled = false;
  p.renderOrder = -5;
  scene.add(p);
  return p;
})();

// Blocky clouds that drift with the wind and fade out toward the edges.
const CLOUD_SIZE = 480, CLOUD_REPEAT = 6;
const clouds = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const v = Math.sin(x * 0.7) + Math.sin(y * 0.9 + x * 0.3) + Math.sin((x + y) * 0.45) + Math.random() * 1.2;
    if (v > 1.75) { ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 1, 1); }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(CLOUD_REPEAT, CLOUD_REPEAT);

  const f = document.createElement('canvas');
  f.width = f.height = 64;
  const fctx = f.getContext('2d');
  const grad = fctx.createRadialGradient(32, 32, 8, 32, 32, 32);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(1, '#000');
  fctx.fillStyle = grad;
  fctx.fillRect(0, 0, 64, 64);
  const fade = new THREE.CanvasTexture(f);

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(CLOUD_SIZE, CLOUD_SIZE),
    new THREE.MeshBasicMaterial({
      map: tex, alphaMap: fade, transparent: true, opacity: 0.85, fog: false, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
})();

// Break particles (one instanced mesh).
const PCOUNT = 64;
const particles = (() => {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), new THREE.MeshBasicMaterial(), PCOUNT);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const list = [];
  for (let i = 0; i < PCOUNT; i++) {
    mesh.setMatrixAt(i, zero);
    mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    list.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3() });
  }
  scene.add(mesh);
  return { mesh, list, next: 0, zero, m: new THREE.Matrix4(), c: new THREE.Color() };
})();

function spawnParticles(x, y, z, id) {
  const base = tileColors[BLOCKS[id].tiles[2]];
  for (let k = 0; k < 12; k++) {
    const i = particles.next;
    particles.next = (i + 1) % PCOUNT;
    const pt = particles.list[i];
    pt.life = 0.45 + Math.random() * 0.4;
    pt.p.set(x + 0.15 + Math.random() * 0.7, y + 0.15 + Math.random() * 0.7, z + 0.15 + Math.random() * 0.7);
    pt.v.set((Math.random() - 0.5) * 4, 1.5 + Math.random() * 3, (Math.random() - 0.5) * 4);
    particles.c.copy(base).multiplyScalar(0.8 + Math.random() * 0.4);
    particles.mesh.setColorAt(i, particles.c);
  }
  particles.mesh.instanceColor.needsUpdate = true;
}

function updateParticles(dt) {
  let any = false;
  for (let i = 0; i < PCOUNT; i++) {
    const pt = particles.list[i];
    if (pt.life <= 0) continue;
    any = true;
    pt.life -= dt;
    pt.v.y -= 18 * dt;
    pt.p.addScaledVector(pt.v, dt);
    if (world && world.isSolid(Math.floor(pt.p.x), Math.floor(pt.p.y - 0.065), Math.floor(pt.p.z))) {
      pt.p.y = Math.floor(pt.p.y - 0.065) + 1.065;
      pt.v.set(pt.v.x * 0.5, 0, pt.v.z * 0.5);
    }
    if (pt.life <= 0) particles.mesh.setMatrixAt(i, particles.zero);
    else particles.mesh.setMatrixAt(i, particles.m.makeTranslation(pt.p.x, pt.p.y, pt.p.z));
  }
  if (any || particles.dirty) particles.mesh.instanceMatrix.needsUpdate = true;
  particles.dirty = any;
}

// ------------------------------------------------------------------ game state
let world = null;
let player = null;
let state = 'menu'; // menu | loading | playing | paused | inventory
let seed = 0;
let dayTime = 0.3;
let hotbar = [...DEFAULT_HOTBAR];
let selected = 0;
let spawn = { x: 0.5, y: 60, z: 0.5 };
let isNewWorld = false;
let loadingTotal = 1;
let target = null;
let breakCooldown = 0;
let placeCooldown = 0;
let saveTimer = 0;
let lastStep = 0;
let wasInWater = false;
let settingsReturn = 'menu';
let wasLocked = false;

const input = new Input(canvas, {
  onBreakStart: () => { if (state === 'playing') { breakBlock(); breakCooldown = 0.3; } },
  onPlace: () => { if (state === 'playing') { placeBlock(); placeCooldown = 0.3; } },
  onPick: pickBlock,
  onSelect: (i) => { if (state === 'playing') selectSlot(i); },
  onScroll: (d) => { if (state === 'playing') selectSlot((selected + d + 9) % 9); },
  onPause: () => {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
    else if (state === 'inventory') closeInventory();
  },
  onInventory: () => {
    if (state === 'playing') openInventory();
    else if (state === 'inventory') closeInventory();
  },
  onToggleFly: toggleFly,
  onToggleDebug: () => {
    settings.showFps = !settings.showFps;
    store.saveSettings(settings);
    $('debug').classList.toggle('hidden', !settings.showFps);
  },
  canLook: () => state === 'playing',
});

// ------------------------------------------------------------------ screens
const SCREENS = ['menu', 'new-world', 'settings', 'help', 'pause', 'inventory', 'loading'];
function showScreen(name) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
  const inGame = state === 'playing' || state === 'paused' || state === 'inventory';
  $('hud').classList.toggle('hidden', !inGame);
  $('touch').classList.toggle('hidden', !(inGame && isTouchDevice && state === 'playing'));
}

function toast(text, ms = 1400) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), ms);
}

function refreshMenu() {
  const save = store.loadWorld();
  $('btn-continue').disabled = !save;
  $('tagline').textContent = SPLASHES[(Math.random() * SPLASHES.length) | 0];
}

// ------------------------------------------------------------------ hotbar UI
function renderHotbar() {
  for (const id of ['hotbar', 'inv-hotbar']) {
    const el = $(id);
    el.innerHTML = '';
    hotbar.forEach((blockId, i) => {
      const slot = document.createElement('button');
      slot.className = 'slot' + (i === selected ? ' selected' : '');
      const img = document.createElement('img');
      img.src = icons[blockId];
      img.alt = BLOCKS[blockId].name;
      slot.appendChild(img);
      slot.addEventListener('click', (e) => { e.stopPropagation(); selectSlot(i); });
      el.appendChild(slot);
    });
  }
  $('place-icon').style.backgroundImage = `url(${icons[hotbar[selected]]})`;
}

function selectSlot(i) {
  if (i !== selected) sfx.click();
  selected = i;
  renderHotbar();
  const el = $('block-name');
  el.textContent = BLOCKS[hotbar[selected]].name;
  el.classList.add('show');
  clearTimeout(selectSlot.t);
  selectSlot.t = setTimeout(() => el.classList.remove('show'), 1200);
}

function buildInventoryGrid() {
  const grid = $('inv-grid');
  grid.innerHTML = '';
  for (const id of PLACEABLE) {
    const slot = document.createElement('button');
    slot.className = 'slot';
    slot.title = BLOCKS[id].name;
    const img = document.createElement('img');
    img.src = icons[id];
    img.alt = BLOCKS[id].name;
    slot.appendChild(img);
    slot.addEventListener('click', () => {
      hotbar[selected] = id;
      sfx.click();
      renderHotbar();
    });
    grid.appendChild(slot);
  }
}

function openInventory() {
  state = 'inventory';
  input.reset();
  wasLocked = false;
  if (document.pointerLockElement) document.exitPointerLock();
  showScreen('inventory');
}

function closeInventory() {
  state = 'playing';
  showScreen(null);
  input.lockPointer();
}

// ------------------------------------------------------------------ actions
// The other half of a two-block door or bed, or null.
function partnerOf(x, y, z, id) {
  if (isDoor(id)) {
    const py = doorUpper(id) ? y - 1 : y + 1;
    return isDoor(world.getBlock(x, py, z)) ? [x, py, z] : null;
  }
  if (isBed(id)) {
    const [dx, dz] = FACING_DIRS[bedFacing(id)];
    const s = bedHead(id) ? -1 : 1;
    const px = x + dx * s, pz = z + dz * s;
    return isBed(world.getBlock(px, y, pz)) ? [px, y, pz] : null;
  }
  return null;
}

function breakBlock() {
  if (!target) return;
  const { x, y, z, id } = target;
  if (!BLOCKS[id].breakable) return;
  const partner = partnerOf(x, y, z, id);
  // If water is next to the hole, let it flow in.
  const nearWater = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]
    .some(([dx, dy, dz]) => world.getBlock(x + dx, y + dy, z + dz) === B.WATER);
  world.setBlock(x, y, z, nearWater ? B.WATER : B.AIR);
  if (partner) world.setBlock(partner[0], partner[1], partner[2], B.AIR);
  spawnParticles(x, y, z, id);
  playBlockSound(BLOCKS[id].sound, 'break');
  updateTarget();
}

const canReplace = (x, y, z) => {
  if (y < 0 || y >= CH) return false;
  const b = world.getBlock(x, y, z);
  return b === B.AIR || b === B.WATER;
};

// Place the selected block, or use the door/bed being looked at.
// `repeat` is true for auto-repeat while the button is held.
function placeBlock(repeat = false) {
  if (!target) return;
  if (isDoor(target.id) || isBed(target.id)) {
    if (repeat) return;
    if (isDoor(target.id)) toggleDoor(target.x, target.y, target.z, target.id);
    else sleepInBed(target.x, target.y, target.z);
    return;
  }
  const item = hotbar[selected];
  const x = target.x + target.nx, y = target.y + target.ny, z = target.z + target.nz;
  if (!canReplace(x, y, z)) return;
  const facing = facingFromYaw(player.yaw);

  if (item === B.DOOR) {
    if (!canReplace(x, y + 1, z)) return;
    if (player.intersectsBlock(x, y, z) || player.intersectsBlock(x, y + 1, z)) return;
    // Next to a door facing the same way? Hinge on the far side to make a double door.
    const [hx, hz] = doorHingeDir(facing);
    const n = world.getBlock(x + hx, y, z + hz);
    const mirror = isDoor(n) && doorFacing(n) === facing && !doorMirror(n);
    world.setBlock(x, y, z, doorId(facing, false, false, mirror));
    world.setBlock(x, y + 1, z, doorId(facing, false, true, mirror));
  } else if (item === B.BED) {
    const [dx, dz] = FACING_DIRS[facing];
    const hx = x + dx, hz = z + dz;
    if (!canReplace(hx, y, hz)) { toast('Not enough room for the bed', 1200); return; }
    if (!world.isSolid(x, y - 1, z) || !world.isSolid(hx, y - 1, hz)) { toast('Beds need solid ground', 1200); return; }
    if (player.intersectsBlock(x, y, z) || player.intersectsBlock(hx, y, hz)) return;
    world.setBlock(x, y, z, bedId(facing, false));
    world.setBlock(hx, y, hz, bedId(facing, true));
  } else {
    if (IS_SOLID[item] && player.intersectsBlock(x, y, z)) return;
    world.setBlock(x, y, z, item);
  }
  playBlockSound(BLOCKS[item].sound, 'place');
  updateTarget();
}

// The other door of a double door (the neighbour on the handle side), or null.
function doubleDoorPartner(x, y, z, id) {
  const f = doorFacing(id), mirror = doorMirror(id);
  const [hx, hz] = doorHingeDir(f);
  const s = mirror ? 1 : -1; // handle side is opposite the hinge side
  const px = x + hx * s, pz = z + hz * s;
  const n = world.getBlock(px, y, pz);
  if (isDoor(n) && doorFacing(n) === f && doorMirror(n) !== mirror && doorUpper(n) === doorUpper(id)) return [px, pz, n];
  return null;
}

// Would the player be inside this door's closed panel?
function blocksPlayerWhenClosed(x, lowerY, z, id) {
  const b = BLOCKS[doorId(doorFacing(id), false, false, doorMirror(id))].boxes[0];
  const p = player.pos, hw = 0.3;
  return p.x + hw > x + b[0] && p.x - hw < x + b[3] && p.z + hw > z + b[2] && p.z - hw < z + b[5] &&
    p.y < lowerY + 2 && p.y + 1.8 > lowerY;
}

function setDoorOpen(x, y, z, id, open) {
  const f = doorFacing(id), mirror = doorMirror(id);
  const lowerY = doorUpper(id) ? y - 1 : y;
  if (!open && blocksPlayerWhenClosed(x, lowerY, z, id)) return false;
  if (isDoor(world.getBlock(x, lowerY, z))) world.setBlock(x, lowerY, z, doorId(f, open, false, mirror));
  if (isDoor(world.getBlock(x, lowerY + 1, z))) world.setBlock(x, lowerY + 1, z, doorId(f, open, true, mirror));
  return true;
}

function toggleDoor(x, y, z, id) {
  const open = !doorOpen(id);
  // Don't swing the door shut on top of the player.
  if (!setDoorOpen(x, y, z, id, open)) return;
  // Double doors open and close together.
  const partner = doubleDoorPartner(x, y, z, id);
  if (partner && doorOpen(partner[2]) !== open) setDoorOpen(partner[0], y, partner[1], partner[2], open);
  sfx.door();
  updateTarget();
}

const isNight = () => Math.sin(dayTime * Math.PI * 2) < -0.05;
let sleeping = false;

function sleepInBed(x, y, z) {
  if (sleeping) return;
  spawn = { x: x + 0.5, y: y + 0.6, z: z + 0.5 };
  if (!isNight()) {
    toast('You can only sleep at night. Spawn point set!', 2200);
    saveGame();
    return;
  }
  sleeping = true;
  input.reset();
  $('sleep').classList.add('on');
  setTimeout(() => { dayTime = 0.01; }, 1300);
  setTimeout(() => {
    $('sleep').classList.remove('on');
    sleeping = false;
    toast('Good morning! Spawn point set.', 2200);
    saveGame();
  }, 2400);
}

function pickBlock() {
  if (state !== 'playing' || !target) return;
  const id = itemOf(target.id);
  if (!PLACEABLE.includes(id)) return;
  const at = hotbar.indexOf(id);
  if (at >= 0) selectSlot(at);
  else { hotbar[selected] = id; selectSlot(selected); }
}

function toggleFly() {
  if (state !== 'playing' || !player) return;
  player.flying = !player.flying;
  if (player.flying) player.vel.y = 4;
  $('btn-fly').classList.toggle('on', player.flying);
  $('btn-down').classList.toggle('hidden', !player.flying);
  toast(player.flying ? 'Flying: ON' : 'Flying: OFF', 900);
}

const tmpEye = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
function updateTarget() {
  player.eyePos(tmpEye);
  player.lookDir(tmpDir);
  target = world.raycast(tmpEye, tmpDir, REACH);
  highlight.visible = !!target;
  if (!target) return;
  const b = target.box || [0, 0, 0, 1, 1, 1];
  highlight.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
  highlight.position.set(target.x + (b[0] + b[3]) / 2, target.y + (b[1] + b[4]) / 2, target.z + (b[2] + b[5]) / 2);
}

// ------------------------------------------------------------------ world lifecycle
function findSpawn(w) {
  for (let i = 0; i < 400; i++) {
    const a = i * 2.39996, r = i * 5;
    const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
    const info = w.columnInfo(x, z);
    if (info.h > SEA + 2 && info.h < SEA + 30) return { x: x + 0.5, y: info.h + 1, z: z + 0.5 };
  }
  return { x: 0.5, y: CH - 10, z: 0.5 };
}

function startWorld(save, seedText) {
  disposeWorld();
  if (save) {
    seed = save.seed;
    dayTime = save.time ?? 0.3;
    hotbar = (save.hotbar && save.hotbar.length === 9) ? save.hotbar.filter((id) => BLOCKS[id]) : [...DEFAULT_HOTBAR];
    if (hotbar.length !== 9) hotbar = [...DEFAULT_HOTBAR];
    selected = save.selected ?? 0;
  } else {
    seed = seedFromString(seedText);
    dayTime = 0.3;
    hotbar = [...DEFAULT_HOTBAR];
    selected = 0;
  }
  world = new World(scene, seed, materials, save ? save.mods : null);
  world.renderDist = settings.renderDist;
  player = new Player(world);
  player.autoJump = settings.autoJump;
  if (save && save.player) {
    const p = save.player;
    player.pos.set(p.x, p.y, p.z);
    player.yaw = p.yaw;
    player.pitch = p.pitch;
    player.flying = !!p.flying;
    spawn = save.spawn || findSpawn(world);
    isNewWorld = false;
  } else {
    spawn = findSpawn(world);
    player.pos.set(spawn.x, spawn.y, spawn.z);
    isNewWorld = true;
  }
  $('btn-fly').classList.toggle('on', player.flying);
  $('btn-down').classList.toggle('hidden', !player.flying);
  renderHotbar();
  state = 'loading';
  loadingTotal = 0;
  $('loading-bar').style.width = '0%';
  showScreen('loading');
}

function disposeWorld() {
  if (world) world.dispose();
  world = null;
  player = null;
  target = null;
  highlight.visible = false;
}

function updateLoading() {
  world.update(player.pos.x, player.pos.z, 25);
  const near = world.queue.filter((q) => q.d <= 5).length;
  if (!loadingTotal) loadingTotal = Math.max(1, near);
  const pct = Math.round((1 - near / loadingTotal) * 100);
  $('loading-bar').style.width = pct + '%';
  if (near === 0) {
    if (isNewWorld) {
      // Stand on open ground, not on top of a tree.
      const x0 = Math.floor(player.pos.x), z0 = Math.floor(player.pos.z);
      let best = null;
      for (let r = 0; r <= 8 && !best; r++) {
        for (let dz = -r; dz <= r && !best; dz++) {
          for (let dx = -r; dx <= r && !best; dx++) {
            const y = world.topSolidY(x0 + dx, z0 + dz);
            const top = world.getBlock(x0 + dx, y, z0 + dz);
            if (top === B.GRASS || top === B.SAND || top === B.SNOW) best = { x: x0 + dx, y, z: z0 + dz };
          }
        }
      }
      if (!best) best = { x: x0, y: world.topSolidY(x0, z0), z: z0 };
      player.pos.set(best.x + 0.5, best.y + 1, best.z + 0.5);
      spawn = { x: player.pos.x, y: player.pos.y, z: player.pos.z };
      isNewWorld = false;
      saveGame();
    }
    state = 'playing';
    showScreen(null);
    if (!isTouchDevice) toast('Click to play', 2500);
    pushBackGuard();
  }
}

function saveGame() {
  if (!world || !player) return;
  const ok = store.saveWorld({
    version: 1,
    seed,
    time: dayTime,
    hotbar,
    selected,
    spawn,
    player: {
      x: player.pos.x, y: player.pos.y, z: player.pos.z,
      yaw: player.yaw, pitch: player.pitch, flying: player.flying,
    },
    mods: world.serializeMods(),
  });
  if (!ok) toast('Could not save (storage full?)', 2500);
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  input.reset();
  wasLocked = false;
  if (document.pointerLockElement) document.exitPointerLock();
  saveGame();
  showScreen('pause');
}

function resumeGame() {
  state = 'playing';
  showScreen(null);
  input.lockPointer();
}

function quitToTitle() {
  saveGame();
  disposeWorld();
  state = 'menu';
  refreshMenu();
  showScreen('menu');
}

// Android back button: keep one history entry so "back" opens the pause menu.
function pushBackGuard() {
  if (!history.state || !history.state.blockscraft) history.pushState({ blockscraft: 1 }, '');
}
window.addEventListener('popstate', () => {
  if (state === 'playing') { pauseGame(); pushBackGuard(); }
  else if (state === 'inventory') { closeInventory(); pushBackGuard(); }
  else if (state === 'paused') { resumeGame(); pushBackGuard(); }
});

// ------------------------------------------------------------------ settings UI
function syncSettingsUI() {
  $('set-rd').value = settings.renderDist;
  $('rd-val').textContent = settings.renderDist + ' chunks';
  $('set-sens').value = settings.sensitivity;
  $('sens-val').textContent = Number(settings.sensitivity).toFixed(1);
  $('set-autojump').checked = settings.autoJump;
  $('set-hires').checked = settings.hiRes;
  $('set-sound').checked = settings.sound;
  $('set-fps').checked = settings.showFps;
}

function applySettings() {
  input.sensitivity = settings.sensitivity;
  setSoundEnabled(settings.sound);
  $('debug').classList.toggle('hidden', !settings.showFps);
  applyResolution();
  if (world) world.renderDist = settings.renderDist;
  if (player) player.autoJump = settings.autoJump;
  store.saveSettings(settings);
}

$('set-rd').addEventListener('input', (e) => { settings.renderDist = +e.target.value; syncSettingsUI(); applySettings(); });
$('set-sens').addEventListener('input', (e) => { settings.sensitivity = +e.target.value; syncSettingsUI(); applySettings(); });
$('set-autojump').addEventListener('change', (e) => { settings.autoJump = e.target.checked; applySettings(); });
$('set-hires').addEventListener('change', (e) => { settings.hiRes = e.target.checked; applySettings(); });
$('set-sound').addEventListener('change', (e) => { settings.sound = e.target.checked; applySettings(); });
$('set-fps').addEventListener('change', (e) => { settings.showFps = e.target.checked; applySettings(); });

// ------------------------------------------------------------------ menu buttons
const click = (id, fn) => $(id).addEventListener('click', () => { initAudio(); sfx.click(); fn(); });
click('btn-continue', () => { const s = store.loadWorld(); if (s) startWorld(s); });
click('btn-new', () => {
  $('overwrite-warn').classList.toggle('hidden', !store.loadWorld());
  $('seed-input').value = '';
  showScreen('new-world');
});
click('btn-create', () => { store.deleteWorld(); startWorld(null, $('seed-input').value); });
click('btn-new-back', () => showScreen('menu'));
click('btn-settings', () => { settingsReturn = 'menu'; syncSettingsUI(); showScreen('settings'); });
click('btn-help', () => showScreen('help'));
click('btn-help-back', () => showScreen('menu'));
click('btn-settings-done', () => showScreen(settingsReturn));
click('btn-resume', resumeGame);
click('btn-pause-settings', () => { settingsReturn = 'pause'; syncSettingsUI(); showScreen('settings'); });
click('btn-quit', quitToTitle);
click('btn-inv-close', closeInventory);
$('btn-inv').addEventListener('click', () => { if (state === 'playing') openInventory(); });

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    wasLocked = true;
    $('toast').classList.remove('show');
  } else if (wasLocked) {
    wasLocked = false;
    if (state === 'playing') pauseGame();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state === 'playing') pauseGame();
    else saveGame();
  }
});
window.addEventListener('pagehide', saveGame);

// ------------------------------------------------------------------ sky
// Sky gradient stops, from midnight (0) to full day (1).
const SKY_STOPS = [
  [0, new THREE.Color(0x0a1028)],
  [0.3, new THREE.Color(0x3a3266)],
  [0.5, new THREE.Color(0xee8a58)],
  [0.72, new THREE.Color(0xdcb9a0)],
  [1, new THREE.Color(0x8fc4ff)],
];
const WATER_FOG = new THREE.Color(0x14306e);
const sunDir = new THREE.Vector3();

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function updateSky(dt) {
  if (state === 'playing') dayTime = (dayTime + dt / DAY_LENGTH) % 1;
  const ang = dayTime * Math.PI * 2;
  const sunH = Math.sin(ang);
  const day = smoothstep(-0.2, 0.25, sunH);
  const light = 0.34 + 0.66 * day;

  for (let i = 1; i < SKY_STOPS.length; i++) {
    const [t0, c0] = SKY_STOPS[i - 1], [t1, c1] = SKY_STOPS[i];
    if (day <= t1) { skyColor.copy(c0).lerp(c1, (day - t0) / (t1 - t0)); break; }
  }
  stars.material.opacity = 1 - smoothstep(0, 0.35, day);
  stars.visible = stars.material.opacity > 0.01;
  stars.position.copy(camera.position);

  const R = settings.renderDist * CS;
  if (player && player.headInWater) {
    scene.fog.color.copy(WATER_FOG).multiplyScalar(light);
    scene.fog.near = 0.5;
    scene.fog.far = 14;
    scene.background = scene.fog.color;
  } else {
    scene.fog.color.copy(skyColor);
    scene.fog.near = R * 0.45;
    scene.fog.far = R * 0.95;
    scene.background = skyColor;
  }
  $('underwater').classList.toggle('on', !!(player && player.headInWater));

  materials.opaque.color.setScalar(light);
  materials.cutout.color.setScalar(light);
  materials.liquid.color.setScalar(light);
  particles.mesh.material.color.setScalar(light);

  sunDir.set(Math.cos(ang), Math.sin(ang), 0.3).normalize();
  sun.position.copy(camera.position).addScaledVector(sunDir, 300);
  sun.lookAt(camera.position);
  moon.position.copy(camera.position).addScaledVector(sunDir, -300);
  moon.lookAt(camera.position);

  const wind = performance.now() * 0.0015;
  clouds.position.set(camera.position.x, CH + 30, camera.position.z);
  const cell = CLOUD_SIZE / CLOUD_REPEAT;
  clouds.material.map.offset.set((camera.position.x + wind) / cell, -camera.position.z / cell);
  clouds.material.color.setScalar(Math.max(light, 0.25));
}

// ------------------------------------------------------------------ main loop
let fpsFrames = 0, fpsTime = 0, fps = 0;

function updateGame(dt) {
  const look = input.consumeLook();
  if (sleeping) return;
  player.yaw -= look.dx;
  player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - look.dy));

  const st = input.state;
  if (world.isLoaded(player.pos.x, player.pos.z)) player.update(dt, st);
  if (player.pos.y < -30) {
    player.pos.set(spawn.x, spawn.y + 1, spawn.z);
    player.vel.set(0, 0, 0);
    toast('Respawned');
  }
  if (!player.flying) { $('btn-fly').classList.remove('on'); $('btn-down').classList.add('hidden'); }

  world.update(player.pos.x, player.pos.z, isTouchDevice ? 5 : 8);

  camera.position.set(player.pos.x, player.pos.y + 1.62, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  updateTarget();

  breakCooldown -= dt;
  placeCooldown -= dt;
  if (input.breaking && breakCooldown <= 0) { breakBlock(); breakCooldown = 0.25; }
  if (input.placing && placeCooldown <= 0) { placeBlock(true); placeCooldown = 0.25; }

  if (player.onGround && player.walkDist - lastStep > 1.8) {
    lastStep = player.walkDist;
    const p = player.pos;
    const under = world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.05), Math.floor(p.z));
    if (under) playBlockSound(BLOCKS[under].sound, 'step');
  }
  if (player.inWater && !wasInWater && player.vel.y < -4) sfx.splash();
  wasInWater = player.inWater;

  saveTimer += dt;
  if (saveTimer > 20) { saveTimer = 0; saveGame(); }

  if (settings.showFps) {
    const p = player.pos;
    const info = world.columnInfo(Math.floor(p.x), Math.floor(p.z));
    $('debug').textContent =
      `BlocksCraft  ${fps} fps\n` +
      `XYZ: ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}\n` +
      `Chunks: ${world.chunks.size}  Queue: ${world.queue.length}\n` +
      `Biome: ${info.biome}  Seed: ${seed}`;
  }
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) { fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0; }

  if (state === 'loading') updateLoading();
  else if (state === 'playing') updateGame(dt);

  if (world && state !== 'loading') {
    updateParticles(dt);
    updateSky(dt);
    renderer.render(scene, camera);
  }
}

// ------------------------------------------------------------------ boot
// In the browser (not the Android app) link back to the website's download page.
if (!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
  $('site-link').classList.remove('hidden');
}
buildInventoryGrid();
renderHotbar();
applySettings();
refreshMenu();
showScreen('menu');
requestAnimationFrame(frame);

// Debug handle for testing from the console.
window.blockscraft = {
  get world() { return world; }, get player() { return player; }, get state() { return state; }, get target() { return target; },
  breakBlock, placeBlock,
  setTime(t) { dayTime = t; },
  measureSound,
  get dayTime() { return dayTime; }, get spawn() { return spawn; }, selectSlot, updateTarget,
};
