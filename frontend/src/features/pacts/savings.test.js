import test from 'node:test'
import assert from 'node:assert/strict'

import { computePactSavings, computeSavingsBaseAmount } from './savings.js'

const pact = { id: 'p1' }
const settings = {
  p1: { accountability_type: 'savings_percentage', discipline_savings_percentage: 10 },
}
const matcher = () => true

test('computeSavingsBaseAmount keeps amount for non-tax purchase', () => {
  assert.equal(computeSavingsBaseAmount({ amount: 20 }), 20)
})

test('computeSavingsBaseAmount includes fixed tax when subtotal present', () => {
  assert.equal(
    computeSavingsBaseAmount({ subtotal: 100, tax_amount: 8.25 }),
    108.25
  )
})

test('computeSavingsBaseAmount applies percentage tax when provided', () => {
  assert.equal(
    computeSavingsBaseAmount({ subtotal: 100, tax_percent: 7.5 }),
    107.5
  )
})

test('computePactSavings uses taxed total for contribution', () => {
  const value = computePactSavings({
    flaggedTransactions: [{ id: 't1', amount: 100, subtotal: 100, tax_percent: 10 }],
    activePacts: [pact],
    accountabilityByPact: settings,
    transactionMatchesPact: matcher,
  })
  assert.equal(value, 11)
})

test('computePactSavings rounds decimal contributions stably', () => {
  const value = computePactSavings({
    flaggedTransactions: [{ id: 't2', amount: 19.99 }],
    activePacts: [pact],
    accountabilityByPact: settings,
    transactionMatchesPact: matcher,
  })
  assert.equal(value, 2)
})
