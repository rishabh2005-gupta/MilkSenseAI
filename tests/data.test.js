import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeObservation, parseCsv } from '../server/data.js'

test('CSV import maps RMS and climate headers and calculates THI', () => {
  const [observation] = parseCsv(
    'date,cow_id,DIM,DMY,MF,FC,PC,Tmax,RHmax,Tmin,RHmin\n2026-11-10,RFID-4,120,31.2,3.1,4.0,3.3,30,80,20,60\n',
  )

  assert.equal(observation.cowId, 'RFID-4')
  assert.equal(observation.dim, 120)
  assert.ok(Math.abs(observation.thiMax - 82.88) < 1e-10)
  assert.ok(Math.abs(observation.thiMin - 65.76) < 1e-10)
})

test('CSV import preserves quoted values and rejects rows without required history fields', () => {
  const [observation] = parseCsv(
    'date,cow_id,name,DIM,DMY,MF,FC,PC\n2026-11-10,42,"Clover, Jr.",80,25,2.4,3.8,3.2\n',
  )
  assert.equal(observation.cowName, 'Clover, Jr.')
  assert.throws(() => parseCsv('cow_id,DIM,DMY,MF,FC,PC\n42,80,25,2.4,3.8,3.2\n'), /date/)
})

test('observation normalization rejects non-finite values and invalid humidity', () => {
  const valid = { cowId: '42', recordedAt: '2026-11-10', dim: 80, dmy: 25, mf: 2.4, fc: 3.8, pc: 3.2 }
  assert.throws(() => normalizeObservation({ ...valid, dmy: 'NaN' }), /finite number/)
  assert.throws(() => normalizeObservation({ ...valid, rhmax: 120 }), /between 0 and 100/)
})
