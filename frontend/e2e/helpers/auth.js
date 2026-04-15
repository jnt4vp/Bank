import { expect } from "@playwright/test";
import { API_URL, TEST_USER } from "./fixtures.js";

/**
 * Log in through the UI and wait for the dashboard.
 */
export async function login(page, email = TEST_USER.email, password = TEST_USER.password) {
  await page.goto("/");
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 10_000 });
}

/**
 * Obtain a JWT token directly from the API (faster than UI login).
 * Returns the access_token string.
 */
export async function loginViaAPI(request, email = TEST_USER.email, password = TEST_USER.password) {
  const res = await request.post(`${API_URL}/api/auth/login`, {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`API login failed (${res.status()}): ${await res.text()}`);
  }
  const body = await res.json();
  return body.access_token;
}

/**
 * Inject a JWT into the browser's localStorage so the app treats
 * the session as authenticated without going through the login UI.
 */
export async function injectSession(page, token) {
  await page.goto("/");
  await page.evaluate((t) => localStorage.setItem("token", t), token);
}
