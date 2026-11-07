import { test, expect } from '@playwright/test';

test.describe('Tally-Style Document Flow Builder Verification', () => {
  test('switches between document flow and slides, inserts inline blocks, and duplicates', async ({ page }) => {
    // 1. Navigate to form editor
    await page.goto('/admin/forms/3ffdbdb2-cd83-47a3-9357-f4f87f5878b7/edit');
    await expect(page.locator('body')).toBeVisible();

    // 2. Check layout switcher exists
    const docLayoutBtn = page.locator('[data-testid="layout-switch-document"]');
    const slidesLayoutBtn = page.locator('[data-testid="layout-switch-slides"]');
    await expect(docLayoutBtn).toBeVisible();
    await expect(slidesLayoutBtn).toBeVisible();

    // 3. Switch to Document Flow (Tally-style)
    await docLayoutBtn.click();
    await expect(page.locator('[data-testid="canvas-page"]')).toBeVisible();

    // Count existing page blocks
    const initialBlocks = await page.locator('[data-testid^="page-block-"]').count();
    expect(initialBlocks).toBeGreaterThan(0);

    // 4. Test Inline Block Inserter
    const addBlockBtn = page.locator('[data-testid="inline-add-block-btn"]').first();
    await expect(addBlockBtn).toBeVisible();
    await addBlockBtn.click();

    // The quick insert menu opens
    const menu = page.locator('[data-testid="inline-block-menu"]');
    await expect(menu).toBeVisible();

    // Insert a Short Answer block
    const shortTextOption = page.locator('[data-testid="insert-type-short"]');
    await expect(shortTextOption).toBeVisible();
    await shortTextOption.click();

    // Verify block count increased
    await expect(async () => {
      const count = await page.locator('[data-testid^="page-block-"]').count();
      expect(count).toBe(initialBlocks + 1);
    }).toPass({ timeout: 5000 });

    // 5. Test Duplicate block action
    const duplicateBtn = page.locator('[data-testid^="duplicate-step-"]').first();
    // Hover over the block to ensure the action controls are visible
    const firstBlock = page.locator('[data-testid^="page-block-"]').first();
    await firstBlock.hover();
    await expect(duplicateBtn).toBeVisible();
    await duplicateBtn.click();

    // Verify block count increased again
    await expect(async () => {
      const count = await page.locator('[data-testid^="page-block-"]').count();
      expect(count).toBe(initialBlocks + 2);
    }).toPass({ timeout: 5000 });

    // 6. Switch back to Slide by Slide
    await slidesLayoutBtn.click();
    await expect(page.locator('[data-testid="canvas-page"]')).not.toBeVisible();
  });
});
