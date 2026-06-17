// Entry point: wire the WASM engine, UI, game loop, persistence, and rebirths.

import './styles/main.scss';
import { Engine } from './engine';
import { GameUI } from './render';
import { loadSave, writeSave, clearSave } from './save';
import { TREE, rebuildGame, rebirthMultiplier, hoardMultiplier, nextHoardTier, worldIndex, BONUS_WORLD_ID, BONUS_ROWS } from './treeData';

// The infinite Multiplier tree grows in chunks: whenever you buy within
// GROW_MARGIN rows of the current bottom, append GROW_STEP more rows.
const GROW_STEP = 5;
const GROW_MARGIN = 2;

async function start(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app not found');

  const saved = loadSave();
  let rebirths = saved?.rebirths ?? 0;
  let bonusRows = saved?.bonusExtraRows ?? 0; // grown depth of the Multiplier tree

  // Build the tree for the saved rebirth count BEFORE the engine loads it.
  rebuildGame(rebirths, bonusRows);
  const engine = await Engine.load();
  if (saved) engine.restore(saved);
  engine.setGlobalMul(rebirthMultiplier(rebirths));

  // The engine's global multiplier = rebirth bonus × hoard bonus. We track the
  // last value pushed so the per-frame sync only recomputes when it changes.
  let lastGlobal = -1;

  const save = () => writeSave({ ...engine.serialize(), rebirths, bonusExtraRows: bonusRows });

  const ui = new GameUI(root, engine, rebirths, {
    onClickButton: () => engine.click(ui.activeWorldIndex),
    onBuy: (id) => {
      if (!engine.buy(id)) return;
      if (TREE[id]?.isRebirth) doRebirth();
      else if (growBonusIfNeeded(id)) return; // grew + saved + re-rendered
      else save();
    },
    onHardReset: () => {
      rebirths = 0;
      bonusRows = 0;
      rebuildGame(0, 0);
      engine.loadTree();
      engine.setGlobalMul(rebirthMultiplier(0));
      lastGlobal = -1;
      clearSave();
      ui.rebuild(0);
    },
  });

  // Keep the Multiplier tree endless: if `id` is a bonus node within GROW_MARGIN
  // of the current bottom, append GROW_STEP rows, reload the engine onto the
  // bigger tree (preserving all purchases + balances), and re-render in place.
  // Returns true if it grew (and handled saving/rendering).
  function growBonusIfNeeded(id: number): boolean {
    const node = TREE[id];
    if (!node || node.world !== BONUS_WORLD_ID) return false;
    const bottomRow = BONUS_ROWS + bonusRows; // deepest existing board row
    if (node.row < bottomRow - GROW_MARGIN) return false;

    const state = engine.serialize(); // purchases + per-world balances
    bonusRows += GROW_STEP;
    rebuildGame(rebirths, bonusRows);
    engine.restore(state); // reload onto the now-bigger tree (new rows unowned)
    lastGlobal = -1; // force a re-push next sync (globalMul was reset by loadTree)
    ui.rebuildBoard(); // re-render the current board with the new rows, in place
    save();
    return true;
  }

  // Recompute the global multiplier from live state (rebirth × hoard tier),
  // push it to the engine only when it changes, and refresh the HUD readout.
  // `announce` toasts a newly-reached hoard tier; we pass false when seeding.
  function syncGlobal(announce: boolean): void {
    const hoard = engine.pointsOf(worldIndex(BONUS_WORLD_ID)); // your Multiplier stash
    const hoardMul = hoardMultiplier(hoard);
    const combined = rebirthMultiplier(rebirths) * hoardMul;
    if (combined !== lastGlobal) {
      lastGlobal = combined;
      engine.setGlobalMul(combined);
    }
    ui.updateHoard(hoardMul, hoard, nextHoardTier(hoard), announce);
  }
  syncGlobal(false); // seed the HUD + engine without toasting already-earned tiers

  // Beating the last world: +1 rebirth and +1 world, with a bigger global
  // multiplier. Everything else RESETS — purchases and all currencies are wiped
  // (classic prestige) — so you replay from World 1, faster, toward one more
  // world. Only the rebirth count (and thus the multiplier) is kept.
  function doRebirth(): void {
    rebirths += 1;
    bonusRows = 0; // the bonus tree resets along with everything else
    rebuildGame(rebirths, bonusRows);
    engine.loadTree(); // fresh tree: nothing purchased, all currencies at zero
    engine.setGlobalMul(rebirthMultiplier(rebirths));
    lastGlobal = -1; // hoard pile is wiped too; let the next sync re-derive it
    save();
    ui.rebuild(rebirths);
  }

  // Spacebar earns points too — one per press, in the active world. Ignoring
  // auto-repeat keydowns means holding Space does nothing extra; preventDefault
  // stops page scroll.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    if (!e.repeat) engine.click(ui.activeWorldIndex);
  });

  // --- Game loop ---
  let last = performance.now();
  let sinceSave = 0;

  function frame(now: number): void {
    let dt = (now - last) / 1000;
    last = now;
    // Clamp dt so a backgrounded tab doesn't dump a huge lump of points.
    if (dt > 1) dt = 1;

    engine.tick(dt);
    syncGlobal(true);
    ui.refresh();

    sinceSave += dt;
    if (sinceSave >= 5) {
      sinceSave = 0;
      save();
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Persist on the way out, too.
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
}

start().catch((err) => {
  console.error(err);
  const root = document.getElementById('app');
  if (root) root.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
});
