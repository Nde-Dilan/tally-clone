import { test, expect } from '@playwright/test';

test.describe('First-Party Analytics & Attribution Verification', () => {
  test('records submission with UTM tags and displays metrics in analytics dashboard', async ({ page }) => {
    // 1. Visit public form with UTM parameters
    await page.goto('/acme/f/lead-qualifier?utm_source=twitter&utm_medium=social&utm_campaign=survey2026');
    await expect(page).toHaveTitle(/Acme|Lead/i);

    // 2. Advance through the form
    const startBtn = page.getByRole('button', { name: /start|comenzar|get started/i });
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // Step 1: Dropdown role
    const combobox = page.getByRole('combobox');
    await expect(combobox).toBeVisible();
    await combobox.click();
    const option = page.getByRole('option', { name: /Founder/i });
    await expect(option).toBeVisible();
    await option.click();

    // Next step: Team size slider
    const nextBtn1 = page.getByRole('button', { name: /next|continue|siguiente/i });
    if (await nextBtn1.isVisible()) {
      await nextBtn1.click();
    }

    // Step: Company
    const companyInput = page.getByPlaceholder(/company|empresa/i).or(page.locator('input[type="text"]'));
    if (await companyInput.isVisible()) {
      await companyInput.fill('Research Lab');
      const nextBtn2 = page.getByRole('button', { name: /next|continue|siguiente/i });
      if (await nextBtn2.isVisible()) {
        await nextBtn2.click();
      }
    }

    // Step: Email
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible()) {
      await emailInput.fill('researcher@example.com');
      const submitBtn = page.getByRole('button', { name: /submit|send|enviar|next/i });
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
      }
    }

    // Wait a brief moment for database commit
    await page.waitForTimeout(1000);

    // 3. Navigate to admin analytics dashboard
    await page.goto('/admin/forms/3ffdbdb2-cd83-47a3-9357-f4f87f5878b7/analytics');
    await expect(page.locator('body')).toBeVisible();

    // Verify completion time metrics (Median and Average)
    const medianCard = page.locator('dt:has-text("Median time to complete")');
    await expect(medianCard).toBeVisible();

    const avgCard = page.locator('dt:has-text("Average time to complete")');
    await expect(avgCard).toBeVisible();

    // Verify Dropoff section with question step keys
    const dropoffSection = page.locator('[data-testid="analytics-dropoff"]');
    await expect(dropoffSection).toBeVisible();
    await expect(dropoffSection).toContainText('(role)');

    // Verify Traffic Attribution section
    const trafficSection = page.locator('[data-testid="analytics-traffic"]');
    await expect(trafficSection).toBeVisible();
    await expect(trafficSection).toContainText('twitter');
    await expect(trafficSection).toContainText('social');
    await expect(trafficSection).toContainText('survey2026');
  });
});
