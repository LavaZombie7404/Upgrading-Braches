// =============================================================================
// Upgrade Tree — game engine (AssemblyScript -> WebAssembly)
//
// This module is the AUTHORITATIVE game state. The TypeScript host feeds it the
// tree topology at startup (reset + setNode + finalize), then only ever reads
// derived values back out. All economy math, prerequisite/purchase validation,
// and the idle tick live here.
//
// The boundary is intentionally numeric-only (no strings cross it), so the host
// needs no knowledge of WASM memory layout — just plain exported functions.
// =============================================================================

// --- Effect kinds -----------------------------------------------------------
// Keep these in sync with `Effect` in src/treeData.ts.
const EFF_CLICK_ADD: i32 = 0; // + flat points per manual click
const EFF_CLICK_MUL: i32 = 1; // x multiplier on per-click value
const EFF_SEC_ADD: i32 = 2; // + flat points per second (auto-generator)
const EFF_SEC_MUL: i32 = 3; // x multiplier on per-second value
const EFF_GLOBAL_MUL: i32 = 4; // x multiplier on BOTH click and per-second

// --- Tree data (filled in by the host at startup) ---------------------------
let nodeCount: i32 = 0;
let costs: Float64Array = new Float64Array(0);
let parents: Int32Array = new Int32Array(0); // -1 == root (no prerequisite)
let effectType: Int32Array = new Int32Array(0);
let effectValue: Float64Array = new Float64Array(0);
let isEnd: Uint8Array = new Uint8Array(0);
let purchased: Uint8Array = new Uint8Array(0);

// --- Live economy state -----------------------------------------------------
let points: f64 = 0; // current spendable points
let totalEarned: f64 = 0; // lifetime points earned (for stats)
let perClick: f64 = 1; // points per manual click
let perSec: f64 = 0; // points per second (idle)
let won: bool = false;

// --- Setup ------------------------------------------------------------------

/** Allocate storage for `n` nodes and clear all run state. */
export function reset(n: i32): void {
  nodeCount = n;
  costs = new Float64Array(n);
  parents = new Int32Array(n);
  effectType = new Int32Array(n);
  effectValue = new Float64Array(n);
  isEnd = new Uint8Array(n);
  purchased = new Uint8Array(n);
  points = 0;
  totalEarned = 0;
  won = false;
  recompute();
}

/** Define a single node. `parent` is -1 for a root node. `end` is 0 or 1. */
export function setNode(
  id: i32,
  cost: f64,
  parent: i32,
  eType: i32,
  eValue: f64,
  end: i32
): void {
  costs[id] = cost;
  parents[id] = parent;
  effectType[id] = eType;
  effectValue[id] = eValue;
  isEnd[id] = end == 0 ? 0 : 1;
}

/** Recompute derived rates from the set of purchased nodes. */
function recompute(): void {
  let clickAdd: f64 = 0;
  let clickMul: f64 = 1;
  let secAdd: f64 = 0;
  let secMul: f64 = 1;
  let globalMul: f64 = 1;

  for (let i = 0; i < nodeCount; i++) {
    if (purchased[i] == 0) continue;
    let t = effectType[i];
    let v = effectValue[i];
    if (t == EFF_CLICK_ADD) clickAdd += v;
    else if (t == EFF_CLICK_MUL) clickMul *= v;
    else if (t == EFF_SEC_ADD) secAdd += v;
    else if (t == EFF_SEC_MUL) secMul *= v;
    else if (t == EFF_GLOBAL_MUL) globalMul *= v;
  }

  // Base manual click is always worth 1 before bonuses.
  perClick = (1.0 + clickAdd) * clickMul * globalMul;
  perSec = secAdd * secMul * globalMul;
}

/** Call once after all setNode() calls (and after restoring a save). */
export function finalize(): void {
  recompute();
}

// --- Simulation -------------------------------------------------------------

/** Advance idle generation by `dt` seconds. */
export function tick(dt: f64): void {
  if (perSec > 0) {
    let gain = perSec * dt;
    points += gain;
    totalEarned += gain;
  }
}

/** Earn points from one manual click. */
export function click(): void {
  points += perClick;
  totalEarned += perClick;
}

// --- Purchasing -------------------------------------------------------------

function unlocked(id: i32): bool {
  let p = parents[id];
  return p < 0 || purchased[p] == 1;
}

/** Attempt to buy node `id`. Returns 1 on success, 0 on failure. */
export function buy(id: i32): i32 {
  if (purchased[id] == 1) return 0;
  if (!unlocked(id)) return 0;
  if (points < costs[id]) return 0;
  points -= costs[id];
  purchased[id] = 1;
  recompute();
  if (isEnd[id] == 1) won = true;
  return 1;
}

/** Mark a node purchased WITHOUT spending points (used to restore a save). */
export function setPurchased(id: i32): void {
  purchased[id] = 1;
  if (isEnd[id] == 1) won = true;
}

// --- Queries (read by the host each frame) ----------------------------------
export function isPurchased(id: i32): i32 {
  return purchased[id];
}

/** Prerequisite met but not yet bought (regardless of affordability). */
export function isUnlocked(id: i32): i32 {
  return purchased[id] == 0 && unlocked(id) ? 1 : 0;
}

/** Unlocked AND affordable right now. */
export function isBuyable(id: i32): i32 {
  if (purchased[id] == 1) return 0;
  if (!unlocked(id)) return 0;
  return points >= costs[id] ? 1 : 0;
}

export function getCost(id: i32): f64 {
  return costs[id];
}
export function getNodeCount(): i32 {
  return nodeCount;
}
export function getPoints(): f64 {
  return points;
}
export function setPoints(v: f64): void {
  points = v;
}
export function getTotalEarned(): f64 {
  return totalEarned;
}
export function setTotalEarned(v: f64): void {
  totalEarned = v;
}
export function getPerClick(): f64 {
  return perClick;
}
export function getPerSec(): f64 {
  return perSec;
}
export function hasWon(): i32 {
  return won ? 1 : 0;
}
