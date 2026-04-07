function toFiniteNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

export function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

export function computeSavingsBaseAmount(transaction) {
  const explicitTotal = toFiniteNumber(transaction?.total_amount)
  if (explicitTotal !== null) return roundCurrency(explicitTotal)

  const subtotal = toFiniteNumber(transaction?.subtotal)
  const taxAmount = toFiniteNumber(transaction?.tax_amount)
  const taxPercent = toFiniteNumber(transaction?.tax_percent)

  if (subtotal !== null) {
    if (taxAmount !== null) return roundCurrency(subtotal + taxAmount)
    if (taxPercent !== null) return roundCurrency(subtotal * (1 + taxPercent / 100))
    return roundCurrency(subtotal)
  }

  const amount = toFiniteNumber(transaction?.amount)
  if (amount !== null) return roundCurrency(amount)
  return 0
}

export function computePactSavings({
  flaggedTransactions,
  activePacts,
  accountabilityByPact,
  transactionMatchesPact,
  debug = false,
}) {
  if (!Array.isArray(flaggedTransactions) || flaggedTransactions.length === 0) return 0
  if (!Array.isArray(activePacts) || activePacts.length === 0) return 0

  let total = 0

  activePacts.forEach((pact) => {
    const settings = accountabilityByPact?.[pact.id]
    if (!settings) return

    const type = settings.accountability_type
    const percent = Number(settings.discipline_savings_percentage || 0)
    if (!(type === 'savings_percentage' || type === 'both') || percent <= 0) return

    flaggedTransactions.forEach((tx) => {
      if (!transactionMatchesPact(tx, pact)) return

      const baseAmount = computeSavingsBaseAmount(tx)
      const contribution = roundCurrency(baseAmount * (percent / 100))
      total = roundCurrency(total + contribution)

      if (debug) {
        // Helpful for tracing tax/subtotal discrepancies in dev.
        console.info('[pact-savings]', {
          transactionId: tx.id,
          merchant: tx.merchant,
          subtotal: tx.subtotal ?? null,
          tax_amount: tx.tax_amount ?? null,
          tax_percent: tx.tax_percent ?? null,
          total_amount: tx.total_amount ?? null,
          baseAmount,
          savingsPercent: percent,
          contribution,
        })
      }
    })
  })

  return roundCurrency(total)
}
