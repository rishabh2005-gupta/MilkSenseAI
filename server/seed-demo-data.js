import 'dotenv/config'
import pg from 'pg'
import { createDemoObservations } from './demo-data.js'
import { insertObservation, observationValues } from './data.js'

const email = String(process.argv[2] ?? '').trim().toLowerCase()
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: node server/seed-demo-data.js <existing-account-email>')
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.')
  process.exit(1)
}

const { Pool } = pg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
})
const client = await pool.connect()

try {
  await client.query('BEGIN')
  const user = await client.query(
    'SELECT farm_id AS "farmId" FROM users WHERE lower(email) = $1',
    [email],
  )
  if (!user.rowCount) throw new Error('No existing account was found for that email.')

  const farmId = user.rows[0].farmId
  const observations = createDemoObservations()
  for (const observation of observations) {
    await client.query(
      insertObservation,
      observationValues({ ...observation, farmId }),
    )
  }
  await client.query('COMMIT')
  console.log(
    `Added ${observations.length} synthetic observations for ${email} (${new Set(observations.map((observation) => observation.cowId)).size} cows, 60 consecutive days).`,
  )
} catch (error) {
  await client.query('ROLLBACK')
  console.error(error.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
