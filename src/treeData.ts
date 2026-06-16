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
  /** Node that must be purchased to unlock this world, or null if always open. */
  unlockNodeId: number | null;
}

/** Total number of worlds. Change this one constant to add/remove worlds. */
export const TOTAL_WORLDS = 7;
const NODES_PER_WORLD = 7; // template size for generated worlds (2..N)

// A short, human-readable summary of a node's effect (used in labels/tooltips).
export function effectText(n: TreeNode): string {
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

// World 1 — the bespoke "tutorial" tree. Its gateway (id 17) unlocks World 2.
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
];

// Generated worlds (2..N) share this 7-node template. Each has its own currency
// starting at zero, so it runs a fresh, World-1-scale progression. `parentGateId`
// is the previous world's gateway node, which gates this world's free entry.
function makeWorld(worldId: number, start: number, parentGateId: number, last: boolean): TreeNode[] {
  const gatewayId = start + NODES_PER_WORLD - 1;
  const gateway: TreeNode = last
    ? { id: gatewayId, name: 'Final Ascension', desc: 'Reach it to win.', cost: 15000, parent: start + 5, effect: Effect.GlobalMul, value: 2, isEnd: true, world: worldId, col: 3, row: 4 }
    : { id: gatewayId, name: `Unlock World ${worldId + 1}`, desc: `Opens the gateway to World ${worldId + 1}.`, cost: 15000, parent: start + 5, effect: Effect.GlobalMul, value: 1, unlocksWorld: worldId + 1, world: worldId, col: 3, row: 4 };
  return [
    { id: start + 0, name: 'Nexus', desc: 'A new realm. (Free)', cost: 0, parent: parentGateId, effect: Effect.ClickAdd, value: 1, world: worldId, col: 3, row: 0 },
    { id: start + 1, name: 'Quantum Clicks', desc: 'Every tap counts more.', cost: 20, parent: start + 0, effect: Effect.ClickAdd, value: 3, world: worldId, col: 1, row: 1 },
    { id: start + 2, name: 'Plasma Generator', desc: 'Passive flow.', cost: 40, parent: start + 0, effect: Effect.SecAdd, value: 2, world: worldId, col: 5, row: 1 },
    { id: start + 3, name: 'Time Warp', desc: 'Click power ×3.', cost: 120, parent: start + 1, effect: Effect.ClickMul, value: 3, world: worldId, col: 1, row: 2 },
    { id: start + 4, name: 'Antimatter', desc: 'Generators ×2.', cost: 200, parent: start + 2, effect: Effect.SecMul, value: 2, world: worldId, col: 5, row: 2 },
    { id: start + 5, name: 'Cosmic Synergy', desc: 'All output ×3.', cost: 1500, parent: start + 4, effect: Effect.GlobalMul, value: 3, world: worldId, col: 3, row: 3 },
    gateway,
  ];
}

export const TREE: TreeNode[] = [...WORLD1];
export const WORLDS: World[] = [{ id: 1, name: 'World 1', unlockNodeId: null }];

// Build worlds 2..TOTAL_WORLDS, chaining each to the previous world's gateway.
{
  let prevGateway = 17; // World 1's "Unlock World 2" node
  let nextId = WORLD1.length; // 18
  for (let w = 2; w <= TOTAL_WORLDS; w++) {
    WORLDS.push({ id: w, name: `World ${w}`, unlockNodeId: prevGateway });
    TREE.push(...makeWorld(w, nextId, prevGateway, w === TOTAL_WORLDS));
    prevGateway = nextId + NODES_PER_WORLD - 1;
    nextId += NODES_PER_WORLD;
  }
}

/** Nodes belonging to a given world, in id order. */
export function nodesForWorld(world: number): TreeNode[] {
  return TREE.filter((n) => n.world === world);
}

/** 0-based index of a world id within WORLDS (matches the engine's world index). */
export function worldIndex(worldId: number): number {
  return WORLDS.findIndex((w) => w.id === worldId);
}
