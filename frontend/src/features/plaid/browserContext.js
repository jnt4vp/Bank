export const PLAID_BROWSER_TAB_ERROR =
  "Plaid Link must be opened in a regular browser tab, not an embedded preview."

export function isEmbeddedBrowserContext() {
  if (typeof window === "undefined") {
    return false
  }

  try {
    return window.self !== window.top
  } catch {
    return true
  }
}
