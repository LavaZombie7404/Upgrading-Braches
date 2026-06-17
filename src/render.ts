// DOM rendering for the HUD and the upgrade tree.
//
// Nodes are positioned <button> elements; edges are SVG lines on a layer behind
// them. The renderer reads all live state from the engine each refresh — it owns
// no game state of its own beyond which world is currently being viewed and the
// rebirth count (used for HUD display).

import { Engine } from './engine';
import { TREE, WORLDS, nodesForWorld, worldIndex, rebirthMultiplier, effectText, type TreeNode } from './treeData';
import { formatNumber } from './format';

// Layout constants (px).
const COL_W = 150;
const ROW_H = 120;
const NODE_W = 120;
const NODE_H = 80;
const PAD = 48;

const nodeX = (n: TreeNode) => PAD + n.col * COL_W;
const nodeY = (n: TreeNode) => PAD + n.row * ROW_H;
const centerX = (n: TreeNode) => nodeX(n) + NODE_W / 2;
const centerY = (n: TreeNode) => nodeY(n) + NODE_H / 2;

export interface UIHandlers {
  onClickButton(): void;
  onBuy(id: number): void;
  onHardReset(): void;
}

export class GameUI {
  private readonly engine: Engine;
  private readonly handlers: UIHandlers;
  private root!: HTMLElement;
  private rebirths: number;

  private elPoints!: HTMLElement;
  private elPointsLabel!: HTMLElement;
  private elPerSec!: HTMLElement;
  private elPerClick!: HTMLElement;
  private elHoard!: HTMLElement;
  private elRebirths!: HTMLElement;
  /** Last hoard multiplier shown, so we only toast when a new tier is reached. */
  private lastHoardMul = 1;
  private worldSelect!: HTMLSelectElement;
  private boardEl!: HTMLElement;
  private toastLayer!: HTMLElement;

  private currentWorld = WORLDS[0].id;
  private readonly nodeEls = new Map<number, HTMLButtonElement>();
  private readonly edgeEls = new Map<number, SVGLineElement>();
  /** Worlds whose unlock we've already announced (so we toast each once). */
  private readonly announced = new Set<number>();

  constructor(root: HTMLElement, engine: Engine, rebirths: number, handlers: UIHandlers) {
    this.engine = engine;
    this.handlers = handlers;
    this.rebirths = rebirths;
    this.build(root);
    this.seedAnnouncements();
  }

  /** The active world as a 0-based engine index. */
  get activeWorldIndex(): number {
    return worldIndex(this.currentWorld);
  }

  /** Is `world` unlocked yet (its gate node purchased)? */
  private worldUnlocked(worldId: number): boolean {
    const world = WORLDS.find((w) => w.id === worldId)!;
    return world.unlockNodeId === null || this.engine.isPurchased(world.unlockNodeId);
  }

  /** Mark already-unlocked worlds as announced so restored saves don't toast. */
  private seedAnnouncements(): void {
    this.announced.clear();
    for (const w of WORLDS) {
      if (this.worldUnlocked(w.id)) this.announced.add(w.id);
    }
  }

  private build(root: HTMLElement): void {
    this.root = root;
    root.innerHTML = '';

    // --- HUD ---
    const hud = el('header', 'hud');
    // The points stat is labelled with the active world's currency name.
    const pointsStat = el('div', 'hud__stat hud__stat--points');
    this.elPointsLabel = el('span', 'hud__label');
    this.elPoints = el('span', 'hud__value');
    pointsStat.append(this.elPointsLabel, this.elPoints);
    hud.append(
      pointsStat,
      stat('Per second', (this.elPerSec = el('span', 'hud__value'))),
      stat('Per click', (this.elPerClick = el('span', 'hud__value'))),
      stat('Boost', (this.elHoard = el('span', 'hud__value hud__value--hoard'))),
      stat('Rebirths', (this.elRebirths = el('span', 'hud__value hud__value--rebirth')))
    );
    this.elHoard.textContent = '×1';
    this.lastHoardMul = 1;
    this.elRebirths.textContent = this.rebirthLabel();

    // World picker.
    const worldWrap = el('div', 'world-picker');
    const worldLabel = el('label', 'world-picker__label');
    worldLabel.textContent = 'World';
    this.worldSelect = el('select', 'world-select') as HTMLSelectElement;
    for (const w of WORLDS) {
      const opt = document.createElement('option');
      opt.value = String(w.id);
      opt.textContent = w.name;
      this.worldSelect.append(opt);
    }
    this.worldSelect.addEventListener('change', () => {
      this.switchWorld(Number(this.worldSelect.value));
    });
    worldLabel.append(this.worldSelect);
    worldWrap.append(worldLabel);
    hud.append(worldWrap);

    const clickBtn = el('button', 'click-btn') as HTMLButtonElement;
    clickBtn.type = 'button';
    clickBtn.textContent = 'Click for points (or press Space)';
    clickBtn.addEventListener('click', () => this.handlers.onClickButton());
    hud.append(clickBtn);

    const resetBtn = el('button', 'reset-btn') as HTMLButtonElement;
    resetBtn.type = 'button';
    resetBtn.textContent = 'Reset';
    resetBtn.title = 'Wipe all progress (including rebirths)';
    resetBtn.addEventListener('click', () => {
      if (confirm('Reset all progress, including rebirths? This cannot be undone.')) {
        this.handlers.onHardReset();
      }
    });
    hud.append(resetBtn);

    root.append(hud);

    // --- Tree board (scroll/pan container) ---
    const viewport = el('main', 'board-viewport');
    this.boardEl = el('div', 'board');
    viewport.append(this.boardEl);
    root.append(viewport);

    // --- Toast layer (transient notifications) ---
    this.toastLayer = el('div', 'toast-layer');
    root.append(this.toastLayer);

    this.buildBoard(this.currentWorld);
  }

  private rebirthLabel(): string {
    return this.rebirths > 0 ? `${this.rebirths} (×${rebirthMultiplier(this.rebirths)})` : '0';
  }

  /** Update the "Boost" readout from the current Multiplier stash.
   *  `announce` toasts when a new (higher) tier is reached. */
  updateHoard(mul: number, amount: number, next: { at: number; mul: number } | null, announce: boolean): void {
    this.elHoard.textContent = `×${mul}`;
    this.elHoard.title = next
      ? `Your Multiplier stash boosts ALL output. Next: ×${next.mul} at ${formatNumber(next.at)} Multiplier (you have ${formatNumber(amount)}).`
      : `Your Multiplier stash boosts ALL output. Maxed at ×${mul}.`;
    if (announce && mul > this.lastHoardMul) {
      this.showToast(`💰 Boost → ×${mul} on all output!`);
    }
    this.lastHoardMul = mul;
  }

  /** Rebuild the whole UI for a (possibly changed) world count after a rebirth
   *  or hard reset. Returns the view to World 1 and celebrates a rebirth. */
  rebuild(rebirths: number): void {
    const gained = rebirths > this.rebirths;
    this.rebirths = rebirths;
    this.currentWorld = WORLDS[0].id;
    this.build(this.root);
    this.seedAnnouncements();
    this.refresh();
    if (gained) {
      this.showToast(
        `✦ Rebirth #${rebirths}! ×${rebirthMultiplier(rebirths)} to all output — World ${WORLDS.length} unlocked! ✦`
      );
    }
  }

  /** Show a transient toast notification. */
  private showToast(message: string): void {
    const toast = el('div', 'toast');
    toast.textContent = message;
    this.toastLayer.append(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  /** (Re)build the node + edge elements for one world. */
  private buildBoard(worldId: number): void {
    this.boardEl.innerHTML = '';
    this.nodeEls.clear();
    this.edgeEls.clear();

    const nodes = nodesForWorld(worldId);
    const byId = new Map(TREE.map((n) => [n.id, n])); // rebuilt fresh (tree can change)
    const maxCol = Math.max(...nodes.map((n) => n.col));
    const maxRow = Math.max(...nodes.map((n) => n.row));
    const boardW = maxCol * COL_W + NODE_W + PAD * 2;
    const boardH = maxRow * ROW_H + NODE_H + PAD * 2;
    this.boardEl.style.width = `${boardW}px`;
    this.boardEl.style.height = `${boardH}px`;

    // SVG edge layer (behind the nodes).
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('edges');
    svg.setAttribute('width', String(boardW));
    svg.setAttribute('height', String(boardH));
    for (const n of nodes) {
      const parent = byId.get(n.parent);
      // Only draw edges within this world (a world entry node's parent lives in
      // the previous world and has no edge here).
      if (!parent || parent.world !== worldId) continue;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(centerX(parent)));
      line.setAttribute('y1', String(centerY(parent)));
      line.setAttribute('x2', String(centerX(n)));
      line.setAttribute('y2', String(centerY(n)));
      line.classList.add('edge');
      svg.append(line);
      this.edgeEls.set(n.id, line);
    }
    this.boardEl.append(svg);

    // Node buttons.
    for (const n of nodes) {
      const btn = el('button', 'node') as HTMLButtonElement;
      btn.type = 'button';
      btn.style.left = `${nodeX(n)}px`;
      btn.style.top = `${nodeY(n)}px`;
      btn.style.width = `${NODE_W}px`;
      btn.style.height = `${NODE_H}px`;
      if (n.isEnd || n.unlocksWorld || n.isRebirth) btn.classList.add('node--end');
      if (n.isRebirth) btn.classList.add('node--rebirth');

      const name = el('span', 'node__name');
      name.textContent = n.name;
      const effect = el('span', 'node__effect');
      effect.textContent = effectText(n);
      const cost = el('span', 'node__cost');

      btn.append(name, effect, cost);
      btn.title = n.desc;
      btn.addEventListener('click', () => this.handlers.onBuy(n.id));

      (btn as HTMLButtonElement & { _cost?: HTMLElement })._cost = cost;
      this.nodeEls.set(n.id, btn);
      this.boardEl.append(btn);
    }
  }

  private switchWorld(worldId: number): void {
    if (!this.worldUnlocked(worldId)) return;
    this.currentWorld = worldId;
    this.worldSelect.value = String(worldId);
    this.buildBoard(worldId);
    this.refresh();
  }

  /** Refresh all live values. Called every animation frame. */
  refresh(): void {
    // HUD shows the ACTIVE world's independent economy and currency name.
    const idx = this.activeWorldIndex;
    this.elPointsLabel.textContent = WORLDS[idx].currency;
    this.elPoints.textContent = formatNumber(this.engine.pointsOf(idx));
    this.elPerSec.textContent = formatNumber(this.engine.perSecOf(idx));
    this.elPerClick.textContent = formatNumber(this.engine.perClickOf(idx));

    // Keep the dropdown's lock state in sync, and toast newly-unlocked worlds.
    for (let i = 0; i < this.worldSelect.options.length; i++) {
      const opt = this.worldSelect.options[i];
      const w = WORLDS[i];
      const unlocked = this.worldUnlocked(w.id);
      opt.disabled = !unlocked;
      opt.textContent = unlocked ? w.name : `${w.name} 🔒`;
      if (unlocked && !this.announced.has(w.id)) {
        this.announced.add(w.id);
        this.showToast(`${w.name} unlocked! 🔓`);
      }
    }

    for (const n of nodesForWorld(this.currentWorld)) {
      const btn = this.nodeEls.get(n.id)!;
      const purchased = this.engine.isPurchased(n.id);
      const buyable = !purchased && this.engine.isBuyable(n.id);
      const unlocked = !purchased && this.engine.isUnlocked(n.id);

      // Locked nodes (prerequisite not yet met) stay hidden until revealed.
      const visible = purchased || unlocked;
      btn.hidden = !visible;

      setClass(btn, 'is-purchased', purchased);
      setClass(btn, 'is-buyable', buyable);
      setClass(btn, 'is-unlocked', unlocked && !buyable); // unlocked but can't afford
      btn.disabled = !buyable;

      const cost = (btn as HTMLButtonElement & { _cost?: HTMLElement })._cost!;
      cost.textContent = purchased ? 'owned' : n.cost === 0 ? 'free' : formatNumber(n.cost);

      const edge = this.edgeEls.get(n.id);
      if (edge) {
        setClass(edge, 'edge--active', purchased);
        setClass(edge, 'edge--hidden', !visible); // hide edges into hidden nodes
      }
    }
  }
}

// --- tiny DOM helpers --------------------------------------------------------
function el(tag: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function stat(label: string, valueEl: HTMLElement): HTMLElement {
  const wrap = el('div', 'hud__stat');
  const l = el('span', 'hud__label');
  l.textContent = label;
  wrap.append(l, valueEl);
  return wrap;
}

function setClass(node: Element, cls: string, on: boolean): void {
  node.classList.toggle(cls, on);
}
