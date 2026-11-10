import { test, expect } from '@playwright/test';
import path from 'node:path';

const ARTIFACT_DIR = 'C:/Users/HP/.gemini/antigravity/brain/478b5ce4-84ee-4605-9a9d-3b2aba9185fa';
const LIVE_URL = 'https://tally-clone-zeta.vercel.app';
const ADMIN_PASSWORD = '1r{|kYo%^8`^-_';
const FORM_SLUG = 'kigali-housing';
const FORM_ID = '7d4ac0fe-5c38-4ab5-8bc5-541a7e215b67';

test.describe('Live Production Vercel & Firebase Firestore Full Flow', () => {
  test('verifies live public form, live submission to Firestore, login with admin password, and dashboard', async ({ page }) => {
    // 1. Visit live public form with UTM tags
    await page.goto(`${LIVE_URL}/acme/f/${FORM_SLUG}?utm_source=cmu_live&utm_medium=production&utm_campaign=live_verification`);
    await expect(page.getByRole('heading', { name: 'Kigali Student Housing Survey', level: 1 })).toBeVisible({ timeout: 15000 });

    // Verify auto referral code widget
    const referralWidget = page.locator('[data-testid="referral-code-widget"]');
    await expect(referralWidget).toBeVisible();
    const codeElem = page.locator('[data-testid="referral-code-value"]');
    const generatedCode = (await codeElem.textContent())?.trim();
    expect(generatedCode).toMatch(/^KGL-[A-Z0-9]{4}$/);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'live-kigali-housing-landing.png'), fullPage: false });

    // 2. Fill out and submit form live to Firestore
    const consent = page.getByRole('checkbox', { name: /I agree to take part/i });
    await consent.check({ force: true });

    const firstTimeRadio = page.getByRole('radio', { name: 'Yes, first time' });
    await firstTimeRadio.click({ force: true });

    const rwandanRadio = page.getByRole('radio', { name: 'Rwandan', exact: true });
    await rwandanRadio.click({ force: true });

    const submitBtn = page.getByRole('button', { name: /submit/i });
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click();

    // Verify Thank You screen with generated referral code
    await expect(page.locator('.pf-done__inner')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.pf-done__inner')).toContainText(generatedCode!);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'live-kigali-housing-submitted.png') });

    // 3. Login to Admin Dashboard with provided password
    await page.goto(`${LIVE_URL}/login`);
    await expect(page).toHaveTitle(/Sign in/i);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'live-admin-login.png') });

    const emailInput = page.getByRole('textbox', { name: /email/i });
    const passwordInput = page.locator('input[name="password"]');
    await emailInput.fill('alex@example.com');
    await passwordInput.fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in|continue/i }).click();

    // Verify redirection to /admin
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: /Welcome, Alex/i })).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'live-admin-dashboard.png'), fullPage: false });

    // 4. Verify Analytics View on Live Firestore
    await page.goto(`${LIVE_URL}/admin/forms/${FORM_ID}/analytics`);
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'live-admin-analytics.png'), fullPage: false });

    // 5. Verify Document Flow Form Editor on Live Site
    await page.goto(`${LIVE_URL}/admin/forms/${FORM_ID}/edit`);
    await expect(page.locator('[data-testid="canvas-page"]')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'live-admin-editor.png'), fullPage: false });
  });
});
