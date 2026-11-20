import test from 'node:test'
import assert from 'node:assert/strict'
import { createDemoObservations, serializeDemoCsv } from '../../server/demo-data.js'
import { parseCsv } from '../../server/data.js'
import { observationSchema } from '../../shared/observation-schema.js'

test('synthetic demo data follows the observation schema and spans consecutive days per cow', () => {
  const observations = createDemoObservations({
    days: 30,
    endDate: '2026-11-18T12:00:00.000Z',
  })

  assert.equal(observations.length, 8 * 30)
  assert.equal(new Set(observations.map((item) => item.cowId)).size, 8)
  assert.ok(observations.every((item) => observationSchema.every((field) => field.key in item)))

  for (const cowId of new Set(observations.map((item) => item.cowId))) {
    const dates = observations
      .filter((item) => item.cowId === cowId)
      .map((item) => item.recordedAt)
    assert.equal(new Set(dates).size, 30)
    assert.equal(Date.parse(dates.at(-1)) - Date.parse(dates[0]), 29 * 86_400_000)
  }
})

test('generated demo CSV round-trips through the production CSV parser', () => {
  const observations = createDemoObservations({
    days: 6,
    endDate: '2026-11-18T12:00:00.000Z',
  })
  const parsed = parseCsv(serializeDemoCsv(observations))

  assert.equal(parsed.length, observations.length)
  assert.equal(parsed[0].cowId, observations[0].cowId)
  assert.equal(parsed[0].recordedAt, observations[0].recordedAt)
  assert.ok(Number.isFinite(parsed[0].thiMax))
  assert.ok(Number.isFinite(parsed[0].thiMin))
})
