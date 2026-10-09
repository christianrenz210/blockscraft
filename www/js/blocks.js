// Block registry. Each block lists its texture tiles (indexes into the atlas
// built by textures.js) and how it behaves for rendering and physics.

// Atlas tile indexes
export const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, LOG_SIDE: 6, LOG_TOP: 7,
  LEAVES: 8, PLANKS: 9, GLASS: 10, COBBLE: 11, BRICK: 12, BEDROCK: 13, SNOW: 14, SNOW_SIDE: 15,
  COAL_ORE: 16, IRON_ORE: 17, GOLD_ORE: 18, CLOTH_RED: 19, CLOTH_BLUE: 20, CLOTH_YELLOW: 21, CLOTH_WHITE: 22, CLOTH_BLACK: 23,
  BOOKSHELF: 24, CACTUS_SIDE: 25, CACTUS_TOP: 26, GRAVEL: 27, STONE_BRICK: 28, GOLD_BLOCK: 29, PUMPKIN_SIDE: 30, PUMPKIN_TOP: 31,
};

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 4;

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, LOG: 6, LEAVES: 7, PLANKS: 8, GLASS: 9,
  COBBLE: 10, BRICK: 11, BEDROCK: 12, SNOW: 13, COAL_ORE: 14, IRON_ORE: 15, GOLD_ORE: 16,
  CLOTH_RED: 17, CLOTH_BLUE: 18, CLOTH_YELLOW: 19, CLOTH_WHITE: 20, CLOTH_BLACK: 21,
  BOOKSHELF: 22, CACTUS: 23, GRAVEL: 24, STONE_BRICK: 25, GOLD_BLOCK: 26, PUMPKIN: 27,
};

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

// Blocks the player can pick from the inventory (creative mode).
export const PLACEABLE = [
  B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.PLANKS, B.LOG, B.BRICK, B.GLASS, B.SAND,
  B.LEAVES, B.SNOW, B.GRAVEL, B.STONE_BRICK, B.BOOKSHELF, B.CACTUS, B.PUMPKIN,
  B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.GOLD_BLOCK,
  B.CLOTH_RED, B.CLOTH_BLUE, B.CLOTH_YELLOW, B.CLOTH_WHITE, B.CLOTH_BLACK, B.WATER,
];

export const DEFAULT_HOTBAR = [B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.PLANKS, B.LOG, B.BRICK, B.GLASS, B.LEAVES];

// Precomputed lookup tables for the hot meshing / physics loops.
export const IS_SOLID = new Uint8Array(256);
export const IS_OPAQUE = new Uint8Array(256); // fully blocks light/view (used for culling + AO)
export const RENDER = [];
for (let id = 0; id < BLOCKS.length; id++) {
  const b = BLOCKS[id];
  IS_SOLID[id] = b.solid ? 1 : 0;
  IS_OPAQUE[id] = b.render === 'opaque' ? 1 : 0;
  RENDER[id] = b.render;
}
