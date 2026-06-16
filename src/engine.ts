// Typed host-side wrapper around the AssemblyScript WASM engine.
//
// Instantiates the module, feeds it the tree from treeData.ts, and exposes a
// small typed API. The WASM holds the authoritative state; this class is a thin
// pass-through plus the one-time initialisation.

import { TREE } from './treeData';
import wasmUrl from './wasm/engine.wasm?url';

/** The raw functions exported by assembly/index.ts. */
interface EngineExports {
  reset(n: number): void;
  setNode(id: number, cost: number, parent: number, eType: number, eValue: number, end: number): void;
  finalize(): void;
  tick(dt: number): void;
  click(): void;
  buy(id: number): number;
  isPurchased(id: number): number;
  isUnlocked(id: number): number;
  isBuyable(id: number): number;
  setPurchased(id: number): void;
  getCost(id: number): number;
  getNodeCount(): number;
  getPoints(): number;
  setPoints(v: number): void;
  getTotalEarned(): number;
  setTotalEarned(v: number): void;
  getPerClick(): number;
  getPerSec(): number;
  hasWon(): number;
}

export class Engine {
  private readonly ex: EngineExports;

  private constructor(ex: EngineExports) {
    this.ex = ex;
  }

  static async load(): Promise<Engine> {
    const importObject = {
      env: {
        abort(_msg: number, _file: number, line: number, column: number): void {
          throw new Error(`WASM abort at ${line}:${column}`);
        },
        trace(_msg: number, _n: number): void {},
        seed(): number {
          return Date.now();
        },
      },
    };

    const bytes = await fetch(wasmUrl).then((r) => r.arrayBuffer());
    const { instance } = await WebAssembly.instantiate(bytes, importObject);
    const engine = new Engine(instance.exports as unknown as EngineExports);
    engine.loadTree();
    return engine;
  }

  /** Push the tree topology from treeData.ts into the engine. */
  private loadTree(): void {
    this.ex.reset(TREE.length);
    for (const n of TREE) {
      this.ex.setNode(n.id, n.cost, n.parent, n.effect, n.value, n.isEnd ? 1 : 0);
    }
    this.ex.finalize();
  }

  // --- Simulation ---
  tick(dtSeconds: number): void {
    this.ex.tick(dtSeconds);
  }
  click(): void {
    this.ex.click();
  }
  buy(id: number): boolean {
    return this.ex.buy(id) === 1;
  }

  // --- Queries ---
  isPurchased(id: number): boolean {
    return this.ex.isPurchased(id) === 1;
  }
  isUnlocked(id: number): boolean {
    return this.ex.isUnlocked(id) === 1;
  }
  isBuyable(id: number): boolean {
    return this.ex.isBuyable(id) === 1;
  }
  get points(): number {
    return this.ex.getPoints();
  }
  get totalEarned(): number {
    return this.ex.getTotalEarned();
  }
  get perClick(): number {
    return this.ex.getPerClick();
  }
  get perSec(): number {
    return this.ex.getPerSec();
  }
  get won(): boolean {
    return this.ex.hasWon() === 1;
  }

  // --- Save / restore ---
  /** Serialise the minimal state needed to reconstruct the run. */
  serialize(): SaveState {
    const purchased: number[] = [];
    for (const n of TREE) {
      if (this.isPurchased(n.id)) purchased.push(n.id);
    }
    return { points: this.points, totalEarned: this.totalEarned, purchased };
  }

  /** Restore from a saved state (resets the tree first). */
  restore(state: SaveState): void {
    this.loadTree(); // clean slate
    for (const id of state.purchased) this.ex.setPurchased(id);
    this.ex.finalize(); // recompute rates from restored purchases
    this.ex.setPoints(state.points);
    this.ex.setTotalEarned(state.totalEarned);
  }

  /** Wipe all progress. */
  hardReset(): void {
    this.loadTree();
  }
}

export interface SaveState {
  points: number;
  totalEarned: number;
  purchased: number[];
}
