import { test, expect } from '@playwright/test';

test.describe('NexusAI Landing Page', () => {
  test('should load the landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/NexusAI/i);
  });

  test('should navigate to login page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /login|sign in/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('should navigate to signup page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /signup|sign up/i }).click();
    await expect(page).toHaveURL(/\/signup/);
  });
});

test.describe('Health Check', () => {
  test('API health endpoint should return 200', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
  });
});

test.describe('Authentication Flow', () => {
  test('should show login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /sign in|login/i })).toBeVisible();
  });

  test('should redirect unauthenticated users from dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Content Generation', () => {
  test('nexus input should be visible on nexus page', async ({ page }) => {
    await page.goto('/login');
    await page.goto('/nexus');
    const textarea = page.getByPlaceholder(/content idea|topic|request/i);
    await expect(textarea).toBeVisible();
  });
});
