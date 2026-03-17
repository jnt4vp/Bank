const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

export function formatTransactionAmount(amount) {
  const numericAmount = Number(amount)

  if (!Number.isFinite(numericAmount)) {
    return currencyFormatter.format(0)
  }

  return currencyFormatter.format(numericAmount)
}

export function formatTransactionCategory(category) {
  if (!category) {
    return 'Uncategorized'
  }

  return category.split('_').join(' ')
}

export function formatTransactionDate(transaction) {
  const rawValue = transaction?.date || transaction?.created_at

  if (!rawValue) {
    return 'Unknown date'
  }

  const parsedDate = new Date(rawValue)

  if (Number.isNaN(parsedDate.getTime())) {
    return 'Unknown date'
  }

  return parsedDate.toLocaleDateString()
}

function getSortableTimestamp(transaction) {
  const rawValue = transaction?.date || transaction?.created_at

  if (!rawValue) {
    return Number.NEGATIVE_INFINITY
  }

  const parsedDate = new Date(rawValue)

  if (Number.isNaN(parsedDate.getTime())) {
    return Number.NEGATIVE_INFINITY
  }

  return parsedDate.getTime()
}

export function sortTransactionsByActivityDate(transactions) {
  return [...transactions].sort((left, right) => {
    const timestampDelta = getSortableTimestamp(right) - getSortableTimestamp(left)

    if (timestampDelta !== 0) {
      return timestampDelta
    }

    return String(right.id || '').localeCompare(String(left.id || ''))
  })
}
