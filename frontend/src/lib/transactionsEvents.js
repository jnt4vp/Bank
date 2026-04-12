export const TRANSACTIONS_UPDATED_EVENT = 'pactbank:transactions-updated'

/** After Plaid sync/connect (or similar), so Goals and other views can refresh spend totals. */
export function dispatchTransactionsUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TRANSACTIONS_UPDATED_EVENT))
}
