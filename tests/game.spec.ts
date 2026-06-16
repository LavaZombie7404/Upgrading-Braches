import { test, expect, type Page } from '@playwright/test';

const SAVE_KEY = 'upgrade-tree.save.v1';

interface WorldSave {
  points: number;
  totalEarned: number;
}
interface SaveState {
  purchased: number[];
  worlds: WorldSave[];
}

// Helpers ---------------------------------------------------------------------
const hudValue = (page: Page, label: string) =>
  page.locator('.hud__stat', { hasText: label }).locator('.hud__value');

const node = (page: Page, name: string) =>
  page.locator('.node', { hasText: name });

/** Seed a save into localStorage before the app boots. */
const seedSave = (page: Page, state: SaveState) =>
  page.addInitScript(
    ([key, json]) => localStorage.setItem(key, json),
    [SAVE_KEY, JSON.stringify(state)] as const
  );

/** Build a SaveState with the given purchased nodes and per-world balances. */
const save = (purchased: number[], w1: WorldSave, w2: WorldSave): SaveState => ({
  purchased,
  worlds: [w1, w2],
});

const ZERO: WorldSave = { points: 0, totalEarned: 0 };

test.beforeEach(async ({ page }) => {
  // Start every test from a clean slate (no carried-over save).
  await page.addInitScript((key) => localStorage.removeItem(key), SAVE_KEY);
});

test('boots with only the free root node revealed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.click-btn')).toBeVisible();
  await expect(hudValue(page, 'Points')).toHaveText('0');
  await expect(hudValue(page, 'Per click')).toHaveText('1');
  // Locked nodes are hidden — only the root "Awakening" shows at the start.
  await expect(page.locator('.node:visible')).toHaveCount(1);
  await expect(node(page, 'Awakening')).toBeVisible();
});

test('clicking the button earns points', async ({ page }) => {
  await page.goto('/');
  const clickBtn = page.locator('.click-btn');
  for (let i = 0; i < 5; i++) await clickBtn.click();
  await expect(hudValue(page, 'Points')).toHaveText('5');
});

test('pressing Space earns points', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.click-btn')).toBeVisible(); // wait for the engine to load
  for (let i = 0; i < 4; i++) await page.keyboard.press('Space');
  await expect(hudValue(page, 'Points')).toHaveText('4');
});

test('holding Space earns only one point per press', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.click-btn')).toBeVisible();
  // First keydown counts; subsequent auto-repeat keydowns are ignored.
  await page.keyboard.down('Space');
  await page.keyboard.down('Space');
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await expect(hudValue(page, 'Points')).toHaveText('1');
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
  await expect(hudValue(page, 'Points')).toHaveText('0');
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
  await seedSave(page, save([0, 2], ZERO, ZERO));
  await page.goto('/');

  await expect(hudValue(page, 'Per second')).toHaveText('1');
  // Points should climb from idle generation without any clicking.
  await expect.poll(async () => Number(await hudValue(page, 'Points').textContent())).toBeGreaterThan(1);
});

test('World 2 is locked in the dropdown until its gateway is bought', async ({ page }) => {
  // All of World 1 except the gateway owned, with points to spare.
  const purchased = Array.from({ length: 17 }, (_, i) => i); // nodes 0..16
  await seedSave(page, save(purchased, { points: 300000, totalEarned: 300000 }, ZERO));
  await page.goto('/');

  const world2Opt = page.locator('.world-select option', { hasText: 'World 2' });
  await expect(world2Opt).toHaveJSProperty('disabled', true);

  // Buy the gateway node.
  const gate = node(page, 'Unlock World 2');
  await expect(gate).toHaveClass(/is-buyable/);
  await gate.click();
  await expect(gate).toHaveClass(/is-purchased/);

  // World 2 is now selectable, and a toast announces it.
  await expect(world2Opt).toHaveJSProperty('disabled', false);
  await expect(page.locator('.toast')).toContainText('World 2 unlocked');
});

test('each world keeps its own independent currency', async ({ page }) => {
  // World 2 already unlocked (gateway owned). World 1 has 500 banked, no
  // generators (so its balance is stable); World 2 starts at zero.
  await seedSave(page, save([17], { points: 500, totalEarned: 500 }, ZERO));
  await page.goto('/');

  await expect(hudValue(page, 'Points')).toHaveText('500'); // World 1 currency

  await page.locator('.world-select').selectOption('2');
  await expect(hudValue(page, 'Points')).toHaveText('0'); // World 2's own currency

  const clickBtn = page.locator('.click-btn');
  for (let i = 0; i < 3; i++) await clickBtn.click();
  await expect(hudValue(page, 'Points')).toHaveText('3'); // earned in World 2

  // Switching back, World 1's balance is untouched by World 2 clicks.
  await page.locator('.world-select').selectOption('1');
  await expect(hudValue(page, 'Points')).toHaveText('500');
});

test('selecting World 2 shows its tree, and the final node wins', async ({ page }) => {
  // All of World 1 (incl. gateway) owned; World 2 funded for its fresh curve.
  const purchased = Array.from({ length: 18 }, (_, i) => i); // nodes 0..17
  await seedSave(page, save(purchased, ZERO, { points: 50000, totalEarned: 50000 }));
  await page.goto('/');

  await page.locator('.world-select').selectOption('2');
  await expect(node(page, 'Nexus')).toBeVisible();

  // Buy the path to the final node (spending World 2 currency).
  for (const name of ['Nexus', 'Plasma Generator', 'Antimatter', 'Cosmic Synergy', 'Final Ascension']) {
    const nd = node(page, name);
    await expect(nd).toHaveClass(/is-buyable/);
    await nd.click();
  }

  await expect(page.locator('.win-overlay')).toBeVisible();
  await expect(page.locator('.win-overlay__card')).toContainText('conquered every world');
});
