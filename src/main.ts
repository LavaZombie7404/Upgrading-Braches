// Entry point: wire the WASM engine, UI, game loop, and persistence together.

import './styles/main.scss';
import { Engine } from './engine';
import { GameUI } from './render';
import { loadSave, writeSave, clearSave } from './save';

async function start(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app not found');

  const engine = await Engine.load();

  // Restore a previous run, if any.
  const saved = loadSave();
  if (saved) engine.restore(saved);

  const ui = new GameUI(root, engine, {
    onClickButton: () => engine.click(),
    onBuy: (id) => {
      if (engine.buy(id)) save(); // persist immediately on a purchase
    },
    onHardReset: () => {
      engine.hardReset();
      clearSave();
    },
  });

  const save = () => writeSave(engine.serialize());

  // Spacebar earns points too — one per press. Ignoring auto-repeat keydowns
  // means holding Space does nothing extra; preventDefault stops page scroll.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    if (!e.repeat) engine.click();
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

    if (engine.won) ui.showWin();

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
