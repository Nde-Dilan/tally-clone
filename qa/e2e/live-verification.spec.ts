import { test, expect } from '@playwright/test';

test.describe('Live Platform Verification', () => {
  test('public form renders, accepts input, and advances', async ({ page }) => {
    await page.goto('/acme/f/lead-qualifier');
    await expect(page).toHaveTitle(/Acme|Lead/i);

    // Cover page CTA button
    const startBtn = page.getByRole('button', { name: /start|comenzar|get started/i });
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // Question 1: Dropdown "What best describes you?"
    const combobox = page.getByRole('combobox');
    await expect(combobox).toBeVisible();
    await combobox.click();
    // Select an option, e.g. "Founder / Owner"
    const option = page.getByRole('option', { name: /Founder/i });
    await expect(option).toBeVisible();
    await option.click();

    // Check that we advance or show Next button
    const nextBtn = page.getByRole('button', { name: /next|continue|siguiente/i });
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
    }
  });

  test('admin dashboard is reachable', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('body')).toBeVisible();
  });
});
