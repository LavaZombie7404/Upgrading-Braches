// =============================================================================
// Upgrade Tree — game engine (AssemblyScript -> WebAssembly)
//
// This module is the AUTHORITATIVE game state. The TypeScript host feeds it the
// tree topology at startup (reset + setNode + finalize), then only ever reads
// derived values back out. All economy math, prerequisite/purchase validation,
// and the idle tick live here.
//
// Each WORLD has its own independent economy (points, totals, per-click and
// per-second rates) computed only from that world's purchased nodes. Worlds
// share the global `purchased` set so cross-world prerequisites (e.g. World 2's
// entry depends on World 1's gateway node) still gate correctly. The idle tick
// advances every world, so generators keep producing in worlds you aren't
// currently viewing.
//
// The boundary is intentionally numeric-only (no strings cross it).
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
let worldCount: i32 = 0;
let costs: Float64Array = new Float64Array(0);
let parents: Int32Array = new Int32Array(0); // -1 == root (no prerequisite)
let effectType: Int32Array = new Int32Array(0);
let effectValue: Float64Array = new Float64Array(0);
let nodeWorld: Int32Array = new Int32Array(0); // 0-based world index per node
let isEnd: Uint8Array = new Uint8Array(0);
let purchased: Uint8Array = new Uint8Array(0);

// --- Per-world economy state ------------------------------------------------
let points: Float64Array = new Float64Array(0);
let totalEarned: Float64Array = new Float64Array(0);
let perClick: Float64Array = new Float64Array(0);
let perSec: Float64Array = new Float64Array(0);
let globalMul: f64 = 1; // rebirth multiplier applied to every world's output
let won: bool = false;

// --- Setup ------------------------------------------------------------------

/** Allocate storage for `n` nodes across `worlds` worlds, clearing run state. */
export function reset(n: i32, worlds: i32): void {
  nodeCount = n;
  worldCount = worlds;
  costs = new Float64Array(n);
  parents = new Int32Array(n);
  effectType = new Int32Array(n);
  effectValue = new Float64Array(n);
  nodeWorld = new Int32Array(n);
  isEnd = new Uint8Array(n);
  purchased = new Uint8Array(n);
  points = new Float64Array(worlds);
  totalEarned = new Float64Array(worlds);
  perClick = new Float64Array(worlds);
  perSec = new Float64Array(worlds);
  globalMul = 1;
  won = false;
  recomputeAll();
}

/** Set the rebirth multiplier applied to every world's per-click and per-sec. */
export function setGlobalMul(g: f64): void {
  globalMul = g;
  recomputeAll();
}

/** Define a single node. `parent` is -1 for a root node. `end` is 0 or 1. */
export function setNode(
  id: i32,
  cost: f64,
  parent: i32,
  eType: i32,
  eValue: f64,
  world: i32,
  end: i32
): void {
  costs[id] = cost;
  parents[id] = parent;
  effectType[id] = eType;
  effectValue[id] = eValue;
  nodeWorld[id] = world;
  isEnd[id] = end == 0 ? 0 : 1;
}

/** Recompute one world's rates from its purchased nodes. */
function recompute(w: i32): void {
  let clickAdd: f64 = 0;
  let clickMul: f64 = 1;
  let secAdd: f64 = 0;
  let secMul: f64 = 1;
  let worldGlobal: f64 = 1; // product of this world's GlobalMul nodes

  for (let i = 0; i < nodeCount; i++) {
    if (purchased[i] == 0) continue;
    if (nodeWorld[i] != w) continue;
    let t = effectType[i];
    let v = effectValue[i];
    if (t == EFF_CLICK_ADD) clickAdd += v;
    else if (t == EFF_CLICK_MUL) clickMul *= v;
    else if (t == EFF_SEC_ADD) secAdd += v;
    else if (t == EFF_SEC_MUL) secMul *= v;
    else if (t == EFF_GLOBAL_MUL) worldGlobal *= v;
  }

  // Base manual click is always worth 1 before bonuses. The rebirth multiplier
  // (globalMul) scales every world's output.
  perClick[w] = (1.0 + clickAdd) * clickMul * worldGlobal * globalMul;
  perSec[w] = secAdd * secMul * worldGlobal * globalMul;
}

function recomputeAll(): void {
  for (let w = 0; w < worldCount; w++) recompute(w);
}

/** Call once after all setNode() calls (and after restoring a save). */
export function finalize(): void {
  recomputeAll();
}

// --- Simulation -------------------------------------------------------------

/** Advance idle generation by `dt` seconds in every world. */
export function tick(dt: f64): void {
  for (let w = 0; w < worldCount; w++) {
    let ps = perSec[w];
    if (ps > 0) {
      let gain = ps * dt;
      points[w] += gain;
      totalEarned[w] += gain;
    }
  }
}

/** Earn points from one manual click in world `w`. */
export function click(w: i32): void {
  let pc = perClick[w];
  points[w] += pc;
  totalEarned[w] += pc;
}

// --- Purchasing -------------------------------------------------------------

function unlocked(id: i32): bool {
  let p = parents[id];
  return p < 0 || purchased[p] == 1;
}

/** Attempt to buy node `id` with its world's currency. 1 = success, 0 = fail. */
export function buy(id: i32): i32 {
  if (purchased[id] == 1) return 0;
  if (!unlocked(id)) return 0;
  let w = nodeWorld[id];
  if (points[w] < costs[id]) return 0;
  points[w] -= costs[id];
  purchased[id] = 1;
  recompute(w);
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

/** Unlocked AND affordable in its world's currency right now. */
export function isBuyable(id: i32): i32 {
  if (purchased[id] == 1) return 0;
  if (!unlocked(id)) return 0;
  let w = nodeWorld[id];
  return points[w] >= costs[id] ? 1 : 0;
}

export function getCost(id: i32): f64 {
  return costs[id];
}
export function getNodeCount(): i32 {
  return nodeCount;
}
export function getPoints(w: i32): f64 {
  return points[w];
}
export function setPoints(w: i32, v: f64): void {
  points[w] = v;
}
export function getTotalEarned(w: i32): f64 {
  return totalEarned[w];
}
export function setTotalEarned(w: i32, v: f64): void {
  totalEarned[w] = v;
}
export function getPerClick(w: i32): f64 {
  return perClick[w];
}
export function getPerSec(w: i32): f64 {
  return perSec[w];
}
export function hasWon(): i32 {
  return won ? 1 : 0;
}
