import { test, expect } from '@playwright/test';
import path from 'node:path';

const ARTIFACT_DIR = 'C:/Users/HP/.gemini/antigravity/brain/478b5ce4-84ee-4605-9a9d-3b2aba9185fa';
const LIVE_URL = 'https://tally-clone-zeta.vercel.app';
const ADMIN_PASSWORD = '1r{|kYo%^8`^-_';
const FORM_ID = '7d4ac0fe-5c38-4ab5-8bc5-541a7e215b67';

test('Verify analytics date range filtering and form builder saving without error', async ({ page }) => {
  test.setTimeout(180000);

  // 1. Login
  await page.goto(`${LIVE_URL}/login`);
  await page.getByRole('textbox', { name: /email/i }).fill('alex@example.com');
  await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in|continue/i }).click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 20000 });

  // 2. Test Form Builder (/admin/forms/[id]/edit)
  await page.goto(`${LIVE_URL}/admin/forms/${FORM_ID}/edit`);
  await expect(page.locator('[data-testid="canvas-page"]')).toBeVisible({ timeout: 20000 });
  
  // Wait a few seconds to verify no autosave error appears
  await page.waitForTimeout(3000);
  await expect(page.locator('body')).not.toContainText("Couldn't save");
  await expect(page.locator('body')).not.toContainText("steps.21.type");
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verified-builder-no-error.png') });

  // 3. Test Analytics Date Presets & Trends (/admin/forms/[id]/analytics)
  // Check All time
  await page.goto(`${LIVE_URL}/admin/forms/${FORM_ID}/analytics`);
  await expect(page.locator('body')).toBeVisible({ timeout: 20000 });
  
  // Check that the trends chart is rendered (SVG or data-testid="analytics-trends")
  const trendsSection = page.locator('[data-testid="analytics-trends"]');
  await expect(trendsSection).toBeVisible();
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verified-analytics-all-time.png') });

  // Click "Today" preset button
  const todayButton = page.getByRole('button', { name: 'Today', exact: true });
  await todayButton.click();
  await page.waitForURL(/preset=today/, { timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verified-analytics-today.png') });

  // Click "Last week" preset button
  const weekButton = page.getByRole('button', { name: 'Last week', exact: true });
  await weekButton.click();
  await page.waitForURL(/preset=week/, { timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verified-analytics-week.png') });

  // 4. Test Forms Explorer
  await page.goto(`${LIVE_URL}/admin/forms`);
  await expect(page.locator('body')).not.toContainText("Couldn't load this section");
  await expect(page.getByRole('heading', { name: /forms/i })).toBeVisible({ timeout: 15000 });

  // 5. Test Submissions Page
  await page.goto(`${LIVE_URL}/admin/forms/${FORM_ID}/submissions`);
  await expect(page.locator('body')).not.toContainText("Couldn't load submissions");
  await expect(page.locator('[data-testid="submissions-view-tabs"]').first()).toBeVisible({ timeout: 15000 });
});
