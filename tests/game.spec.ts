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

test('boots and renders the tree from WASM', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.click-btn')).toBeVisible();
  await expect(hudValue(page, 'Points')).toHaveText('0');
  await expect(hudValue(page, 'Per click')).toHaveText('1');
  // All 18 nodes are present.
  await expect(page.locator('.node')).toHaveCount(18);
});

test('clicking earns points and buying the root node applies its effect', async ({ page }) => {
  await page.goto('/');
  const clickBtn = page.locator('.click-btn');

  // Earn enough to afford "Awakening" (cost 10, +1 per click).
  for (let i = 0; i < 10; i++) await clickBtn.click();
  await expect(hudValue(page, 'Points')).toHaveText('10');

  const awakening = node(page, 'Awakening');
  await expect(awakening).toHaveClass(/is-buyable/);
  await awakening.click();

  // Bought: node is owned, points spent, per-click effect (+1) applied.
  await expect(awakening).toHaveClass(/is-purchased/);
  await expect(awakening).toContainText('owned');
  await expect(hudValue(page, 'Points')).toHaveText('0');
  await expect(hudValue(page, 'Per click')).toHaveText('2');
});

test('nodes behind an unmet prerequisite are locked and disabled', async ({ page }) => {
  await page.goto('/');
  // "Double Tap" requires "Sharper Clicks" -> "Awakening"; nothing bought yet.
  const locked = node(page, 'Double Tap');
  await expect(locked).toHaveClass(/is-locked/);
  await expect(locked).toBeDisabled();
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

test('buying The End node wins the game', async ({ page }) => {
  // Seed a save with every prerequisite owned and points to spare.
  const purchased = Array.from({ length: 17 }, (_, i) => i); // nodes 0..16
  await page.addInitScript(
    ([key, state]) => localStorage.setItem(key, state),
    [SAVE_KEY, JSON.stringify({ points: 300000, totalEarned: 300000, purchased })] as const
  );
  await page.goto('/');

  const end = node(page, 'The End');
  await expect(end).toHaveClass(/is-buyable/);
  await end.click();

  await expect(page.locator('.win-overlay')).toBeVisible();
  await expect(page.locator('.win-overlay__card')).toContainText('You reached The End');
});
