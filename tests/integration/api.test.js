import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import express from 'express'
import { createServer } from 'node:http'
import { hashToken } from '../../server/auth.js'
import { registerApiRoutes } from '../../server/routes.js'
import { insertObservation, queries } from '../../server/queries.js'
import { observationSchema } from '../../shared/observation-schema.js'

const sessionSecret = 'unit-and-integration-tests-use-a-local-secret'
const originalSessionSecret = process.env.SESSION_SECRET
const sessionToken = 'integration-session-token'
const user = { id: 'user-1', farmId: 'farm-1', name: 'Test User', email: 'test@example.com' }
const executed = []
let server
let baseUrl

const pool = {
  async query(statement, values) {
    executed.push({ statement, values })
    if (statement === queries.requireAuth) {
      return values[0] === hashToken(sessionToken)
        ? { rowCount: 1, rows: [user] }
        : { rowCount: 0, rows: [] }
    }
    return { rowCount: 1, rows: [] }
  },
  async connect() {
    return {
      async query(statement, values) {
        executed.push({ statement, values })
        return { rowCount: 1, rows: [] }
      },
      release() {},
    }
  },
}

before(async () => {
  process.env.SESSION_SECRET = sessionSecret
  const app = express()
  app.use(express.json())
  registerApiRoutes(app, { pool, config: {}, root: process.cwd() })
  server = createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
  if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET
  else process.env.SESSION_SECRET = originalSessionSecret
})

beforeEach(() => {
  executed.length = 0
})

test('health endpoint responds through the HTTP server and checks database connectivity', async () => {
  const response = await fetch(`${baseUrl}/api/health`)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok' })
  assert.equal(executed[0].statement, queries.health)
})

test('protected API rejects unauthenticated requests before accessing protected data', async () => {
  const response = await fetch(`${baseUrl}/api/data/summary`)

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'Sign in to continue.' })
  assert.equal(executed.length, 0)
})

test('authenticated CSV import validates and persists observations in one transaction', async () => {
  const response = await fetch(`${baseUrl}/api/data/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `milksense_session=${sessionToken}`,
    },
    body: JSON.stringify({
      csv: 'date,cow_id,DIM,DMY,MF,FC,PC,Tmax,RHmax\n2026-11-10,RFID-4,120,31.2,3.1,4.0,3.3,30,80',
    }),
  })

  assert.equal(response.status, 201)
  assert.deepEqual(await response.json(), {
    imported: 1,
    message: '1 observation saved.',
  })
  assert.deepEqual(executed.map(({ statement }) => statement), [
    queries.requireAuth,
    queries.begin,
    insertObservation,
    queries.commit,
  ])
  assert.equal(executed[2].values[0], user.farmId)
  const savedObservation = Object.fromEntries(
    observationSchema.map((field, index) => [field.key, executed[2].values[index + 1]]),
  )
  assert.equal(savedObservation.cowId, 'RFID-4')
  assert.equal(savedObservation.recordedAt, '2026-11-10')
  assert.equal(savedObservation.thiMax, 82.88)
})

test('authenticated CSV import returns validation errors without opening a transaction', async () => {
  const response = await fetch(`${baseUrl}/api/data/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `milksense_session=${sessionToken}`,
    },
    body: JSON.stringify({ csv: 'date,cow_id\n2026-11-10,RFID-4' }),
  })

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /Missing required columns/)
  assert.deepEqual(executed.map(({ statement }) => statement), [queries.requireAuth])
})
