import { test, expect, type Page } from '@playwright/test';
import { TREE } from '../src/treeData';

const SAVE_KEY = 'upgrade-tree.save.v1';
const NUM_WORLDS = 7;

interface WorldSave {
  points: number;
  totalEarned: number;
}
interface SaveState {
  purchased: number[];
  worlds: WorldSave[];
  rebirths: number;
}

// Helpers ---------------------------------------------------------------------
const hudValue = (page: Page, label: string) =>
  page.locator('.hud__stat', { hasText: label }).locator('.hud__value');

// The points stat's label is the active world's currency name, so locate its
// value by a stable class instead of by label text.
const pointsValue = (page: Page) => page.locator('.hud__stat--points .hud__value');

const node = (page: Page, name: string) =>
  page.locator('.node', { hasText: name });

const worldOption = (page: Page, name: string) =>
  page.locator('.world-select option', { hasText: name });

const ZERO: WorldSave = { points: 0, totalEarned: 0 };
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Build a SaveState; `balances` maps a 0-based world index to its balance. */
const mkSave = (purchased: number[], balances: Record<number, WorldSave> = {}, rebirths = 0): SaveState => ({
  purchased,
  worlds: Array.from({ length: NUM_WORLDS }, (_, i) => balances[i] ?? ZERO),
  rebirths,
});

/** Seed a save into localStorage before the app boots. */
const seedSave = (page: Page, state: SaveState) =>
  page.addInitScript(
    ([key, json]) => localStorage.setItem(key, json),
    [SAVE_KEY, JSON.stringify(state)] as const
  );

test.beforeEach(async ({ page }) => {
  // Start every test from a clean slate (no carried-over save).
  await page.addInitScript((key) => localStorage.removeItem(key), SAVE_KEY);
});

test('boots with only the free root node revealed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.click-btn')).toBeVisible();
  await expect(pointsValue(page)).toHaveText('0');
  await expect(hudValue(page, 'Per click')).toHaveText('1');
  // Locked nodes are hidden — only the root "Awakening" shows at the start.
  await expect(page.locator('.node:visible')).toHaveCount(1);
  await expect(node(page, 'Awakening')).toBeVisible();
});

test('the world dropdown lists every world, locked until reached', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.world-select option')).toHaveCount(NUM_WORLDS);
  await expect(worldOption(page, 'World 1')).toHaveJSProperty('disabled', false);
  await expect(worldOption(page, 'World 7')).toHaveJSProperty('disabled', true);
});

test('clicking the button earns points', async ({ page }) => {
  await page.goto('/');
  const clickBtn = page.locator('.click-btn');
  for (let i = 0; i < 5; i++) await clickBtn.click();
  await expect(pointsValue(page)).toHaveText('5');
});

test('pressing Space earns points', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.click-btn')).toBeVisible(); // wait for the engine to load
  for (let i = 0; i < 4; i++) await page.keyboard.press('Space');
  await expect(pointsValue(page)).toHaveText('4');
});

test('holding Space earns only one point per press', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.click-btn')).toBeVisible();
  // First keydown counts; subsequent auto-repeat keydowns are ignored.
  await page.keyboard.down('Space');
  await page.keyboard.down('Space');
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await expect(pointsValue(page)).toHaveText('1');
});

test('the free root is buyable immediately and reveals its children', async ({ page }) => {
  await page.goto('/');
  const awakening = node(page, 'Awakening');
  await expect(awakening).toHaveClass(/is-buyable/);
  await expect(awakening).toContainText('free');

  // Children stay hidden until the root is bought.
  await expect(node(page, 'Sharper Clicks')).toBeHidden();
  await expect(node(page, 'First Generator')).toBeHidden();

  await awakening.click();

  // Bought for free: owned, points unchanged, per-click effect (+1) applied.
  await expect(awakening).toHaveClass(/is-purchased/);
  await expect(awakening).toContainText('owned');
  await expect(pointsValue(page)).toHaveText('0');
  await expect(hudValue(page, 'Per click')).toHaveText('2');

  // ...and its children are now revealed.
  await expect(node(page, 'Sharper Clicks')).toBeVisible();
  await expect(node(page, 'First Generator')).toBeVisible();
});

test('nodes behind an unmet prerequisite are hidden', async ({ page }) => {
  await page.goto('/');
  // Deeper nodes are not revealed until their prerequisites are bought.
  await expect(node(page, 'Double Tap')).toBeHidden();
  await expect(node(page, 'Unlock World 2')).toBeHidden();
});

test('idle generators accrue points over time', async ({ page }) => {
  // Seed a save where the first auto-generator (+1/sec) is already owned.
  await seedSave(page, mkSave([0, 2]));
  await page.goto('/');

  await expect(hudValue(page, 'Per second')).toHaveText('1');
  // Points should climb from idle generation without any clicking.
  await expect.poll(async () => Number(await pointsValue(page).textContent())).toBeGreaterThan(1);
});

test('World 2 is locked in the dropdown until its gateway is bought', async ({ page }) => {
  // All of World 1 except the gateway owned, with points to spare.
  await seedSave(page, mkSave(range(17), { 0: { points: 300000, totalEarned: 300000 } }));
  await page.goto('/');

  await expect(worldOption(page, 'World 2')).toHaveJSProperty('disabled', true);

  const gate = node(page, 'Unlock World 2');
  await expect(gate).toHaveClass(/is-buyable/);
  await gate.click();
  await expect(gate).toHaveClass(/is-purchased/);

  // World 2 is now selectable, and a toast announces it.
  await expect(worldOption(page, 'World 2')).toHaveJSProperty('disabled', false);
  await expect(page.locator('.toast')).toContainText('World 2 unlocked');
});

test('each world keeps its own independent currency', async ({ page }) => {
  // World 2 already unlocked (gateway owned). World 1 has 500 banked, no
  // generators (so its balance is stable); World 2 starts at zero.
  await seedSave(page, mkSave([17], { 0: { points: 500, totalEarned: 500 } }));
  await page.goto('/');

  const currencyLabel = page.locator('.hud__stat--points .hud__label');
  await expect(pointsValue(page)).toHaveText('500'); // World 1 currency
  await expect(currencyLabel).toHaveText('Points');

  await page.locator('.world-select').selectOption('2');
  await expect(pointsValue(page)).toHaveText('0'); // World 2's own currency
  await expect(currencyLabel).toHaveText('Quanta'); // ...with its own name

  const clickBtn = page.locator('.click-btn');
  for (let i = 0; i < 3; i++) await clickBtn.click();
  await expect(pointsValue(page)).toHaveText('3'); // earned in World 2

  // Switching back, World 1's balance is untouched by World 2 clicks.
  await page.locator('.world-select').selectOption('1');
  await expect(pointsValue(page)).toHaveText('500');
});

test('completing a world unlocks the next one via its gateway', async ({ page }) => {
  // All of World 1 (incl. gateway) owned; fund World 2 for its fresh curve.
  await seedSave(page, mkSave(range(18), { 1: { points: 50000, totalEarned: 50000 } }));
  await page.goto('/');

  await page.locator('.world-select').selectOption('2');
  await expect(node(page, 'Nexus')).toBeVisible();
  await expect(worldOption(page, 'World 3')).toHaveJSProperty('disabled', true);

  // Buy the path to World 2's gateway (spending World 2 currency).
  for (const name of ['Nexus', 'Plasma Generator', 'Antimatter', 'Cosmic Synergy', 'Unlock World 3']) {
    const nd = node(page, name);
    await expect(nd).toHaveClass(/is-buyable/);
    await nd.click();
  }

  await expect(worldOption(page, 'World 3')).toHaveJSProperty('disabled', false);
  await expect(page.locator('.toast')).toContainText('World 3 unlocked');
});

test('the bonus tree reveals after Unlock World 2 and pays out big', async ({ page }) => {
  // Only the gateway owned, so World 1 per-click is the base 1 and the bonus
  // tree (which hangs off the gateway) is revealed. Fund the first bonus node.
  await seedSave(page, mkSave([17], { 0: { points: 50_000, totalEarned: 50_000 } }));
  await page.goto('/');

  await expect(hudValue(page, 'Per click')).toHaveText('1');
  const bragging = node(page, 'Bragging Rights');
  await expect(bragging).toBeVisible();
  await bragging.click(); // +10,000 per click
  await expect(bragging).toHaveClass(/is-purchased/);
  await expect(hudValue(page, 'Per click')).toHaveText('10.00K');
});

test('hoarding World 1 Points grants a global multiplier on all output', async ({ page }) => {
  // Own the root (+1 per click, so base per-click is 2) and bank 2,000,000
  // World 1 Points — over the 1M tier, which boosts ALL output ×1.5.
  await seedSave(page, mkSave([0], { 0: { points: 2_000_000, totalEarned: 2_000_000 } }));
  await page.goto('/');

  await expect(hudValue(page, 'Hoard bonus')).toHaveText('×1.5');
  // Base per-click 2 × the 1.5 hoard bonus = 3.
  await expect(hudValue(page, 'Per click')).toHaveText('3');
});

test('rebirths grant a global multiplier and extra worlds', async ({ page }) => {
  // Start with 2 rebirths banked (no purchases needed).
  await seedSave(page, mkSave([], {}, 2));
  await page.goto('/');

  // Base per-click is ×2 (the rebirth multiplier), and the HUD shows the count.
  await expect(hudValue(page, 'Per click')).toHaveText('2');
  await expect(hudValue(page, 'Rebirths')).toContainText('2');
  // 7 base worlds + 2 from rebirths = 9.
  await expect(page.locator('.world-select option')).toHaveCount(9);
});

test('beating the last world grants a rebirth and adds a world', async ({ page }) => {
  // Own everything except the last world's Rebirth node; fund that world exactly.
  const rebirthSpec = TREE.find((n) => n.isRebirth)!;
  await seedSave(page, mkSave(
    TREE.filter((n) => !n.isRebirth).map((n) => n.id),
    { [NUM_WORLDS - 1]: { points: rebirthSpec.cost, totalEarned: rebirthSpec.cost } }
  ));
  await page.goto('/');

  await expect(page.locator('.world-select option')).toHaveCount(7); // 0 rebirths

  await page.locator('.world-select').selectOption(String(NUM_WORLDS));
  const rebirth = node(page, 'Rebirth');
  await expect(rebirth).toHaveClass(/is-buyable/);
  await rebirth.click();

  // Gained a rebirth: HUD count goes up, a new (8th) world appears, toast fires.
  await expect(hudValue(page, 'Rebirths')).toContainText('1');
  await expect(page.locator('.world-select option')).toHaveCount(8);
  await expect(page.locator('.toast')).toContainText('Rebirth');

  // ...and progress is RESET: back on World 1 at zero, World 2 locked again.
  await expect(pointsValue(page)).toHaveText('0');
  await expect(worldOption(page, 'World 2')).toHaveJSProperty('disabled', true);
});
