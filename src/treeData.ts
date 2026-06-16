// =============================================================================
// The upgrade tree — single source of truth.
//
// Numeric fields (cost, parent, effect, value, isEnd) are pushed into the WASM
// engine at startup. Presentation fields (name, desc, col, row) stay in TS and
// drive rendering only. `id` ties the two halves together and MUST equal the
// node's index in this array.
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
  /** Grid coordinates for layout (col = horizontal, row = depth). */
  col: number;
  row: number;
}

// A short, human-readable summary of a node's effect (used in tooltips/labels).
export function effectText(n: TreeNode): string {
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

export const TREE: TreeNode[] = [
  // Root ----------------------------------------------------------------------
  { id: 0, name: 'Awakening', desc: 'It begins. (Free)', cost: 0, parent: -1, effect: Effect.ClickAdd, value: 1, col: 3, row: 0 },

  // Row 1 — the fork: click power (left) vs. automation (right) ----------------
  { id: 1, name: 'Sharper Clicks', desc: 'Every tap counts more.', cost: 25, parent: 0, effect: Effect.ClickAdd, value: 2, col: 1, row: 1 },
  { id: 2, name: 'First Generator', desc: 'Points while you idle.', cost: 50, parent: 0, effect: Effect.SecAdd, value: 1, col: 5, row: 1 },

  // Row 2 ----------------------------------------------------------------------
  { id: 3, name: 'Double Tap', desc: 'Click power doubled.', cost: 100, parent: 1, effect: Effect.ClickMul, value: 2, col: 0, row: 2 },
  { id: 4, name: 'Click Surge', desc: 'A burst of force.', cost: 150, parent: 1, effect: Effect.ClickAdd, value: 5, col: 2, row: 2 },
  { id: 5, name: 'Generator II', desc: 'More passive flow.', cost: 200, parent: 2, effect: Effect.SecAdd, value: 3, col: 4, row: 2 },
  { id: 6, name: 'Overclock', desc: 'Generators run hot.', cost: 250, parent: 2, effect: Effect.SecMul, value: 1.5, col: 6, row: 2 },

  // Row 3 ----------------------------------------------------------------------
  { id: 7, name: 'Power Clicks', desc: 'Click power doubled again.', cost: 500, parent: 4, effect: Effect.ClickMul, value: 2, col: 2, row: 3 },
  { id: 8, name: 'Auto Factory', desc: 'Serious automation.', cost: 600, parent: 5, effect: Effect.SecAdd, value: 10, col: 4, row: 3 },
  { id: 9, name: 'Fusion', desc: 'Generators doubled.', cost: 800, parent: 6, effect: Effect.SecMul, value: 2, col: 6, row: 3 },

  // Row 4 ----------------------------------------------------------------------
  { id: 10, name: 'Synergy Core', desc: 'All output boosted.', cost: 2000, parent: 7, effect: Effect.GlobalMul, value: 1.5, col: 2, row: 4 },
  { id: 11, name: 'Mega Generator', desc: 'Industrial scale.', cost: 2500, parent: 8, effect: Effect.SecAdd, value: 50, col: 4, row: 4 },
  { id: 12, name: 'Hyperdrive', desc: 'Generators doubled.', cost: 3000, parent: 9, effect: Effect.SecMul, value: 2, col: 6, row: 4 },

  // Row 5 ----------------------------------------------------------------------
  { id: 13, name: 'Click Mastery', desc: 'Click power ×5.', cost: 8000, parent: 10, effect: Effect.ClickMul, value: 5, col: 2, row: 5 },
  { id: 14, name: 'Singularity', desc: 'All output doubled.', cost: 10000, parent: 11, effect: Effect.GlobalMul, value: 2, col: 4, row: 5 },
  { id: 15, name: 'Reactor', desc: 'Generators tripled.', cost: 12000, parent: 12, effect: Effect.SecMul, value: 3, col: 6, row: 5 },

  // Row 6 — convergence --------------------------------------------------------
  { id: 16, name: 'Ascension', desc: 'All output ×3.', cost: 50000, parent: 14, effect: Effect.GlobalMul, value: 3, col: 4, row: 6 },

  // Row 7 — the goal -----------------------------------------------------------
  { id: 17, name: 'The End', desc: 'Reach it to win.', cost: 250000, parent: 16, effect: Effect.GlobalMul, value: 1, isEnd: true, col: 4, row: 7 },
];
