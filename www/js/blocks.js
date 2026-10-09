// Block registry. Each block lists its texture tiles (indexes into the atlas
// built by textures.js) and how it behaves for rendering and physics.

// Atlas tile indexes
export const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, LOG_SIDE: 6, LOG_TOP: 7,
  LEAVES: 8, PLANKS: 9, GLASS: 10, COBBLE: 11, BRICK: 12, BEDROCK: 13, SNOW: 14, SNOW_SIDE: 15,
  COAL_ORE: 16, IRON_ORE: 17, GOLD_ORE: 18, CLOTH_RED: 19, CLOTH_BLUE: 20, CLOTH_YELLOW: 21, CLOTH_WHITE: 22, CLOTH_BLACK: 23,
  BOOKSHELF: 24, CACTUS_SIDE: 25, CACTUS_TOP: 26, GRAVEL: 27, STONE_BRICK: 28, GOLD_BLOCK: 29, PUMPKIN_SIDE: 30, PUMPKIN_TOP: 31,
  DOOR_BOTTOM: 32, DOOR_TOP: 33, BED_TOP_FOOT: 34, BED_TOP_HEAD: 35, BED_SIDE_FOOT: 36, BED_SIDE_HEAD: 37,
};

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 8;

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, LOG: 6, LEAVES: 7, PLANKS: 8, GLASS: 9,
  COBBLE: 10, BRICK: 11, BEDROCK: 12, SNOW: 13, COAL_ORE: 14, IRON_ORE: 15, GOLD_ORE: 16,
  CLOTH_RED: 17, CLOTH_BLUE: 18, CLOTH_YELLOW: 19, CLOTH_WHITE: 20, CLOTH_BLACK: 21,
  BOOKSHELF: 22, CACTUS: 23, GRAVEL: 24, STONE_BRICK: 25, GOLD_BLOCK: 26, PUMPKIN: 27,
  // Multi-state blocks: the item id is the first variant of each range.
  DOOR: 64, // 64..79 = 64 + upper*8 + open*4 + facing
  BED: 80, // 80..87 = 80 + head*4 + facing
};

// Facing 0..3 = -Z, +X, +Z, -X (as [dx, dz]).
export const FACING_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export function facingFromYaw(yaw) {
  const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 1 : 3;
  return dz > 0 ? 2 : 0;
}

export const isDoor = (id) => id >= 64 && id < 80;
export const isBed = (id) => id >= 80 && id < 88;
export const doorId = (facing, open, upper) => 64 + (upper ? 8 : 0) + (open ? 4 : 0) + facing;
export const doorFacing = (id) => (id - 64) & 3;
export const doorOpen = (id) => ((id - 64) & 4) !== 0;
export const doorUpper = (id) => ((id - 64) & 8) !== 0;
export const bedId = (facing, head) => 80 + (head ? 4 : 0) + facing;
export const bedFacing = (id) => (id - 80) & 3;
export const bedHead = (id) => ((id - 80) & 4) !== 0;


// render: 'opaque' | 'cutout' (alpha-tested, e.g. leaves/glass) | 'liquid'
function def(name, top, bottom, side, opts = {}) {
  return {
    name,
    tiles: [top, bottom, side],
    solid: opts.solid ?? true,
    render: opts.render ?? 'opaque',
    breakable: opts.breakable ?? true,
  };
}

export const BLOCKS = [];
BLOCKS[B.AIR] = { name: 'Air', tiles: [0, 0, 0], solid: false, render: 'none', breakable: false };
BLOCKS[B.GRASS] = def('Grass', T.GRASS_TOP, T.DIRT, T.GRASS_SIDE);
BLOCKS[B.DIRT] = def('Dirt', T.DIRT, T.DIRT, T.DIRT);
BLOCKS[B.STONE] = def('Stone', T.STONE, T.STONE, T.STONE);
BLOCKS[B.SAND] = def('Sand', T.SAND, T.SAND, T.SAND);
BLOCKS[B.WATER] = def('Water', T.WATER, T.WATER, T.WATER, { solid: false, render: 'liquid', breakable: false });
BLOCKS[B.LOG] = def('Log', T.LOG_TOP, T.LOG_TOP, T.LOG_SIDE);
BLOCKS[B.LEAVES] = def('Leaves', T.LEAVES, T.LEAVES, T.LEAVES, { render: 'cutout' });
BLOCKS[B.PLANKS] = def('Planks', T.PLANKS, T.PLANKS, T.PLANKS);
BLOCKS[B.GLASS] = def('Glass', T.GLASS, T.GLASS, T.GLASS, { render: 'cutout' });
BLOCKS[B.COBBLE] = def('Cobblestone', T.COBBLE, T.COBBLE, T.COBBLE);
BLOCKS[B.BRICK] = def('Bricks', T.BRICK, T.BRICK, T.BRICK);
BLOCKS[B.BEDROCK] = def('Bedrock', T.BEDROCK, T.BEDROCK, T.BEDROCK, { breakable: false });
BLOCKS[B.SNOW] = def('Snowy Grass', T.SNOW, T.DIRT, T.SNOW_SIDE);
BLOCKS[B.COAL_ORE] = def('Coal Ore', T.COAL_ORE, T.COAL_ORE, T.COAL_ORE);
BLOCKS[B.IRON_ORE] = def('Iron Ore', T.IRON_ORE, T.IRON_ORE, T.IRON_ORE);
BLOCKS[B.GOLD_ORE] = def('Gold Ore', T.GOLD_ORE, T.GOLD_ORE, T.GOLD_ORE);
BLOCKS[B.CLOTH_RED] = def('Red Cloth', T.CLOTH_RED, T.CLOTH_RED, T.CLOTH_RED);
BLOCKS[B.CLOTH_BLUE] = def('Blue Cloth', T.CLOTH_BLUE, T.CLOTH_BLUE, T.CLOTH_BLUE);
BLOCKS[B.CLOTH_YELLOW] = def('Yellow Cloth', T.CLOTH_YELLOW, T.CLOTH_YELLOW, T.CLOTH_YELLOW);
BLOCKS[B.CLOTH_WHITE] = def('White Cloth', T.CLOTH_WHITE, T.CLOTH_WHITE, T.CLOTH_WHITE);
BLOCKS[B.CLOTH_BLACK] = def('Black Cloth', T.CLOTH_BLACK, T.CLOTH_BLACK, T.CLOTH_BLACK);
BLOCKS[B.BOOKSHELF] = def('Bookshelf', T.PLANKS, T.PLANKS, T.BOOKSHELF);
BLOCKS[B.CACTUS] = def('Cactus', T.CACTUS_TOP, T.CACTUS_TOP, T.CACTUS_SIDE);
BLOCKS[B.GRAVEL] = def('Gravel', T.GRAVEL, T.GRAVEL, T.GRAVEL);
BLOCKS[B.STONE_BRICK] = def('Stone Bricks', T.STONE_BRICK, T.STONE_BRICK, T.STONE_BRICK);
BLOCKS[B.GOLD_BLOCK] = def('Gold Block', T.GOLD_BLOCK, T.GOLD_BLOCK, T.GOLD_BLOCK);
BLOCKS[B.PUMPKIN] = def('Pumpkin', T.PUMPKIN_TOP, T.PUMPKIN_TOP, T.PUMPKIN_SIDE);

// Non-cube blocks list their collision/render boxes as [x0, y0, z0, x1, y1, z1] in 0..1.
const DOOR_T = 3 / 16;
function doorPanel(facing) {
  return [
    [0, 0, 0, 1, 1, DOOR_T],
    [1 - DOOR_T, 0, 0, 1, 1, 1],
    [0, 0, 1 - DOOR_T, 1, 1, 1],
    [0, 0, 0, DOOR_T, 1, 1],
  ][facing];
}
for (let upper = 0; upper < 2; upper++) {
  for (let open = 0; open < 2; open++) {
    for (let f = 0; f < 4; f++) {
      const d = def('Door', T.PLANKS, T.PLANKS, upper ? T.DOOR_TOP : T.DOOR_BOTTOM, { render: 'cutout' });
      // An open door swings 90 degrees around its hinge corner.
      d.boxes = [doorPanel(open ? (f + 1) % 4 : f)];
      BLOCKS[doorId(f, open, upper)] = d;
    }
  }
}
for (let head = 0; head < 2; head++) {
  for (let f = 0; f < 4; f++) {
    const d = def('Bed', head ? T.BED_TOP_HEAD : T.BED_TOP_FOOT, T.PLANKS, head ? T.BED_SIDE_HEAD : T.BED_SIDE_FOOT);
    d.boxes = [[0, 0, 0, 1, 9 / 16, 1]];
    d.topFacing = f; // rotates the top texture so the pillow points to the head end
    BLOCKS[bedId(f, head)] = d;
  }
}

// Blocks the player can pick from the inventory (creative mode).
export const PLACEABLE = [
  B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.PLANKS, B.LOG, B.BRICK, B.GLASS, B.SAND,
  B.LEAVES, B.SNOW, B.GRAVEL, B.STONE_BRICK, B.BOOKSHELF, B.CACTUS, B.PUMPKIN,
  B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.GOLD_BLOCK,
  B.CLOTH_RED, B.CLOTH_BLUE, B.CLOTH_YELLOW, B.CLOTH_WHITE, B.CLOTH_BLACK, B.WATER,
  B.DOOR, B.BED,
];

export const DEFAULT_HOTBAR = [B.GRASS, B.DIRT, B.COBBLE, B.PLANKS, B.LOG, B.BRICK, B.GLASS, B.DOOR, B.BED];

// Precomputed lookup tables for the hot meshing / physics loops.
export const IS_SOLID = new Uint8Array(256);
export const IS_OPAQUE = new Uint8Array(256); // fully blocks light/view (used for culling + AO)
export const RENDER = [];
export const BOXES = []; // per-id box list, or undefined for a full cube
const FULL_BOX = [[0, 0, 0, 1, 1, 1]];
for (let id = 0; id < BLOCKS.length; id++) {
  const b = BLOCKS[id];
  if (!b) continue;
  IS_SOLID[id] = b.solid ? 1 : 0;
  IS_OPAQUE[id] = b.render === 'opaque' && !b.boxes ? 1 : 0;
  RENDER[id] = b.render;
  BOXES[id] = b.boxes;
}

// Boxes used for collision/raycasts (full cube when the block has no custom shape).
export const boxesOf = (id) => BOXES[id] || FULL_BOX;

// The inventory item a placed block variant belongs to.
export const itemOf = (id) => (isDoor(id) ? B.DOOR : isBed(id) ? B.BED : id);
