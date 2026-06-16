// Typed host-side wrapper around the AssemblyScript WASM engine.
//
// Instantiates the module, feeds it the tree from treeData.ts, and exposes a
// small typed API. The WASM holds the authoritative state (now per-world); this
// class is a thin pass-through plus the one-time initialisation.

import { TREE, WORLDS, worldIndex } from './treeData';
import wasmUrl from './wasm/engine.wasm?url';

/** The raw functions exported by assembly/index.ts. `w` is a 0-based world index. */
interface EngineExports {
  reset(n: number, worlds: number): void;
  setNode(id: number, cost: number, parent: number, eType: number, eValue: number, world: number, end: number): void;
  finalize(): void;
  tick(dt: number): void;
  click(w: number): void;
  buy(id: number): number;
  isPurchased(id: number): number;
  isUnlocked(id: number): number;
  isBuyable(id: number): number;
  setPurchased(id: number): void;
  getCost(id: number): number;
  getNodeCount(): number;
  getPoints(w: number): number;
  setPoints(w: number, v: number): void;
  getTotalEarned(w: number): number;
  setTotalEarned(w: number, v: number): void;
  getPerClick(w: number): number;
  getPerSec(w: number): number;
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
    this.ex.reset(TREE.length, WORLDS.length);
    for (const n of TREE) {
      this.ex.setNode(n.id, n.cost, n.parent, n.effect, n.value, worldIndex(n.world), n.isEnd ? 1 : 0);
    }
    this.ex.finalize();
  }

  // --- Simulation (world is a 0-based index) ---
  tick(dtSeconds: number): void {
    this.ex.tick(dtSeconds);
  }
  click(world: number): void {
    this.ex.click(world);
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
  pointsOf(world: number): number {
    return this.ex.getPoints(world);
  }
  perSecOf(world: number): number {
    return this.ex.getPerSec(world);
  }
  perClickOf(world: number): number {
    return this.ex.getPerClick(world);
  }
  totalEarnedOf(world: number): number {
    return this.ex.getTotalEarned(world);
  }
  /** Lifetime points earned across all worlds (for the win screen). */
  totalEarnedAll(): number {
    let sum = 0;
    for (let w = 0; w < WORLDS.length; w++) sum += this.ex.getTotalEarned(w);
    return sum;
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
    const worlds: WorldSave[] = WORLDS.map((_, w) => ({
      points: this.ex.getPoints(w),
      totalEarned: this.ex.getTotalEarned(w),
    }));
    return { purchased, worlds };
  }

  /** Restore from a saved state (resets the tree first). */
  restore(state: SaveState): void {
    this.loadTree(); // clean slate
    for (const id of state.purchased) this.ex.setPurchased(id);
    this.ex.finalize(); // recompute rates from restored purchases
    state.worlds.forEach((ws, w) => {
      this.ex.setPoints(w, ws.points);
      this.ex.setTotalEarned(w, ws.totalEarned);
    });
  }

  /** Wipe all progress. */
  hardReset(): void {
    this.loadTree();
  }
}

export interface WorldSave {
  points: number;
  totalEarned: number;
}

export interface SaveState {
  purchased: number[];
  worlds: WorldSave[];
}
