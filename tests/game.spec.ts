import { test, expect, type Page } from '@playwright/test';

const SAVE_KEY = 'upgrade-tree.save.v1';

// Helpers ---------------------------------------------------------------------
const hudValue = (page: Page, label: string) =>
  page.locator('.hud__stat', { hasText: label }).locator('.hud__value');

const node = (page: Page, name: string) =>
  page.locator('.node', { hasText: name });

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
  await page.addInitScript(
    ([key, state]) => localStorage.setItem(key, state),
    [SAVE_KEY, JSON.stringify({ points: 0, totalEarned: 0, purchased: [0, 2] })] as const
  );
  await page.goto('/');

  await expect(hudValue(page, 'Per second')).toHaveText('1');
  // Points should climb from idle generation without any clicking.
  await expect.poll(async () => Number(await hudValue(page, 'Points').textContent())).toBeGreaterThan(1);
});

test('World 2 is locked in the dropdown until its gateway is bought', async ({ page }) => {
  // Seed: all of World 1 except the gateway owned, with points to spare.
  const purchased = Array.from({ length: 17 }, (_, i) => i); // nodes 0..16
  await page.addInitScript(
    ([key, state]) => localStorage.setItem(key, state),
    [SAVE_KEY, JSON.stringify({ points: 300000, totalEarned: 300000, purchased })] as const
  );
  await page.goto('/');

  const world2Opt = page.locator('.world-select option', { hasText: 'World 2' });
  await expect(world2Opt).toHaveJSProperty('disabled', true);

  // Buy the gateway node.
  const gate = node(page, 'Unlock World 2');
  await expect(gate).toHaveClass(/is-buyable/);
  await gate.click();
  await expect(gate).toHaveClass(/is-purchased/);

  // World 2 is now selectable.
  await expect(world2Opt).toHaveJSProperty('disabled', false);
});

test('selecting World 2 shows its tree, and the final node wins', async ({ page }) => {
  // Seed all of World 1 (incl. gateway) owned, with plenty of points.
  const purchased = Array.from({ length: 18 }, (_, i) => i); // nodes 0..17
  await page.addInitScript(
    ([key, state]) => localStorage.setItem(key, state),
    [SAVE_KEY, JSON.stringify({ points: 1e9, totalEarned: 1e9, purchased })] as const
  );
  await page.goto('/');

  await page.locator('.world-select').selectOption('2');
  await expect(node(page, 'Nexus')).toBeVisible();

  // Buy the path to the final node.
  for (const name of ['Nexus', 'Plasma Generator', 'Antimatter', 'Cosmic Synergy', 'Final Ascension']) {
    const nd = node(page, name);
    await expect(nd).toHaveClass(/is-buyable/);
    await nd.click();
  }

  await expect(page.locator('.win-overlay')).toBeVisible();
  await expect(page.locator('.win-overlay__card')).toContainText('conquered every world');
});
