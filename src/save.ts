// localStorage persistence for the run.

import type { SaveState } from './engine';

const KEY = 'upgrade-tree.save.v1';

export function loadSave(): SaveState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveState;
    if (!Array.isArray(data.purchased) || !Array.isArray(data.worlds)) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(state: SaveState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or unavailable — ignore */
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
