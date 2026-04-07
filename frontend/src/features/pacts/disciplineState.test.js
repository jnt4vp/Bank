import test from 'node:test'
import assert from 'node:assert/strict'

import {
  computeDisciplineScoreFromFlagged,
  filterTransactionsForDisciplineWindow,
  getDisciplineUiState,
  themeBackgroundKeyFromDisciplineScore,
} from './disciplineState.js'

test('maps 75-100 to strong state', () => {
  assert.equal(getDisciplineUiState(90).key, 'strong')
})

test('maps 50-74 to slipping state', () => {
  assert.equal(getDisciplineUiState(60).key, 'slipping')
})

test('maps 25-49 to risk state', () => {
  assert.equal(getDisciplineUiState(30).key, 'risk')
})

test('maps 0-24 to broken state', () => {
  assert.equal(getDisciplineUiState(10).key, 'broken')
})

test('computeDisciplineScoreFromFlagged matches backend formula', () => {
  assert.equal(computeDisciplineScoreFromFlagged(0, 0), null)
  assert.equal(computeDisciplineScoreFromFlagged(10, 0), 100)
  assert.equal(computeDisciplineScoreFromFlagged(10, 5), 50)
  assert.equal(computeDisciplineScoreFromFlagged(3, 1), 67)
})

test('themeBackgroundKeyFromDisciplineScore uses percent bands', () => {
  assert.equal(themeBackgroundKeyFromDisciplineScore(null), 'sky')
  assert.equal(themeBackgroundKeyFromDisciplineScore(10), 'red')
  assert.equal(themeBackgroundKeyFromDisciplineScore(40), 'stormy')
  assert.equal(themeBackgroundKeyFromDisciplineScore(60), 'money')
  assert.equal(themeBackgroundKeyFromDisciplineScore(90), 'sunny')
})

test('filterTransactionsForDisciplineWindow excludes older created_at', () => {
  const start = '2026-06-01T12:00:00.000Z'
  const txs = [
    { created_at: '2025-01-01T00:00:00.000Z', flagged: true },
    { created_at: '2026-06-15T00:00:00.000Z', flagged: false },
  ]
  const w = filterTransactionsForDisciplineWindow(txs, start)
  assert.equal(w.length, 1)
  assert.equal(w[0].created_at, '2026-06-15T00:00:00.000Z')
})

test('filterTransactionsForDisciplineWindow is empty when window not started', () => {
  const txs = [{ created_at: '2025-01-01T00:00:00.000Z', flagged: true }]
  assert.equal(filterTransactionsForDisciplineWindow(txs, null).length, 0)
})
