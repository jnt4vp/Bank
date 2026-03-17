import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../features/auth/context'
import {
  formatTransactionAmount,
  formatTransactionCategory,
  formatTransactionDate,
  sortTransactionsByActivityDate,
} from '../features/transactions/formatters'
import { useTransactions } from '../features/transactions/useTransactions'
import '../dashboard.css'
import '../transactions.css'

const statusFilters = [
  { value: 'all', label: 'All activity' },
  { value: 'flagged', label: 'Flagged only' },
  { value: 'clear', label: 'Clear only' },
]

function matchesQuery(transaction, query) {
  if (!query) {
    return true
  }

  const haystack = [
    transaction.merchant,
    transaction.description,
    transaction.plaid_original_description,
    transaction.category,
    transaction.flag_reason,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(query)
}

export default function Transactions() {
  const { token } = useAuth()
  const { transactions, loading, error } = useTransactions(token)

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          transactions
            .map((transaction) => transaction.category)
            .filter(Boolean)
        )
      ).sort(),
    [transactions]
  )

  const filteredTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return sortTransactionsByActivityDate(
      transactions.filter((transaction) => {
        if (statusFilter === 'flagged' && !transaction.flagged) {
          return false
        }

        if (statusFilter === 'clear' && transaction.flagged) {
          return false
        }

        if (
          categoryFilter !== 'all' &&
          (transaction.category || 'Uncategorized') !== categoryFilter
        ) {
          return false
        }

        return matchesQuery(transaction, normalizedQuery)
      })
    )
  }, [categoryFilter, query, statusFilter, transactions])

  const flaggedCount = useMemo(
    () => transactions.filter((transaction) => transaction.flagged).length,
    [transactions]
  )

  const latestActivity = filteredTransactions[0]
    ? formatTransactionDate(filteredTransactions[0])
    : 'No activity yet'

  return (
    <div className="dashboard-shell transactions-page">
      <section className="transactions-hero">
        <div className="transactions-hero-copy">
          <Link className="transactions-back-link" to="/dashboard">
            ← Back to dashboard
          </Link>
          <h1 className="dashboard-title transactions-title">Transactions</h1>
          <p className="dashboard-subtitle transactions-subtitle">
            Review every synced purchase, deposit, and flagged event in one place.
          </p>
        </div>

        <div className="transactions-stat-grid">
          <article className="transactions-stat-card">
            <span className="transactions-stat-label">Tracked</span>
            <strong className="transactions-stat-value">{transactions.length}</strong>
          </article>
          <article className="transactions-stat-card">
            <span className="transactions-stat-label">Flagged</span>
            <strong className="transactions-stat-value">{flaggedCount}</strong>
          </article>
          <article className="transactions-stat-card">
            <span className="transactions-stat-label">Latest activity</span>
            <strong className="transactions-stat-value transactions-stat-value-small">
              {latestActivity}
            </strong>
          </article>
        </div>
      </section>

      <section className="dashboard-overview-shell transactions-overview-shell">
        <div className="transactions-toolbar">
          <label className="transactions-field">
            <span className="transactions-field-label">Search</span>
            <input
              className="transactions-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Merchant, description, or flag reason"
            />
          </label>

          <div className="transactions-filter-group" aria-label="Transaction status filters">
            {statusFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={`transactions-filter-chip ${
                  statusFilter === filter.value ? 'is-active' : ''
                }`}
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <label className="transactions-field">
            <span className="transactions-field-label">Category</span>
            <select
              className="transactions-select"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {formatTransactionCategory(category)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="transactions-results-summary">
          Showing {filteredTransactions.length} of {transactions.length} transactions
        </p>

        {loading && <p className="dashboard-empty">Loading transactions...</p>}
        {error && <p className="dashboard-error">{error}</p>}

        {!loading && !error && transactions.length === 0 && (
          <div className="transactions-empty-state">
            No transactions yet. Connect your bank account to start syncing activity.
          </div>
        )}

        {!loading && !error && transactions.length > 0 && filteredTransactions.length === 0 && (
          <div className="transactions-empty-state">
            No transactions match your current filters.
          </div>
        )}

        {!loading && !error && filteredTransactions.length > 0 && (
          <div className="transactions-ledger">
            {filteredTransactions.map((transaction) => {
              const isPlaidTransaction = Boolean(transaction.plaid_transaction_id)
              const primaryLabel = isPlaidTransaction
                ? transaction.description ||
                  transaction.plaid_original_description ||
                  transaction.merchant ||
                  'Unknown transaction'
                : transaction.merchant || transaction.description || 'Unknown merchant'
              const secondaryLabel = isPlaidTransaction
                ? [
                    transaction.merchant,
                    transaction.plaid_original_description,
                  ].find(
                    (value) =>
                      value &&
                      value.trim() &&
                      value.trim() !== primaryLabel
                  )
                : transaction.description &&
                    transaction.description.trim() &&
                    transaction.description !== transaction.merchant
                  ? transaction.description
                  : null

              return (
                <article
                  className={`transactions-ledger-row ${
                    transaction.flagged ? 'is-flagged' : ''
                  }`}
                  key={transaction.id}
                >
                  <div className="transactions-ledger-main">
                    <div className="transactions-ledger-heading">
                      <div className="transactions-ledger-copy">
                        <h2>{primaryLabel}</h2>
                        {secondaryLabel && (
                          <p className="transactions-ledger-description">
                            {secondaryLabel}
                          </p>
                        )}
                      </div>

                      <div className="transactions-ledger-badges">
                        {transaction.pending && (
                          <span className="transactions-badge">Pending</span>
                        )}
                        <span className="transactions-badge">
                          {formatTransactionCategory(transaction.category)}
                        </span>
                      </div>
                    </div>

                    <div className="transactions-ledger-meta">
                      <span>{formatTransactionDate(transaction)}</span>
                      <span>{transaction.flagged ? 'Flagged review' : 'Clear'}</span>
                    </div>

                    {transaction.flagged && (
                      <p className="transactions-ledger-flag">
                        Warning: {transaction.flag_reason || 'Flagged purchase'}
                      </p>
                    )}
                  </div>

                  <div
                    className={`transactions-ledger-amount ${
                      transaction.flagged ? 'is-flagged' : ''
                    }`}
                  >
                    {formatTransactionAmount(transaction.amount)}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
