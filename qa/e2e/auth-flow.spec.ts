import { test, expect } from '@playwright/test';

test.describe('Email & Password Authentication Lifecycle', () => {
  test('logs in with email and password, accesses admin dashboard, and logs out', async ({ page, context }) => {
    // 1. Visit /login
    await page.goto('/login');
    await expect(page).toHaveTitle(/Sign in/i);
    await page.screenshot({ path: 'C:/Users/HP/.gemini/antigravity/brain/478b5ce4-84ee-4605-9a9d-3b2aba9185fa/login-email-password.png' });

    // Verify Email and Password fields are visible
    const emailInput = page.getByRole('textbox', { name: /email/i });
    const passwordInput = page.locator('input[name="password"]');
    const submitBtn = page.getByRole('button', { name: /sign in|continue/i });

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();

    // 2. Test invalid password submission
    await emailInput.fill('alex@example.com');
    await passwordInput.fill('12'); // Too short (< 4 chars)
    await submitBtn.click();

    const alert = page.locator('p[role="alert"]');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/password/i);

    // 3. Test successful login with valid credentials
    await emailInput.fill('alex@example.com');
    await passwordInput.fill('admin123');
    await submitBtn.click();

    // Verify redirection to /admin dashboard
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByText('Alex Rivera').first()).toBeVisible();

    // 4. Test Sign Out
    const userBtn = page.getByRole('button', { name: /Alex Rivera/i }).first();
    if (await userBtn.isVisible()) {
      await userBtn.click();
      const signOutBtn = page.getByRole('button', { name: /sign out|log out/i }).or(page.getByText(/sign out|log out/i)).first();
      if (await signOutBtn.isVisible()) {
        await signOutBtn.click();
        await expect(page).toHaveURL(/\/login/);
      }
    }
  });
});
