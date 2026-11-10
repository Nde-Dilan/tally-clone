import { test, expect } from '@playwright/test';
import path from 'node:path';

const ARTIFACT_DIR = 'C:/Users/HP/.gemini/antigravity/brain/478b5ce4-84ee-4605-9a9d-3b2aba9185fa';
const FORM_SLUG = 'kigali-housing';
const FORM_ID = '7d4ac0fe-5c38-4ab5-8bc5-541a7e215b67';

test.describe('Unified Next.js Full-Stack Visual & Functional Verification', () => {
  test('verifies public form, submission, login, dashboard, analytics, and editor with screenshots', async ({ page }) => {
    // 1. Public Form Landing & Referral Code
    await page.goto(`/acme/f/${FORM_SLUG}?utm_source=cmu_whatsapp&utm_medium=community&utm_campaign=fall2026_housing`);
    await expect(page.getByRole('heading', { name: 'Kigali Student Housing Survey', level: 1 })).toBeVisible();

    // Verify referral widget exists and has auto-generated code
    const referralWidget = page.locator('[data-testid="referral-code-widget"]');
    await expect(referralWidget).toBeVisible();
    const codeElem = page.locator('[data-testid="referral-code-value"]');
    const generatedCode = (await codeElem.textContent())?.trim();
    expect(generatedCode).toMatch(/^KGL-[A-Z0-9]{4}$/);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'unified-kigali-housing-landing.png'), fullPage: false });

    // 2. Complete form and submit
    const consent = page.getByRole('checkbox', { name: /I agree to take part/i });
    await consent.check({ force: true });

    const firstTimeRadio = page.getByRole('radio', { name: 'Yes, first time' });
    await firstTimeRadio.click({ force: true });

    const otherAfricanRadio = page.getByRole('radio', { name: 'Other African' });
    await otherAfricanRadio.click({ force: true });

    const countryInput = page.getByRole('textbox', { name: /Which country/i });
    if (await countryInput.isVisible()) {
      await countryInput.fill('Rwanda');
    }

    const gpsInput = page.getByRole('textbox', { name: /Google Maps link/i });
    if (await gpsInput.isVisible()) {
      await gpsInput.fill('https://maps.google.com/?q=-1.954,30.089');
    }

    const aptRadio = page.getByRole('radio', { name: /Apartment in a named building/i });
    if (await aptRadio.isVisible()) {
      await aptRadio.click({ force: true });
    }

    const furnishedRadio = page.getByRole('radio', { name: 'Furnished', exact: true });
    if (await furnishedRadio.isVisible()) {
      await furnishedRadio.click({ force: true });
    }

    const submitBtn = page.getByRole('button', { name: /submit/i });
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click();

    // Thank you screen
    await expect(page.locator('.pf-done__inner')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'unified-kigali-housing-submitted.png') });

    // 3. Login page
    await page.goto('/login');
    await expect(page).toHaveTitle(/Sign in/i);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'unified-admin-login.png') });

    // Fill login
    const emailInput = page.getByRole('textbox', { name: /email/i });
    const passwordInput = page.locator('input[name="password"]');
    await emailInput.fill('alex@example.com');
    await passwordInput.fill('admin123');
    await page.getByRole('button', { name: /sign in|continue/i }).click();

    // 4. Admin Dashboard
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByText('Alex Rivera').first()).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'unified-admin-dashboard.png'), fullPage: false });

    // 5. Analytics View
    await page.goto(`/admin/forms/${FORM_ID}/analytics`);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('dt:has-text("Median time to complete")')).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'unified-admin-analytics.png'), fullPage: false });

    // 6. Document Flow Form Editor
    await page.goto(`/admin/forms/${FORM_ID}/edit`);
    await expect(page.locator('[data-testid="canvas-page"]')).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'unified-admin-editor.png'), fullPage: false });
  });
});
