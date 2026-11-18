import 'dotenv/config'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import nodemailer from 'nodemailer'
import pg from 'pg'
import { createToken, hashPassword, hashToken, smtpConfigured, verifyPassword } from './auth.js'
import { normalizeObservation, observationValues, parseCsv } from './data.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.PORT ?? 3001)
const sessionCookie = 'milksense_session'
const sessionDays = 7
const verificationHours = 24
const alertThiThreshold = 78
const { Pool } = pg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
})

const config = {
  frontendUrl: (process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER,
  smtpPassword: process.env.SMTP_PASSWORD,
  smtpFrom: process.env.SMTP_FROM,
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.')
  process.exit(1)
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error('SESSION_SECRET must contain at least 32 characters.')
  process.exit(1)
}

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', process.env.TRUST_PROXY === 'true')
app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (process.env.NODE_ENV === 'production') response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
})
app.use(express.json({ limit: '5mb', strict: true }))

const requestCounts = new Map()
app.use('/api', (request, response, next) => {
  const now = Date.now()
  const key = request.ip
  const entry = requestCounts.get(key)
  if (!entry || now - entry.startedAt >= 60_000) {
    requestCounts.set(key, { startedAt: now, count: 1 })
  } else {
    entry.count += 1
    if (entry.count > 240) return response.status(429).json({ error: 'Too many requests. Try again shortly.' })
  }
  if (requestCounts.size > 2000) {
    for (const [ip, value] of requestCounts) if (now - value.startedAt > 60_000) requestCounts.delete(ip)
  }
  next()
})

function authLimiter(maxAttempts, windowMs) {
  const attempts = new Map()
  return (request, response, next) => {
    const now = Date.now()
    const key = request.ip
    const entry = attempts.get(key)
    if (!entry || now - entry.startedAt >= windowMs) {
      attempts.set(key, { startedAt: now, count: 1 })
    } else {
      entry.count += 1
      if (entry.count > maxAttempts) return response.status(429).json({ error: 'Too many authentication attempts. Try again later.' })
    }
    if (attempts.size > 2000) {
      for (const [ip, value] of attempts) if (now - value.startedAt > windowMs) attempts.delete(ip)
    }
    next()
  }
}

app.use('/api/auth/login', authLimiter(12, 15 * 60_000))
app.use('/api/auth/register', authLimiter(6, 60 * 60_000))
app.use('/api/auth/resend-verification', authLimiter(5, 60 * 60_000))

function readCookie(request, name) {
  const cookies = request.headers.cookie?.split(';') ?? []
  const cookie = cookies.find((item) => item.trim().startsWith(`${name}=`))
  return cookie ? cookie.trim().slice(name.length + 1) : null
}

function setSessionCookie(response, token) {
  response.cookie(sessionCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: sessionDays * 24 * 60 * 60 * 1000,
  })
}

const asyncRoute = (handler) => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)

const requireAuth = asyncRoute(async (request, response, next) => {
  const token = readCookie(request, sessionCookie)
  if (!token) return response.status(401).json({ error: 'Sign in to continue.' })
  const result = await pool.query(
    `SELECT u.id, u.farm_id AS "farmId", u.name, u.email
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.email_verified_at IS NOT NULL`,
    [hashToken(token)],
  )
  if (!result.rowCount) return response.status(401).json({ error: 'Your session has expired. Sign in again.' })
  request.user = result.rows[0]
  next()
})

function mailTransport() {
  if (!smtpConfigured(config)) throw new Error('Email delivery is not configured. Set SMTP_HOST and SMTP_FROM.')
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPassword } : undefined,
    disableFileAccess: true,
    disableUrlAccess: true,
  })
}

function toClientUser(user) {
  return { id: user.id, name: user.name, email: user.email, farmName: user.farmName }
}

app.get('/api/health', asyncRoute(async (_request, response) => {
  await pool.query('SELECT 1')
  response.json({ status: 'ok' })
}))

app.post('/api/auth/register', asyncRoute(async (request, response) => {
  const { name, email, farmName, password } = request.body ?? {}
  const normalizedEmail = String(email ?? '').trim().toLowerCase()
  if (!name || String(name).trim().length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return response.status(400).json({ error: 'Enter a name and a valid email address.' })
  }
  if (!farmName || String(farmName).trim().length > 160) return response.status(400).json({ error: 'Enter a farm or organization name.' })
  let passwordHash
  try {
    passwordHash = await hashPassword(password)
  } catch (error) {
    return response.status(400).json({ error: error.message })
  }
  let transport
  try {
    transport = mailTransport()
  } catch (error) {
    return response.status(503).json({ error: error.message })
  }
  const token = createToken()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const farm = await client.query('INSERT INTO farms (name) VALUES ($1) RETURNING id', [String(farmName).trim()])
    const user = await client.query(
      'INSERT INTO users (farm_id, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, email',
      [farm.rows[0].id, String(name).trim(), normalizedEmail, passwordHash],
    )
    await client.query(
      'INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES ($1, $2, now() + ($3 * interval \'1 hour\'))',
      [user.rows[0].id, hashToken(token), verificationHours],
    )
    const verificationUrl = `${config.frontendUrl}/?verify=${encodeURIComponent(token)}`
    await transport.sendMail({
      from: config.smtpFrom,
      to: normalizedEmail,
      subject: 'Verify your MilkSense AI account',
      text: `Hello ${String(name).trim()},\n\nVerify your email address to access your farm workspace:\n${verificationUrl}\n\nThis link expires in ${verificationHours} hours.`,
    })
    await client.query('COMMIT')
    response.status(201).json({ message: 'Account created. Check your email to verify your address before signing in.' })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') return response.status(409).json({ error: 'An account already exists for that email address.' })
    if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') return response.status(502).json({ error: 'The verification email could not be sent. Check SMTP configuration and try again.' })
    throw error
  } finally {
    client.release()
  }
}))

app.post('/api/auth/resend-verification', asyncRoute(async (request, response) => {
  const email = String(request.body?.email ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response.status(400).json({ error: 'Enter a valid email address.' })
  let transport
  try {
    transport = mailTransport()
  } catch (error) {
    return response.status(503).json({ error: error.message })
  }
  const token = createToken()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(
      'SELECT id, name FROM users WHERE email = $1 AND email_verified_at IS NULL',
      [email],
    )
    if (result.rowCount) {
      await client.query(
        `INSERT INTO email_verifications (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + ($3 * interval '1 hour'))
         ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at`,
        [result.rows[0].id, hashToken(token), verificationHours],
      )
      const verificationUrl = `${config.frontendUrl}/?verify=${encodeURIComponent(token)}`
      await transport.sendMail({
        from: config.smtpFrom,
        to: email,
        subject: 'Verify your MilkSense AI account',
        text: `Hello ${result.rows[0].name},\n\nVerify your email address to access your farm workspace:\n${verificationUrl}\n\nThis link expires in ${verificationHours} hours.`,
      })
    }
    await client.query('COMMIT')
    response.json({ message: 'If that email belongs to an unverified account, a new verification link has been sent.' })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}))

app.get('/api/auth/verify', asyncRoute(async (request, response) => {
  const token = String(request.query.token ?? '')
  if (!token || token.length > 200) return response.status(400).json({ error: 'A valid verification link is required.' })
  const result = await pool.query(
    `UPDATE users SET email_verified_at = now()
       WHERE id = (SELECT user_id FROM email_verifications WHERE token_hash = $1 AND expires_at > now())
       RETURNING id`,
    [hashToken(token)],
  )
  if (!result.rowCount) return response.status(400).json({ error: 'This verification link is invalid or has expired.' })
  await pool.query('DELETE FROM email_verifications WHERE user_id = $1', [result.rows[0].id])
  response.json({ message: 'Email verified. You can now sign in.' })
}))

app.post('/api/auth/login', asyncRoute(async (request, response) => {
  const email = String(request.body?.email ?? '').trim().toLowerCase()
  const password = request.body?.password
  if (!email || typeof password !== 'string') return response.status(400).json({ error: 'Email and password are required.' })
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.password_hash, f.name AS "farmName"
       FROM users u JOIN farms f ON f.id = u.farm_id WHERE u.email = $1`,
    [email],
  )
  const user = result.rows[0]
  if (!user || !(await verifyPassword(password, user.password_hash))) return response.status(401).json({ error: 'Email or password is incorrect.' })
  const verification = await pool.query('SELECT email_verified_at FROM users WHERE id = $1', [user.id])
  if (!verification.rows[0].email_verified_at) return response.status(403).json({ error: 'Verify your email address before signing in.' })
  const token = createToken()
  await pool.query(
    'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + ($3 * interval \'1 day\'))',
    [user.id, hashToken(token), sessionDays],
  )
  setSessionCookie(response, token)
  response.json({ user: toClientUser(user) })
}))

app.get('/api/auth/me', requireAuth, asyncRoute(async (request, response) => {
  const result = await pool.query(
    'SELECT u.id, u.name, u.email, f.name AS "farmName" FROM users u JOIN farms f ON f.id = u.farm_id WHERE u.id = $1',
    [request.user.id],
  )
  response.json({ user: toClientUser(result.rows[0]) })
}))

app.patch('/api/auth/profile', requireAuth, asyncRoute(async (request, response) => {
  const name = String(request.body?.name ?? '').trim()
  const farmName = String(request.body?.farmName ?? '').trim()
  if (!name || name.length > 120 || !farmName || farmName.length > 160) {
    return response.status(400).json({ error: 'Name and farm or organization are required.' })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('UPDATE users SET name = $1 WHERE id = $2', [name, request.user.id])
    await client.query('UPDATE farms SET name = $1 WHERE id = $2', [farmName, request.user.farmId])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  response.json({ user: { ...request.user, name, farmName } })
}))

app.post('/api/auth/logout', requireAuth, asyncRoute(async (request, response) => {
  const token = readCookie(request, sessionCookie)
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])
  response.clearCookie(sessionCookie, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' })
  response.status(204).end()
}))

const observationColumns = [
  'farm_id', 'cow_id', 'cow_name', 'breed', 'recorded_at',
  'dim', 'dmy', 'mf', 'fc', 'pc', 'mt', 'rt', 'tmax', 'tmin', 'rhmax', 'rhmin', 'vp', 'vpd', 'thi_max', 'thi_min',
]
const insertObservation = `INSERT INTO observations (${observationColumns.join(', ')})
  VALUES (${observationColumns.map((_, index) => `$${index + 1}`).join(', ')})
  ON CONFLICT (farm_id, cow_id, recorded_at) DO UPDATE SET
    cow_name = EXCLUDED.cow_name, breed = EXCLUDED.breed,
    dim = EXCLUDED.dim, dmy = EXCLUDED.dmy, mf = EXCLUDED.mf, fc = EXCLUDED.fc, pc = EXCLUDED.pc,
    mt = EXCLUDED.mt, rt = EXCLUDED.rt, tmax = EXCLUDED.tmax, tmin = EXCLUDED.tmin,
    rhmax = EXCLUDED.rhmax, rhmin = EXCLUDED.rhmin, vp = EXCLUDED.vp, vpd = EXCLUDED.vpd,
    thi_max = EXCLUDED.thi_max, thi_min = EXCLUDED.thi_min, created_at = now()`

app.post('/api/data/import', requireAuth, asyncRoute(async (request, response) => {
  let observations = request.body?.observations
  try {
    if (typeof request.body?.csv === 'string') observations = parseCsv(request.body.csv)
  } catch (error) {
    return response.status(400).json({ error: error.message })
  }
  if (!Array.isArray(observations) || observations.length === 0 || observations.length > 5000) {
    return response.status(400).json({ error: 'Provide between 1 and 5,000 historical observations.' })
  }
  let normalized
  try {
    normalized = observations.map(normalizeObservation)
  } catch (error) {
    return response.status(400).json({ error: error.message })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const observation of normalized) {
      await client.query(insertObservation, observationValues({ ...observation, farmId: request.user.farmId }))
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  response.status(201).json({ imported: normalized.length, message: `${normalized.length} observation${normalized.length === 1 ? '' : 's'} saved.` })
}))

app.get('/api/data/summary', requireAuth, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `SELECT count(*)::integer AS observations, count(DISTINCT cow_id)::integer AS cows,
            min(recorded_at) AS "firstDate", max(recorded_at) AS "lastDate"
       FROM observations WHERE farm_id = $1`,
    [request.user.farmId],
  )
  response.json(result.rows[0])
}))

async function modelFresh(farmId) {
  const result = await pool.query(
    `SELECT mr.data_cutoff AS "dataCutoff", max(o.created_at) AS "latestObservationAt"
       FROM model_runs mr LEFT JOIN observations o ON o.farm_id = mr.farm_id
      WHERE mr.farm_id = $1 AND mr.status = 'completed'
      GROUP BY mr.id ORDER BY mr.started_at DESC LIMIT 1`,
    [farmId],
  )
  if (!result.rowCount) return false
  const { dataCutoff, latestObservationAt } = result.rows[0]
  return !latestObservationAt || (dataCutoff && new Date(latestObservationAt) <= new Date(dataCutoff))
}

app.get('/api/herd', requireAuth, asyncRoute(async (request, response) => {
  const freshModel = await modelFresh(request.user.farmId)
  const result = await pool.query(
    `SELECT DISTINCT ON (o.cow_id)
       o.cow_id AS id, COALESCE(o.cow_name, 'Cow ' || o.cow_id) AS name, COALESCE(o.breed, 'Unknown') AS breed,
       o.recorded_at AS "recordedAt", o.dim, o.dmy, o.mf, o.fc AS fat, o.pc AS protein,
       o.mt, o.rt, o.tmax, o.tmin, o.rhmax, o.rhmin, o.thi_max AS "thiMax", o.thi_min AS "thiMin",
       p.dmy AS "predictedDmy", p.mf AS "predictedMf", p.fc AS "predictedFat", p.pc AS "predictedProtein",
       p.target_date AS "predictionDate"
     FROM observations o
     LEFT JOIN LATERAL (
       SELECT p.dmy, p.mf, p.fc, p.pc, p.target_date FROM predictions p
        WHERE p.farm_id = o.farm_id AND p.cow_id = o.cow_id AND p.target_date >= CURRENT_DATE AND $2::boolean
        ORDER BY p.target_date LIMIT 1
     ) p ON true
     WHERE o.farm_id = $1
     ORDER BY o.cow_id, o.recorded_at DESC`,
    [request.user.farmId, freshModel],
  )
  const cows = result.rows.map((cow) => {
    const currentDmy = Number(cow.dmy)
    const predictedDmy = cow.predictedDmy === null ? null : Number(cow.predictedDmy)
    const change = predictedDmy === null || !currentDmy ? null : ((predictedDmy - currentDmy) / currentDmy) * 100
    const status = Number(cow.thiMax) >= alertThiThreshold ? 'Alert' : change !== null && change <= -20 ? 'Watch' : 'Healthy'
    return {
      ...cow,
      id: String(cow.id),
      dim: Number(cow.dim),
      dmy: currentDmy,
      mf: Number(cow.mf),
      fat: Number(cow.fat),
      protein: Number(cow.protein),
      thi: cow.thiMax === null ? null : Number(cow.thiMax),
      forecast: predictedDmy,
      change,
      status,
    }
  })
  response.json({ cows, total: cows.length })
}))

app.get('/api/observations', requireAuth, asyncRoute(async (request, response) => {
  const days = Math.min(365, Math.max(1, Number(request.query.days ?? 28)))
  const cowId = request.query.cowId ? String(request.query.cowId) : null
  const result = await pool.query(
    `SELECT cow_id AS "cowId", recorded_at AS date, dmy, mf, fc, pc, dim,
            tmax, tmin, rhmax, rhmin, thi_max AS "thiMax", thi_min AS "thiMin"
       FROM observations
      WHERE farm_id = $1 AND recorded_at >= CURRENT_DATE - ($2 * interval '1 day')
        AND ($3::text IS NULL OR cow_id = $3)
      ORDER BY recorded_at, cow_id`,
    [request.user.farmId, days, cowId],
  )
  response.json({ observations: result.rows })
}))

app.get('/api/predictions', requireAuth, asyncRoute(async (request, response) => {
  if (!(await modelFresh(request.user.farmId))) return response.json({ predictions: [] })
  const cowId = request.query.cowId ? String(request.query.cowId) : null
  const result = await pool.query(
    `SELECT cow_id AS "cowId", target_date AS date, dmy, mf, fc, pc, generated_at AS "generatedAt"
       FROM predictions WHERE farm_id = $1 AND target_date >= CURRENT_DATE AND target_date < CURRENT_DATE + interval '28 days'
        AND ($2::text IS NULL OR cow_id = $2)
      ORDER BY target_date, cow_id`,
    [request.user.farmId, cowId],
  )
  response.json({ predictions: result.rows })
}))

app.get('/api/models/status', requireAuth, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `SELECT id, status, metrics, feature_importance AS "featureImportance", error, started_at AS "startedAt", completed_at AS "completedAt"
       FROM model_runs WHERE farm_id = $1 ORDER BY started_at DESC LIMIT 1`,
    [request.user.farmId],
  )
  response.json({
    model: result.rows[0] ? { ...result.rows[0], stale: result.rows[0].status === 'completed' && !(await modelFresh(request.user.farmId)) } : null,
  })
}))

function runMlEngine(payload) {
  return new Promise((resolvePromise, rejectPromise) => {
    const python = process.env.PYTHON_EXECUTABLE ?? 'python'
    const modelDirectory = resolve(root, process.env.MODEL_DIR ?? 'server/models')
    const child = spawn(python, [resolve(root, 'ml/engine.py')], {
      cwd: root,
      env: { ...process.env, MILKSENSE_MODEL_DIR: modelDirectory },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      stdout += chunk
      if (stdout.length > 30_000_000) child.kill()
    })
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', rejectPromise)
    child.stdin.on('error', rejectPromise)
    child.on('close', (code) => {
      if (code !== 0) return rejectPromise(new Error(stderr.slice(-2000) || `ML engine exited with code ${code}.`))
      try {
        resolvePromise(JSON.parse(stdout))
      } catch {
        rejectPromise(new Error('ML engine returned an invalid response.'))
      }
    })
    child.stdin.end(JSON.stringify(payload))
  })
}

app.post('/api/models/train', requireAuth, asyncRoute(async (request, response) => {
  const running = await pool.query(
    "SELECT id FROM model_runs WHERE farm_id = $1 AND status = 'training' LIMIT 1",
    [request.user.farmId],
  )
  if (running.rowCount) return response.status(409).json({ error: 'Model training is already running.' })
  const observations = await pool.query(
    `SELECT cow_id AS "cowId", recorded_at AS date, dim, dmy, mf, fc, pc, mt, rt, created_at AS "createdAt",
            tmax, tmin, rhmax, rhmin, vp, vpd, thi_max AS "thiMax", thi_min AS "thiMin"
       FROM observations WHERE farm_id = $1 ORDER BY recorded_at, cow_id`,
    [request.user.farmId],
  )
  if (observations.rowCount < 30) return response.status(400).json({ error: 'At least 30 dated RMS observations are required to train and validate the model.' })
  const dataCutoff = observations.rows.reduce((latest, row) => !latest || new Date(row.createdAt) > latest ? new Date(row.createdAt) : latest, null)
  let run
  try {
    run = await pool.query(
      "INSERT INTO model_runs (farm_id, status, data_cutoff) VALUES ($1, 'training', $2) RETURNING id",
      [request.user.farmId, dataCutoff],
    )
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'Model training is already running.' })
    throw error
  }
  const runId = run.rows[0].id
  const farmId = request.user.farmId
  response.status(202).json({ runId, status: 'training' })
  setImmediate(async () => {
    try {
      const trained = await runMlEngine({ action: 'train', runId, rows: observations.rows })
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('DELETE FROM predictions WHERE farm_id = $1', [farmId])
        for (const prediction of trained.forecasts) {
          await client.query(
            `INSERT INTO predictions (farm_id, model_run_id, cow_id, target_date, dmy, mf, fc, pc)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [farmId, runId, prediction.cowId, prediction.date, prediction.dmy, prediction.mf, prediction.fc, prediction.pc],
          )
        }
        await client.query(
          "UPDATE model_runs SET status = 'completed', metrics = $1, feature_importance = $2, completed_at = now() WHERE id = $3",
          [JSON.stringify(trained.metrics), JSON.stringify(trained.featureImportance), runId],
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    } catch (error) {
      console.error(`Model training failed for run ${runId}:`, error)
      await pool.query(
        "UPDATE model_runs SET status = 'failed', error = $1, completed_at = now() WHERE id = $2",
        [String(error.message).slice(0, 1000), runId],
      )
    }
  })
}))

async function getAlerts(farmId) {
  const freshModel = await modelFresh(farmId)
  const result = await pool.query(
    `SELECT DISTINCT ON (o.cow_id)
       o.cow_id AS "cowId", COALESCE(o.cow_name, 'Cow ' || o.cow_id) AS name,
       o.dmy, o.thi_max AS "thiMax", o.recorded_at AS "recordedAt",
       p.dmy AS "predictedDmy", p.target_date AS "predictionDate",
       mr.metrics
     FROM observations o
     LEFT JOIN LATERAL (
       SELECT dmy, target_date, model_run_id FROM predictions
        WHERE farm_id = o.farm_id AND cow_id = o.cow_id AND target_date >= CURRENT_DATE AND $2::boolean
        ORDER BY target_date LIMIT 1
     ) p ON true
     LEFT JOIN model_runs mr ON mr.id = p.model_run_id
     WHERE o.farm_id = $1
     ORDER BY o.cow_id, o.recorded_at DESC`,
    [farmId, freshModel],
  )
  return result.rows.flatMap((cow) => {
    const alerts = []
    if (Number(cow.thiMax) >= alertThiThreshold) {
      alerts.push({ cowId: cow.cowId, name: cow.name, kind: 'heat-stress', priority: 'high', thi: Number(cow.thiMax), message: `THI ${Number(cow.thiMax).toFixed(1)} — review environmental conditions.` })
    }
    if (cow.predictedDmy !== null && cow.metrics?.DMY) {
      const deviation = Math.abs(Number(cow.predictedDmy) - Number(cow.dmy))
      const threshold = Math.max(Number(cow.metrics.DMY.mae) * 2, 0)
      if (deviation > threshold) {
        alerts.push({ cowId: cow.cowId, name: cow.name, kind: 'performance-deviation', priority: 'review', message: `Predicted daily yield differs from the latest observation by ${deviation.toFixed(1)} kg.` })
      }
    }
    return alerts
  })
}

app.get('/api/alerts', requireAuth, asyncRoute(async (request, response) => {
  response.json({ alerts: await getAlerts(request.user.farmId) })
}))

app.post('/api/alerts/notify', requireAuth, asyncRoute(async (request, response) => {
  const alerts = await getAlerts(request.user.farmId)
  if (!alerts.length) return response.json({ message: 'There are no active alerts to send.' })
  const user = await pool.query('SELECT email, name FROM users WHERE id = $1', [request.user.id])
  const transport = mailTransport()
  await transport.sendMail({
    from: config.smtpFrom,
    to: user.rows[0].email,
    subject: `MilkSense AI: ${alerts.length} herd alert${alerts.length === 1 ? '' : 's'}`,
    text: `Hello ${user.rows[0].name},\n\n${alerts.map((alert) => `Cow ${alert.cowId} (${alert.name}): ${alert.message}`).join('\n')}\n`,
  })
  response.json({ message: `Sent ${alerts.length} alert${alerts.length === 1 ? '' : 's'} to your verified email address.` })
}))

function csvEscape(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

app.get('/api/reports/export', requireAuth, asyncRoute(async (request, response) => {
  const freshModel = await modelFresh(request.user.farmId)
  const result = await pool.query(
    `SELECT DISTINCT ON (o.cow_id)
       o.cow_id, COALESCE(o.cow_name, 'Cow ' || o.cow_id) AS cow_name, o.recorded_at, o.dim, o.dmy, o.mf, o.fc, o.pc, o.thi_max,
       p.dmy AS forecast_dmy, p.mf AS forecast_mf, p.fc AS forecast_fc, p.pc AS forecast_pc
     FROM observations o LEFT JOIN LATERAL (
       SELECT dmy, mf, fc, pc FROM predictions WHERE farm_id = o.farm_id AND cow_id = o.cow_id
        AND target_date >= CURRENT_DATE AND $2::boolean ORDER BY target_date LIMIT 1
     ) p ON true
     WHERE o.farm_id = $1 ORDER BY o.cow_id, o.recorded_at DESC`,
    [request.user.farmId, freshModel],
  )
  const headers = ['cow_id', 'name', 'observation_date', 'dim', 'daily_milk_yield_kg', 'milking_frequency_per_day', 'fat_percent', 'protein_percent', 'thi_max', 'predicted_dmy_kg', 'predicted_mf', 'predicted_fat_percent', 'predicted_protein_percent']
  const lines = result.rows.map((row) => [row.cow_id, row.cow_name, row.recorded_at?.toISOString?.().slice(0, 10) ?? row.recorded_at, row.dim, row.dmy, row.mf, row.fc, row.pc, row.thi_max, row.forecast_dmy, row.forecast_mf, row.forecast_fc, row.forecast_pc])
  response.type('text/csv')
  response.setHeader('Content-Disposition', 'attachment; filename="milksense-herd-report.csv"')
  response.send([headers, ...lines].map((line) => line.map(csvEscape).join(',')).join('\r\n'))
}))

app.get('/api/reports/metrics', requireAuth, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `SELECT id, status, metrics, started_at AS "startedAt", completed_at AS "completedAt"
       FROM model_runs WHERE farm_id = $1 ORDER BY started_at DESC LIMIT 20`,
    [request.user.farmId],
  )
  response.json({ runs: result.rows })
}))

app.use('/api', (_request, response) => response.status(404).json({ error: 'API route not found.' }))

app.use((error, _request, response, _next) => {
  console.error(error)
  if (response.headersSent) return
  if (error.type === 'entity.too.large') return response.status(413).json({ error: 'Request is too large. Import no more than 5,000 records at a time.' })
  if (error instanceof SyntaxError && Object.hasOwn(error, 'body')) return response.status(400).json({ error: 'Request body must contain valid JSON.' })
  response.status(500).json({ error: 'The request could not be completed.' })
})

async function start() {
  const schema = await readFile(resolve(root, 'server/schema.sql'), 'utf8')
  await pool.query(schema)
  await pool.query('DELETE FROM sessions WHERE expires_at <= now()')
  const server = createServer(app)
  server.listen(port, () => console.log(`MilkSense API listening on http://localhost:${port}`))
  const shutdown = async () => {
    server.close(async () => {
      await pool.end()
      process.exit(0)
    })
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

start().catch((error) => {
  console.error('Could not start MilkSense API:', error)
  process.exit(1)
})
