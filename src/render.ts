// DOM rendering for the HUD and the upgrade tree.
//
// Nodes are positioned <button> elements; edges are SVG lines on a layer behind
// them. The renderer reads all live state from the engine each refresh — it owns
// no game state of its own beyond which world is currently being viewed.

import { Engine } from './engine';
import { TREE, WORLDS, nodesForWorld, effectText, type TreeNode } from './treeData';
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

const nodeById = new Map(TREE.map((n) => [n.id, n]));

export interface UIHandlers {
  onClickButton(): void;
  onBuy(id: number): void;
  onHardReset(): void;
}

export class GameUI {
  private readonly engine: Engine;
  private readonly handlers: UIHandlers;

  private elPoints!: HTMLElement;
  private elPerSec!: HTMLElement;
  private elPerClick!: HTMLElement;
  private worldSelect!: HTMLSelectElement;
  private boardEl!: HTMLElement;

  private currentWorld = WORLDS[0].id;
  private readonly nodeEls = new Map<number, HTMLButtonElement>();
  private readonly edgeEls = new Map<number, SVGLineElement>();
  private winShown = false;

  constructor(root: HTMLElement, engine: Engine, handlers: UIHandlers) {
    this.engine = engine;
    this.handlers = handlers;
    this.build(root);
  }

  /** Is `world` unlocked yet (its gate node purchased)? */
  private worldUnlocked(worldId: number): boolean {
    const world = WORLDS.find((w) => w.id === worldId)!;
    return world.unlockNodeId === null || this.engine.isPurchased(world.unlockNodeId);
  }

  private build(root: HTMLElement): void {
    root.innerHTML = '';

    // --- HUD ---
    const hud = el('header', 'hud');
    hud.append(
      stat('Points', (this.elPoints = el('span', 'hud__value'))),
      stat('Per second', (this.elPerSec = el('span', 'hud__value'))),
      stat('Per click', (this.elPerClick = el('span', 'hud__value')))
    );

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
    resetBtn.title = 'Wipe all progress';
    resetBtn.addEventListener('click', () => {
      if (confirm('Reset all progress? This cannot be undone.')) {
        this.handlers.onHardReset();
        this.switchWorld(WORLDS[0].id);
      }
    });
    hud.append(resetBtn);

    root.append(hud);

    // --- Tree board (scroll/pan container) ---
    const viewport = el('main', 'board-viewport');
    this.boardEl = el('div', 'board');
    viewport.append(this.boardEl);
    root.append(viewport);

    // --- Win overlay (hidden until won) ---
    const overlay = el('div', 'win-overlay');
    overlay.id = 'win-overlay';
    overlay.hidden = true;
    root.append(overlay);

    this.buildBoard(this.currentWorld);
  }

  /** (Re)build the node + edge elements for one world. */
  private buildBoard(worldId: number): void {
    this.boardEl.innerHTML = '';
    this.nodeEls.clear();
    this.edgeEls.clear();

    const nodes = nodesForWorld(worldId);
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
      const parent = nodeById.get(n.parent);
      // Only draw edges within this world (the world entry node's parent lives
      // in the previous world and has no edge here).
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
      if (n.isEnd || n.unlocksWorld) btn.classList.add('node--end');

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
    this.elPoints.textContent = formatNumber(this.engine.points);
    this.elPerSec.textContent = formatNumber(this.engine.perSec);
    this.elPerClick.textContent = formatNumber(this.engine.perClick);

    // Keep the dropdown's lock state in sync (worlds unlock mid-game).
    for (let i = 0; i < this.worldSelect.options.length; i++) {
      const opt = this.worldSelect.options[i];
      const w = WORLDS[i];
      const unlocked = this.worldUnlocked(w.id);
      opt.disabled = !unlocked;
      opt.textContent = unlocked ? w.name : `${w.name} 🔒`;
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

  /** Show the victory overlay (idempotent). */
  showWin(): void {
    if (this.winShown) return;
    this.winShown = true;
    const overlay = document.getElementById('win-overlay')!;
    overlay.hidden = false;
    overlay.innerHTML = '';
    const card = el('div', 'win-overlay__card');
    const h = el('h2');
    h.textContent = 'You conquered every world! 🎉';
    const p = el('p');
    p.textContent = `Lifetime points earned: ${formatNumber(this.engine.totalEarned)}`;
    const close = el('button', 'win-overlay__close') as HTMLButtonElement;
    close.type = 'button';
    close.textContent = 'Keep playing';
    close.addEventListener('click', () => (overlay.hidden = true));
    card.append(h, p, close);
    overlay.append(card);
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
