# Upgrade Tree

An incremental **upgrade-tree** game. Start at 0 points, click to earn, unlock
auto-generators, and climb the tree to **The End**.

- **Engine** — the authoritative game state (upgrade graph, economy math,
  purchase rules, idle tick) is written in **AssemblyScript** and compiled to
  **WebAssembly**. See [`assembly/index.ts`](assembly/index.ts).
- **UI** — vanilla **TypeScript** + **SCSS**. No frameworks. The TS layer loads
  the WASM, renders the tree (DOM nodes + SVG edges), and runs the game loop.
- **Build** — [Vite](https://vitejs.dev). Deployed to **GitHub Pages** via
  GitHub Actions.

## Project layout

```
assembly/index.ts     AssemblyScript game engine (-> WASM)
src/treeData.ts        the upgrade tree — single source of truth
src/engine.ts          typed host wrapper around the WASM module
src/render.ts          DOM/SVG rendering
src/main.ts            entry point + game loop
src/save.ts            localStorage persistence
src/styles/            SCSS (partials per area)
```

## Develop

Requires Node.js 18+.

```bash
npm install
npm run dev      # compiles WASM, then starts Vite at http://localhost:5173
```

Other scripts:

```bash
npm run asbuild  # build the WASM engine only
npm run build    # WASM + typecheck + production bundle into dist/
npm run preview  # serve the production build locally
```

## Test

End-to-end tests drive the real built game in a headless browser with
[Playwright](https://playwright.dev) — they cover WASM boot, clicking/earning,
purchasing and effects, prerequisite locking, idle generation, and the win flow.

```bash
npx playwright install --with-deps chromium   # one-time browser setup
npm test                                       # builds, then runs tests/*.spec.ts
```

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and
publishes `dist/` to GitHub Pages. Enable Pages once under **Settings → Pages →
Source: GitHub Actions**.

## How the engine boundary works

The WASM/JS boundary is numeric-only — no strings cross it. At startup the host
pushes the tree topology into the engine (`reset` → `setNode` × N → `finalize`),
then only reads derived values back (`getPoints`, `isBuyable(id)`, …). This keeps
the host free of any WASM memory-layout concerns.
