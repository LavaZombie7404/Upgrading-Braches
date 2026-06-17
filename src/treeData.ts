// =============================================================================
// The upgrade tree — single source of truth.
//
// Numeric fields (cost, parent, effect, value, isEnd, world) are pushed into the
// WASM engine at startup. Presentation fields (name, desc, col, row) stay in TS
// and drive rendering only. `id` ties the two halves together and MUST equal the
// node's index in this array.
//
// Each world has its OWN independent currency (see engine). Worlds form a chain:
// every world's final node either unlocks the next world ("Unlock World N+1") or,
// for the last world, wins the game. World 1 is hand-authored; worlds 2..N are
// generated from a shared template, so the world count is a single constant.
// =============================================================================

/** Effect kinds — keep in sync with the EFF_* constants in assembly/index.ts. */
export const enum Effect {
  ClickAdd = 0, // + flat points per click
  ClickMul = 1, // x per-click multiplier
  SecAdd = 2, // + flat points per second
  SecMul = 3, // x per-second multiplier
  GlobalMul = 4, // x multiplier on both click and per-second
}

export interface TreeNode {
  id: number;
  name: string;
  desc: string;
  cost: number;
  /** Prerequisite node id, or -1 for a root node (always available). */
  parent: number;
  effect: Effect;
  value: number;
  /** Buying an `isEnd` node wins the game. */
  isEnd?: boolean;
  /** Buying an `isRebirth` node grants a rebirth (the last world's final node). */
  isRebirth?: boolean;
  /** If set, buying this node unlocks the given world in the dropdown. */
  unlocksWorld?: number;
  /** Which world this node belongs to (for the dropdown + rendering). */
  world: number;
  /** Grid coordinates for layout within its world (col = horizontal, row = depth). */
  col: number;
  row: number;
}

export interface World {
  id: number;
  name: string;
  /** Display name of this world's independent currency (shown in the HUD). */
  currency: string;
  /** Node that must be purchased to unlock this world, or null if always open. */
  unlockNodeId: number | null;
}

/** Total number of worlds. Must match the number of WORLD1 + BLUEPRINTS below. */
export const TOTAL_WORLDS = 7;

// The bonus ("useless") tree is its OWN board with its OWN currency. You don't
// spend it on the main game — instead, holding enough of it boosts ALL output
// (see HOARD_TIERS). It's a side branch off World 1's gateway, so it carries a
// high world id and is listed last (never shifting the linear worlds' indices).
export const BONUS_WORLD_ID = 100;
export const BONUS_CURRENCY = 'Multiplier';
const BONUS_UNLOCK_NODE_ID = 17; // World 1's "Unlock World 2" gateway

// A short, human-readable summary of a node's effect (used in labels/tooltips).
export function effectText(n: TreeNode): string {
  if (n.isRebirth) return '★ Rebirth ★';
  if (n.unlocksWorld) return `Unlocks World ${n.unlocksWorld}`;
  switch (n.effect) {
    case Effect.ClickAdd:
      return `+${n.value} per click`;
    case Effect.ClickMul:
      return `×${n.value} click power`;
    case Effect.SecAdd:
      return `+${n.value}/sec`;
    case Effect.SecMul:
      return `×${n.value} per-second`;
    case Effect.GlobalMul:
      return `×${n.value} all output`;
  }
}

// The bonus ("useless") tree — a deliberately oversized big-number playground
// that mints its OWN currency (Multiplier), revealed once "Unlock World 2" is
// bought. Generated, so its size is just two constants. The root is free so you
// can bootstrap Multiplier by clicking; a grid of escalating +click/+sec nodes
// (paid for in Multiplier) hangs beneath it.
const BONUS_COLS = 7;
const BONUS_ROWS = 7; // 1 root + BONUS_COLS * BONUS_ROWS grid nodes
const BONUS_NAMES: string[] = [
  'Bragging Rights', 'Participation Trophy', 'Gold Star', 'Honorable Mention', 'Pat on the Back',
  'Inflated Ego', 'Number Go Brrr', 'Diminishing Returns', 'Sunk Cost Fallacy', 'More Cowbell',
  'Infinite Scroll', 'Touch Grass', 'Big Red Button', 'Decorative Plant', 'Certificate of Nothing',
  'Existential Dread', 'Peak Performance', 'The Smugularity', 'Participation Ribbon', 'Quantum Smugness',
  'Ego Boost', 'Victory Lap', 'Humble Brag', 'Flex Capacitor', 'Clout', 'Internet Points',
  'Imaginary Friends', 'Moral Support', 'Thoughts and Prayers', 'Good Vibes', 'Main Character Energy',
  'Rizz', 'Sigma Grindset', 'Hustle Culture', 'Side Quest', 'Achievement Unlocked', 'Loot Box',
  'Daily Streak', 'Battle Pass', 'Microtransaction', 'Whale Status', 'Pay to Win', 'Cosmetic Only',
  'Limited Edition', 'Collectors Item', 'Mint Condition', 'Pointless NFT', 'Blockchain Hype',
  'Synergy Buzzword', 'Thought Leadership', 'Disruptive Innovation', 'Growth Hacking',
  'Strategic Pivot', 'Unicorn Status', 'Vanity Metric', 'Funny Number',
];

function makeBonusTree(start: number, rootParent: number): TreeNode[] {
  // Root is FREE so a fresh Multiplier board can be bootstrapped by clicking.
  const nodes: TreeNode[] = [
    { id: start, name: BONUS_NAMES[0], desc: 'Free. +10K Multiplier per click — start here.', cost: 0, parent: rootParent, effect: Effect.ClickAdd, value: 10_000, world: BONUS_WORLD_ID, col: 4, row: 0 },
  ];
  for (let r = 0; r < BONUS_ROWS; r++) {
    for (let c = 0; c < BONUS_COLS; c++) {
      const k = r * BONUS_COLS + c;
      const id = start + 1 + k;
      const parent = r === 0 ? start : id - BONUS_COLS; // top row hangs off the root
      const isClick = (r + c) % 2 === 0;
      const value = 10_000 * Math.pow(4, r); // 10K, 40K, 160K, ... per row
      nodes.push({
        id,
        name: BONUS_NAMES[1 + k],
        desc: isClick ? '+Multiplier per click.' : '+Multiplier per second.',
        cost: value * 3, // paid in Multiplier
        parent,
        effect: isClick ? Effect.ClickAdd : Effect.SecAdd,
        value,
        world: BONUS_WORLD_ID,
        col: c + 1,
        row: 1 + r,
      });
    }
  }
  return nodes;
}

// World 1 — the bespoke "tutorial" tree. Its gateway (id 17) unlocks World 2,
// and a big bonus tree (ids 18+) hangs beneath it.
const WORLD1: TreeNode[] = [
  // Root ----------------------------------------------------------------------
  { id: 0, name: 'Awakening', desc: 'It begins. (Free)', cost: 0, parent: -1, effect: Effect.ClickAdd, value: 1, world: 1, col: 3, row: 0 },

  // Row 1 — the fork: click power (left) vs. automation (right) ----------------
  { id: 1, name: 'Sharper Clicks', desc: 'Every tap counts more.', cost: 15, parent: 0, effect: Effect.ClickAdd, value: 2, world: 1, col: 1, row: 1 },
  { id: 2, name: 'First Generator', desc: 'Points while you idle.', cost: 35, parent: 0, effect: Effect.SecAdd, value: 1, world: 1, col: 5, row: 1 },

  // Row 2 ----------------------------------------------------------------------
  { id: 3, name: 'Double Tap', desc: 'Click power doubled.', cost: 65, parent: 1, effect: Effect.ClickMul, value: 2, world: 1, col: 0, row: 2 },
  { id: 4, name: 'Click Surge', desc: 'A burst of force.', cost: 100, parent: 1, effect: Effect.ClickAdd, value: 5, world: 1, col: 2, row: 2 },
  { id: 5, name: 'Generator II', desc: 'More passive flow.', cost: 140, parent: 2, effect: Effect.SecAdd, value: 3, world: 1, col: 4, row: 2 },
  { id: 6, name: 'Overclock', desc: 'Generators run hot.', cost: 175, parent: 2, effect: Effect.SecMul, value: 1.5, world: 1, col: 6, row: 2 },

  // Row 3 ----------------------------------------------------------------------
  { id: 7, name: 'Power Clicks', desc: 'Click power doubled again.', cost: 350, parent: 4, effect: Effect.ClickMul, value: 2, world: 1, col: 2, row: 3 },
  { id: 8, name: 'Auto Factory', desc: 'Serious automation.', cost: 420, parent: 5, effect: Effect.SecAdd, value: 10, world: 1, col: 4, row: 3 },
  { id: 9, name: 'Fusion', desc: 'Generators doubled.', cost: 550, parent: 6, effect: Effect.SecMul, value: 2, world: 1, col: 6, row: 3 },

  // Row 4 ----------------------------------------------------------------------
  { id: 10, name: 'Synergy Core', desc: 'All output boosted.', cost: 1400, parent: 7, effect: Effect.GlobalMul, value: 1.5, world: 1, col: 2, row: 4 },
  { id: 11, name: 'Mega Generator', desc: 'Industrial scale.', cost: 1750, parent: 8, effect: Effect.SecAdd, value: 50, world: 1, col: 4, row: 4 },
  { id: 12, name: 'Hyperdrive', desc: 'Generators doubled.', cost: 2000, parent: 9, effect: Effect.SecMul, value: 2, world: 1, col: 6, row: 4 },

  // Row 5 ----------------------------------------------------------------------
  { id: 13, name: 'Click Mastery', desc: 'Click power ×5.', cost: 5500, parent: 10, effect: Effect.ClickMul, value: 5, world: 1, col: 2, row: 5 },
  { id: 14, name: 'Singularity', desc: 'All output doubled.', cost: 7000, parent: 11, effect: Effect.GlobalMul, value: 2, world: 1, col: 4, row: 5 },
  { id: 15, name: 'Reactor', desc: 'Generators tripled.', cost: 8000, parent: 12, effect: Effect.SecMul, value: 3, world: 1, col: 6, row: 5 },

  // Row 6 — convergence --------------------------------------------------------
  { id: 16, name: 'Ascension', desc: 'All output ×3.', cost: 35000, parent: 14, effect: Effect.GlobalMul, value: 3, world: 1, col: 4, row: 6 },

  // Row 7 — the gateway --------------------------------------------------------
  { id: 17, name: 'Unlock World 2', desc: 'Opens the gateway to World 2.', cost: 175000, parent: 16, effect: Effect.GlobalMul, value: 1, unlocksWorld: 2, world: 1, col: 4, row: 7 },

  // The bonus tree (generated) lives on its OWN board (BONUS_WORLD_ID) in its
  // own Multiplier currency, but its node ids follow World 1's and its root
  // hangs off the gateway, so it's revealed once "Unlock World 2" is bought.
  ...makeBonusTree(18, BONUS_UNLOCK_NODE_ID),
];

/** Each generated world deals in ~WORLD_SCALE× bigger numbers than the previous. */
const WORLD_SCALE = 5;

// A node within a world blueprint. `parent` is a LOCAL index into the blueprint's
// own node list, or -1 for the entry root (which chains to the previous world's
// gateway). Costs scale by the world's factor; flat income (ClickAdd/SecAdd) does
// too, while multipliers stay constant.
interface NodeSpec {
  name: string;
  desc: string;
  parent: number;
  effect: Effect;
  value: number;
  cost: number;
  col: number;
  row: number;
}

interface WorldBlueprint {
  title: string;
  /** This world's independent currency name. */
  currency: string;
  /** node[0] is the free entry root; the LAST node is the completion/gateway
   *  (its name/effect are overridden to "Unlock World N+1" or "Final Ascension"). */
  nodes: NodeSpec[];
}

// Each generated world (index = worldId - 2) has its OWN shape and theme. Shapes
// vary in node count, branching and silhouette so no two worlds play alike.
const GATE = { name: 'Gateway', desc: '', effect: Effect.GlobalMul, value: 1 }; // overridden in makeWorld
const BLUEPRINTS: WorldBlueprint[] = [
  // World 2 — "Quantum Reach": a 2-wide diamond (unchanged from before).
  {
    title: 'Quantum Reach',
    currency: 'Quanta',
    nodes: [
      { name: 'Nexus', desc: 'A new realm. (Free)', parent: -1, effect: Effect.ClickAdd, value: 1, cost: 0, col: 3, row: 0 },
      { name: 'Quantum Clicks', desc: 'Every tap counts more.', parent: 0, effect: Effect.ClickAdd, value: 3, cost: 20, col: 1, row: 1 },
      { name: 'Plasma Generator', desc: 'Passive flow.', parent: 0, effect: Effect.SecAdd, value: 2, cost: 40, col: 5, row: 1 },
      { name: 'Time Warp', desc: 'Click power ×3.', parent: 1, effect: Effect.ClickMul, value: 3, cost: 120, col: 1, row: 2 },
      { name: 'Antimatter', desc: 'Generators ×2.', parent: 2, effect: Effect.SecMul, value: 2, cost: 200, col: 5, row: 2 },
      { name: 'Cosmic Synergy', desc: 'All output ×3.', parent: 4, effect: Effect.GlobalMul, value: 3, cost: 800, col: 3, row: 3 },
      { ...GATE, parent: 5, cost: 4000, col: 3, row: 4 },
    ],
  },
  // World 3 — "Stellar Forge": a 3-wide fan that narrows to a spire.
  {
    title: 'Stellar Forge',
    currency: 'Stardust',
    nodes: [
      { name: 'Stardust', desc: 'A new realm. (Free)', parent: -1, effect: Effect.ClickAdd, value: 1, cost: 0, col: 3, row: 0 },
      { name: 'Solar Taps', desc: 'Every tap counts more.', parent: 0, effect: Effect.ClickAdd, value: 4, cost: 25, col: 1, row: 1 },
      { name: 'Fusion Reactor', desc: 'Passive flow.', parent: 0, effect: Effect.SecAdd, value: 3, cost: 50, col: 3, row: 1 },
      { name: 'Ion Drive', desc: 'Click power ×2.', parent: 0, effect: Effect.ClickMul, value: 2, cost: 110, col: 5, row: 1 },
      { name: 'Nova Burst', desc: 'Click power ×2.', parent: 1, effect: Effect.ClickMul, value: 2, cost: 220, col: 1, row: 2 },
      { name: 'Pulsar Core', desc: 'Generators ×2.', parent: 2, effect: Effect.SecMul, value: 2, cost: 300, col: 3, row: 2 },
      { name: 'Galactic Harmony', desc: 'All output ×3.', parent: 5, effect: Effect.GlobalMul, value: 3, cost: 900, col: 3, row: 3 },
      { ...GATE, parent: 6, cost: 4500, col: 3, row: 4 },
    ],
  },
  // World 4 — "Void Dominion": a tall, narrow spine with a single offshoot.
  {
    title: 'Void Dominion',
    currency: 'Void Shards',
    nodes: [
      { name: 'Rift', desc: 'A new realm. (Free)', parent: -1, effect: Effect.ClickAdd, value: 1, cost: 0, col: 2, row: 0 },
      { name: 'Dark Clicks', desc: 'Every tap counts more.', parent: 0, effect: Effect.ClickAdd, value: 5, cost: 30, col: 2, row: 1 },
      { name: 'Entropy Coil', desc: 'Generators ×2.', parent: 0, effect: Effect.SecMul, value: 2, cost: 150, col: 4, row: 1 },
      { name: 'Void Engine', desc: 'Passive flow.', parent: 1, effect: Effect.SecAdd, value: 4, cost: 70, col: 2, row: 2 },
      { name: 'Abyssal Unity', desc: 'All output ×3.', parent: 3, effect: Effect.GlobalMul, value: 3, cost: 700, col: 2, row: 3 },
      { ...GATE, parent: 4, cost: 3500, col: 2, row: 4 },
    ],
  },
  // World 5 — "Chrono Spire": a stacked double-diamond.
  {
    title: 'Chrono Spire',
    currency: 'Chronons',
    nodes: [
      { name: 'Origin', desc: 'A new realm. (Free)', parent: -1, effect: Effect.ClickAdd, value: 1, cost: 0, col: 3, row: 0 },
      { name: 'Tempo Taps', desc: 'Every tap counts more.', parent: 0, effect: Effect.ClickAdd, value: 3, cost: 25, col: 1, row: 1 },
      { name: 'Chrono Mill', desc: 'Passive flow.', parent: 0, effect: Effect.SecAdd, value: 2, cost: 45, col: 5, row: 1 },
      { name: 'Warp Cascade', desc: 'Click power ×2.', parent: 1, effect: Effect.ClickMul, value: 2, cost: 130, col: 1, row: 2 },
      { name: 'Epoch Drive', desc: 'Generators ×2.', parent: 2, effect: Effect.SecMul, value: 2, cost: 210, col: 5, row: 2 },
      { name: 'Time Lattice', desc: 'All output ×2.', parent: 3, effect: Effect.GlobalMul, value: 2, cost: 450, col: 3, row: 3 },
      { name: 'Quantum Loop', desc: 'Click power ×2.', parent: 5, effect: Effect.ClickMul, value: 2, cost: 900, col: 1, row: 4 },
      { name: 'Eternal Sync', desc: 'Big passive flow.', parent: 5, effect: Effect.SecAdd, value: 40, cost: 1100, col: 5, row: 4 },
      { ...GATE, parent: 7, cost: 5000, col: 3, row: 5 },
    ],
  },
  // World 6 — "Aether Crown": a bushy binary tree (four leaves).
  {
    title: 'Aether Crown',
    currency: 'Aether',
    nodes: [
      { name: 'Spark', desc: 'A new realm. (Free)', parent: -1, effect: Effect.ClickAdd, value: 1, cost: 0, col: 4, row: 0 },
      { name: 'Aether Taps', desc: 'Every tap counts more.', parent: 0, effect: Effect.ClickAdd, value: 4, cost: 25, col: 2, row: 1 },
      { name: 'Mana Wellspring', desc: 'Passive flow.', parent: 0, effect: Effect.SecAdd, value: 3, cost: 50, col: 6, row: 1 },
      { name: 'Surge Rite', desc: 'Click power ×2.', parent: 1, effect: Effect.ClickMul, value: 2, cost: 140, col: 1, row: 2 },
      { name: 'Rune Etching', desc: 'Even more per tap.', parent: 1, effect: Effect.ClickAdd, value: 10, cost: 160, col: 3, row: 2 },
      { name: 'Ley Reactor', desc: 'Generators ×2.', parent: 2, effect: Effect.SecMul, value: 2, cost: 200, col: 5, row: 2 },
      { name: 'Font of Mana', desc: 'More passive flow.', parent: 2, effect: Effect.SecAdd, value: 12, cost: 240, col: 7, row: 2 },
      { name: 'Arcane Concord', desc: 'All output ×3.', parent: 5, effect: Effect.GlobalMul, value: 3, cost: 1000, col: 4, row: 3 },
      { ...GATE, parent: 7, cost: 4500, col: 4, row: 4 },
    ],
  },
  // World 7 — "Omega Throne": a grand, two-tower structure into the finale.
  {
    title: 'Omega Throne',
    currency: 'Omega',
    nodes: [
      { name: 'Genesis', desc: 'A new realm. (Free)', parent: -1, effect: Effect.ClickAdd, value: 1, cost: 0, col: 4, row: 0 },
      { name: 'Omega Clicks', desc: 'Every tap counts more.', parent: 0, effect: Effect.ClickAdd, value: 5, cost: 30, col: 2, row: 1 },
      { name: 'Infinity Core', desc: 'Passive flow.', parent: 0, effect: Effect.SecAdd, value: 4, cost: 60, col: 6, row: 1 },
      { name: 'Apex Strike', desc: 'Click power ×2.', parent: 1, effect: Effect.ClickMul, value: 2, cost: 150, col: 1, row: 2 },
      { name: 'Flux Capacitor', desc: 'More passive flow.', parent: 1, effect: Effect.SecAdd, value: 10, cost: 180, col: 3, row: 2 },
      { name: 'Eternity Engine', desc: 'Generators ×2.', parent: 2, effect: Effect.SecMul, value: 2, cost: 220, col: 5, row: 2 },
      { name: 'Singularity Well', desc: 'Even more per tap.', parent: 2, effect: Effect.ClickAdd, value: 30, cost: 260, col: 7, row: 2 },
      { name: 'Cosmic Crown', desc: 'All output ×2.', parent: 3, effect: Effect.GlobalMul, value: 2, cost: 600, col: 2, row: 3 },
      { name: 'Astral Nexus', desc: 'All output ×2.', parent: 5, effect: Effect.GlobalMul, value: 2, cost: 700, col: 6, row: 3 },
      { name: 'Absolute Synergy', desc: 'All output ×2.', parent: 7, effect: Effect.GlobalMul, value: 2, cost: 2000, col: 4, row: 4 },
      { ...GATE, parent: 9, cost: 6000, col: 4, row: 5 },
    ],
  },
];

// Instantiate one world from its blueprint: assign global ids, chain the entry
// root to the previous world's gateway, apply the scale factor, and turn the
// last blueprint node into the gateway ("Unlock World N+1") or victory node.
function makeWorld(worldId: number, start: number, parentGateId: number, last: boolean): TreeNode[] {
  const f = Math.pow(WORLD_SCALE, worldId - 2); // 1, 5, 25, ... for worlds 2, 3, 4, ...
  const bp = blueprintFor(worldId);
  const coreLen = bp.nodes.length;

  return bp.nodes.map((spec, i) => {
    const id = start + i;
    const parent = spec.parent < 0 ? parentGateId : start + spec.parent;
    const cost = spec.cost * f;
    if (i === coreLen - 1) {
      // The LAST world's final node grants a rebirth; every other world's
      // final node unlocks the next world.
      return last
        ? { id, name: 'Rebirth', desc: 'Beat the game: gain a rebirth (+1 world, ×rebirths to all output).', cost, parent, effect: Effect.GlobalMul, value: 1, isRebirth: true, world: worldId, col: spec.col, row: spec.row }
        : { id, name: `Unlock World ${worldId + 1}`, desc: `Opens the gateway to World ${worldId + 1}.`, cost, parent, effect: Effect.GlobalMul, value: 1, unlocksWorld: worldId + 1, world: worldId, col: spec.col, row: spec.row };
    }
    // Flat income scales with the world; multipliers are ratios and don't.
    const scales = spec.effect === Effect.ClickAdd || spec.effect === Effect.SecAdd;
    return { id, name: spec.name, desc: spec.desc, cost, parent, effect: spec.effect, value: scales ? spec.value * f : spec.value, world: worldId, col: spec.col, row: spec.row };
  });
}

// Worlds beyond the 6 hand-authored blueprints (i.e. extra worlds gained from
// rebirths) cycle through the blueprints again.
function blueprintFor(worldId: number): WorldBlueprint {
  return BLUEPRINTS[(worldId - 2) % BLUEPRINTS.length];
}

// TREE and WORLDS are rebuilt whenever the rebirth count changes (rebirths add
// worlds), so they're mutable live bindings rather than consts.
export let TREE: TreeNode[] = [];
export let WORLDS: World[] = [];

/** Global output multiplier granted by rebirths (3 rebirths → ×3, etc.). */
export function rebirthMultiplier(rebirths: number): number {
  return Math.max(1, rebirths);
}

// The World 1 "Points" hoard — the absurd pile the bonus tree pours out — now
// pays for itself: holding enough Multiplier grants a global multiplier on EVERY
// world's output. These are the named anchor tiers; past the top one the boost
// keeps growing FOREVER — see hoardMultiplier (no cap).
export const HOARD_TIERS: { at: number; mul: number }[] = [
  { at: 1e6, mul: 1.5 }, //   1,000,000
  { at: 1e7, mul: 3 }, //    10,000,000
  { at: 1e8, mul: 5 }, //   100,000,000
  { at: 1e10, mul: 8.5 }, //  10,000,000,000
  { at: 1e11, mul: 10 }, // 100,000,000,000
];

// Above the top anchor the boost rises by this much for each extra ×10 held —
// matching the final visible step (×8.5 → ×10 across one decade).
const HOARD_PER_DECADE = 1.5;
const TOP_TIER = HOARD_TIERS[HOARD_TIERS.length - 1]; // { at: 1e11, mul: 10 }
const TOP_DECADE = Math.log10(TOP_TIER.at); // 11

/** Global output multiplier from holding `points` of Multiplier. Unbounded:
 *  steps up by HOARD_PER_DECADE for every power of ten beyond the top anchor. */
export function hoardMultiplier(points: number): number {
  if (points >= TOP_TIER.at) {
    const decades = Math.floor(Math.log10(points)) - TOP_DECADE; // 0 at 1e11
    return TOP_TIER.mul + HOARD_PER_DECADE * decades;
  }
  let mul = 1;
  for (const t of HOARD_TIERS) if (points >= t.at) mul = t.mul;
  return mul;
}

/** The next tier above `points` (its threshold + the multiplier it grants).
 *  Never null — past the table, the next ×10 step is synthesised on the fly. */
export function nextHoardTier(points: number): { at: number; mul: number } {
  const within = HOARD_TIERS.find((t) => points < t.at);
  if (within) return within;
  const decade = Math.max(TOP_DECADE, Math.floor(Math.log10(points))); // current ×10 step
  const at = Math.pow(10, decade + 1);
  return { at, mul: hoardMultiplier(at) };
}

/** (Re)build the whole game for a rebirth count: TOTAL_WORLDS + rebirths worlds,
 *  the last of which ends in a Rebirth node. Updates the exported TREE/WORLDS. */
export function rebuildGame(rebirths: number): void {
  const totalWorlds = TOTAL_WORLDS + rebirths;
  const tree: TreeNode[] = [...WORLD1];
  const worlds: World[] = [{ id: 1, name: 'World 1', currency: 'Points', unlockNodeId: null }];

  let prevGateway = 17; // World 1's gateway node
  let nextId = WORLD1.length;
  for (let w = 2; w <= totalWorlds; w++) {
    const bp = blueprintFor(w);
    worlds.push({ id: w, name: `World ${w}`, currency: bp.currency, unlockNodeId: prevGateway });
    const nodes = makeWorld(w, nextId, prevGateway, w === totalWorlds);
    tree.push(...nodes);
    prevGateway = nextId + bp.nodes.length - 1; // gateway = the world's last node
    nextId += nodes.length;
  }

  // The bonus tree's board. Listed LAST so its presence never shifts the linear
  // worlds' engine indices (old saves keep their per-world balances). Unlocked
  // once World 1's gateway is bought.
  worlds.push({ id: BONUS_WORLD_ID, name: 'Multiplier', currency: BONUS_CURRENCY, unlockNodeId: BONUS_UNLOCK_NODE_ID });

  TREE = tree;
  WORLDS = worlds;
}

// Populate the default (no-rebirth) game at import time.
rebuildGame(0);

/** Nodes belonging to a given world, in id order. */
export function nodesForWorld(world: number): TreeNode[] {
  return TREE.filter((n) => n.world === world);
}

/** 0-based index of a world id within WORLDS (matches the engine's world index). */
export function worldIndex(worldId: number): number {
  return WORLDS.findIndex((w) => w.id === worldId);
}
