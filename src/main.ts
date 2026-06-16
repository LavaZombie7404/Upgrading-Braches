// Entry point: wire the WASM engine, UI, game loop, persistence, and rebirths.

import './styles/main.scss';
import { Engine } from './engine';
import { GameUI } from './render';
import { loadSave, writeSave, clearSave } from './save';
import { TREE, rebuildGame, rebirthMultiplier } from './treeData';

async function start(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app not found');

  const saved = loadSave();
  let rebirths = saved?.rebirths ?? 0;

  // Build the tree for the saved rebirth count BEFORE the engine loads it.
  rebuildGame(rebirths);
  const engine = await Engine.load();
  if (saved) engine.restore(saved);
  engine.setGlobalMul(rebirthMultiplier(rebirths));

  const save = () => writeSave({ ...engine.serialize(), rebirths });

  const ui = new GameUI(root, engine, rebirths, {
    onClickButton: () => engine.click(ui.activeWorldIndex),
    onBuy: (id) => {
      if (!engine.buy(id)) return;
      if (TREE[id]?.isRebirth) doRebirth();
      else save();
    },
    onHardReset: () => {
      rebirths = 0;
      rebuildGame(0);
      engine.loadTree();
      engine.setGlobalMul(rebirthMultiplier(0));
      clearSave();
      ui.rebuild(0);
    },
  });

  // Beating the last world: +1 rebirth, +1 world, bigger global multiplier.
  // Progress carries over — the new world is reachable via the node just bought.
  function doRebirth(): void {
    const snapshot = engine.serialize();
    rebirths += 1;
    rebuildGame(rebirths);
    engine.restore(snapshot);
    engine.setGlobalMul(rebirthMultiplier(rebirths));
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
