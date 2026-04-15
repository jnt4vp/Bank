/** Shared test constants and data factories. */

export const API_URL = "http://localhost:8000";

export const TEST_USER = {
  email: "test@example.com",
  password: "Password123!",
};

/** Merchants that trigger preset pact categories. */
export const FLAGGED_MERCHANTS = {
  coffee: { merchant: "Starbucks", description: "Coffee purchase", amount: 5.75 },
  fastFood: { merchant: "McDonalds", description: "Fast food lunch", amount: 8.99 },
  alcohol: { merchant: "Total Wine", description: "Alcohol purchase", amount: 24.99 },
  rideShare: { merchant: "Uber", description: "Ride to airport", amount: 32.5 },
  dining: { merchant: "Olive Garden", description: "Dinner out", amount: 47.0 },
  shopping: { merchant: "Amazon", description: "Online order", amount: 65.0 },
};

/** A transaction that should NOT match any preset category. */
export const UNFLAGGED_TRANSACTION = {
  merchant: "City Water Utility",
  description: "Monthly water bill",
  amount: 42.0,
};

export const PRESET_CATEGORIES = [
  "Coffee Shops",
  "Dining Out",
  "Fast Food",
  "Online Shopping",
  "Ride Services",
  "Alcohol",
  "Subscriptions",
  "TikTok Shop",
];

/** Generate a unique email for signup tests so they don't collide. */
export function uniqueEmail(prefix = "e2e") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
}
