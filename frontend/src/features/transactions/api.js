import { apiRequest } from '../../lib/api'

export function fetchCounterValue() {
  return apiRequest('/api/counter')
}

export function incrementCounterValue() {
  return apiRequest('/api/counter/increment', { method: 'POST' })
}
