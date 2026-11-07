import { test, expect } from '@playwright/test';

test.describe('Kigali Student Housing Survey - Clean Sections & Auto Referral Code Verification', () => {
  const FORM_SLUG = 'kigali-housing';
  const FORM_ID = '7d4ac0fe-5c38-4ab5-8bc5-541a7e215b67';

  test('verifies removed sections, auto-generated referral code, submission, and analytics', async ({ page }) => {
    // 1. Visit public form with campaign UTM attribution
    await page.goto(`/acme/f/${FORM_SLUG}?utm_source=cmu_whatsapp&utm_medium=community&utm_campaign=fall2026_housing`);
    await expect(page).toHaveTitle(/Kigali|Housing/i);

    // Verify Document Flow intro & section headers
    await expect(page.getByRole('heading', { name: 'Kigali Student Housing Survey', level: 1 })).toBeVisible();
    await expect(page.getByText(/Help CMU students find fair housing in Kigali/i)).toBeVisible();

    // Verification 1: Verify removed sections do NOT exist
    await expect(page.getByRole('heading', { name: 'Choosing where to live' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Finding housing' })).toHaveCount(0);
    await expect(page.getByText(/How much did housing problems affect your studies or daily life\?/i)).toHaveCount(0);
    await expect(page.getByText(/Which interview mode do you prefer\?/i)).toHaveCount(0);
    await expect(page.getByText(/What time of year is best for this survey\?/i)).toHaveCount(0);
    await expect(page.getByText(/Do you want to see the results\?/i)).toHaveCount(0);

    // Verification 2: Verify "About this kind of survey" only has the first 2 questions
    await expect(page.getByRole('heading', { name: 'About this kind of survey' })).toBeVisible();
    await expect(page.getByText(/How did you hear about this survey\?/i)).toBeVisible();
    await expect(page.getByText(/What made you take part\?/i)).toBeVisible();

    // Verification 3: Verify "Your referral code" section has auto-generated code
    await expect(page.getByRole('heading', { name: 'Your referral code' })).toBeVisible();
    const referralWidget = page.locator('[data-testid="referral-code-widget"]');
    await expect(referralWidget).toBeVisible();
    const codeElem = page.locator('[data-testid="referral-code-value"]');
    await expect(codeElem).toBeVisible();
    const generatedCode = (await codeElem.textContent())?.trim();
    expect(generatedCode).toMatch(/^KGL-[A-Z0-9]{4}$/);

    // Test Copy button on referral code
    const copyBtn = page.getByRole('button', { name: /copy/i });
    await expect(copyBtn).toBeVisible();

    // Complete mandatory fields to submit
    // Consent Checkbox
    const consent = page.getByRole('checkbox', { name: /I agree to take part/i });
    await expect(consent).toBeVisible();
    await consent.check({ force: true });

    // First Submission
    const firstTimeRadio = page.getByRole('radio', { name: 'Yes, first time' });
    await expect(firstTimeRadio).toBeVisible();
    await firstTimeRadio.click({ force: true });

    // Nationality Group
    const otherAfricanRadio = page.getByRole('radio', { name: 'Other African' });
    await expect(otherAfricanRadio).toBeVisible();
    await otherAfricanRadio.click({ force: true });

    // Conditional Reveal: Nationality Country
    const countryInput = page.getByRole('textbox', { name: /Which country/i });
    if (await countryInput.isVisible()) {
      await countryInput.fill('Kenya');
    }

    // Google Maps link
    const gpsInput = page.getByRole('textbox', { name: /Google Maps link/i });
    if (await gpsInput.isVisible()) {
      await gpsInput.fill('https://maps.google.com/?q=-1.954,30.089');
    }

    // Property Type
    const aptRadio = page.getByRole('radio', { name: /Apartment in a named building/i });
    if (await aptRadio.isVisible()) {
      await aptRadio.click({ force: true });
    }

    // Furnishing
    const furnishedRadio = page.getByRole('radio', { name: 'Furnished', exact: true });
    if (await furnishedRadio.isVisible()) {
      await furnishedRadio.click({ force: true });
    }

    // Road paved
    const roadRadio = page.getByRole('radiogroup', { name: /paved/i }).getByRole('radio', { name: 'Yes' });
    if (await roadRadio.isVisible()) {
      await roadRadio.click({ force: true });
    }

    // Submit the form
    const submitBtn = page.getByRole('button', { name: /submit/i });
    await submitBtn.scrollIntoViewIfNeeded();
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Verify submission succeeds and thank you screen renders with interpolated auto-generated referral code
    await expect(page.locator('.pf-done__inner')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.pf-done__inner')).toContainText(generatedCode!);
    await expect(page.locator('[data-testid="done-referral-code"]')).toBeVisible();
    await expect(page.locator('[data-testid="done-referral-code"]')).toContainText(generatedCode!);

    // 2. Verify Analytics Dashboard
    await page.goto(`/admin/forms/${FORM_ID}/analytics`);
    await expect(page.locator('body')).toBeVisible();

    // Check completion metrics
    await expect(page.locator('dt:has-text("Median time to complete")')).toBeVisible();
    await expect(page.locator('dt:has-text("Average time to complete")')).toBeVisible();

    // Check First-Party Traffic Attribution
    const trafficTable = page.locator('[data-testid="analytics-traffic"]');
    await expect(trafficTable).toBeVisible();
    await expect(trafficTable).toContainText('cmu_whatsapp');
    await expect(trafficTable).toContainText('community');
    await expect(trafficTable).toContainText('fall2026_housing');

    // 3. Verify Form Editor in Document Flow
    await page.goto(`/admin/forms/${FORM_ID}/edit`);
    await expect(page.locator('body')).toBeVisible();

    // Document Flow canvas should be active
    const canvasPage = page.locator('[data-testid="canvas-page"]');
    await expect(canvasPage).toBeVisible();

    // Verify questions rendered as editable blocks
    const blockCount = await page.locator('[data-testid^="page-block-"]').count();
    expect(blockCount).toBeGreaterThan(15);
  });
});
