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

function parseSortableDate(value) {
  if (!value) {
    return Number.NEGATIVE_INFINITY
  }

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return Number.NEGATIVE_INFINITY
  }

  return parsedDate.getTime()
}

export function sortTransactionsByActivityDate(transactions) {
  return [...transactions].sort((left, right) => {
    const activityDateDelta =
      parseSortableDate(right?.date) - parseSortableDate(left?.date)

    if (activityDateDelta !== 0) {
      return activityDateDelta
    }

    const createdAtDelta =
      parseSortableDate(right?.created_at) - parseSortableDate(left?.created_at)

    if (createdAtDelta !== 0) {
      return createdAtDelta
    }

    return String(right.id || '').localeCompare(String(left.id || ''))
  })
}
