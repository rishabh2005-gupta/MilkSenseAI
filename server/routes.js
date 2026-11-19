import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import nodemailer from 'nodemailer'
import { createToken, hashPassword, hashToken, smtpConfigured, verifyPassword } from './auth.js'
import { normalizeObservation, observationValues, parseCsv } from './data.js'
import { insertObservation, queries } from './queries.js'

export function registerApiRoutes(app, { pool, config, root }) {
const sessionCookie = 'milksense_session'
const sessionDays = 7
const verificationHours = 24
const alertThiThreshold = 78
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
    queries.requireAuth,
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
  await pool.query(queries.health)
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
    await client.query(queries.begin)
    const farm = await client.query(queries.insertFarm, [String(farmName).trim()])
    const user = await client.query(
      queries.insertUser,
      [farm.rows[0].id, String(name).trim(), normalizedEmail, passwordHash],
    )
    await client.query(
      queries.insertEmailVerification,
      [user.rows[0].id, hashToken(token), verificationHours],
    )
    const verificationUrl = `${config.frontendUrl}/?verify=${encodeURIComponent(token)}`
    await transport.sendMail({
      from: config.smtpFrom,
      to: normalizedEmail,
      subject: 'Verify your MilkSense AI account',
      text: `Hello ${String(name).trim()},\n\nVerify your email address to access your farm workspace:\n${verificationUrl}\n\nThis link expires in ${verificationHours} hours.`,
    })
    await client.query(queries.commit)
    response.status(201).json({ message: 'Account created. Check your email to verify your address before signing in.' })
  } catch (error) {
    await client.query(queries.rollback)
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
    await client.query(queries.begin)
    const result = await client.query(
      queries.findUnverifiedUserByEmail,
      [email],
    )
    if (result.rowCount) {
      await client.query(
        queries.upsertEmailVerification,
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
    await client.query(queries.commit)
    response.json({ message: 'If that email belongs to an unverified account, a new verification link has been sent.' })
  } catch (error) {
    await client.query(queries.rollback)
    throw error
  } finally {
    client.release()
  }
}))

app.get('/api/auth/verify', asyncRoute(async (request, response) => {
  const token = String(request.query.token ?? '')
  if (!token || token.length > 200) return response.status(400).json({ error: 'A valid verification link is required.' })
  const result = await pool.query(
    queries.verifyUser,
    [hashToken(token)],
  )
  if (!result.rowCount) return response.status(400).json({ error: 'This verification link is invalid or has expired.' })
  await pool.query(queries.deleteEmailVerification, [result.rows[0].id])
  response.json({ message: 'Email verified. You can now sign in.' })
}))

app.post('/api/auth/login', asyncRoute(async (request, response) => {
  const email = String(request.body?.email ?? '').trim().toLowerCase()
  const password = request.body?.password
  if (!email || typeof password !== 'string') return response.status(400).json({ error: 'Email and password are required.' })
  const result = await pool.query(
    queries.findLoginUser,
    [email],
  )
  const user = result.rows[0]
  if (!user || !(await verifyPassword(password, user.password_hash))) return response.status(401).json({ error: 'Email or password is incorrect.' })
  const verification = await pool.query(queries.findVerificationStatus, [user.id])
  if (!verification.rows[0].email_verified_at) return response.status(403).json({ error: 'Verify your email address before signing in.' })
  const token = createToken()
  await pool.query(
    queries.insertSession,
    [user.id, hashToken(token), sessionDays],
  )
  setSessionCookie(response, token)
  response.json({ user: toClientUser(user) })
}))

app.get('/api/auth/me', requireAuth, asyncRoute(async (request, response) => {
  const result = await pool.query(
    queries.findAuthenticatedUser,
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
    await client.query(queries.begin)
    await client.query(queries.updateUserName, [name, request.user.id])
    await client.query(queries.updateFarmName, [farmName, request.user.farmId])
    await client.query(queries.commit)
  } catch (error) {
    await client.query(queries.rollback)
    throw error
  } finally {
    client.release()
  }
  response.json({ user: { ...request.user, name, farmName } })
}))

app.post('/api/auth/logout', requireAuth, asyncRoute(async (request, response) => {
  const token = readCookie(request, sessionCookie)
  await pool.query(queries.deleteSession, [hashToken(token)])
  response.clearCookie(sessionCookie, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' })
  response.status(204).end()
}))

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
    await client.query(queries.begin)
    for (const observation of normalized) {
      await client.query(insertObservation, observationValues({ ...observation, farmId: request.user.farmId }))
    }
    await client.query(queries.commit)
  } catch (error) {
    await client.query(queries.rollback)
    throw error
  } finally {
    client.release()
  }
  response.status(201).json({ imported: normalized.length, message: `${normalized.length} observation${normalized.length === 1 ? '' : 's'} saved.` })
}))

app.get('/api/data/summary', requireAuth, asyncRoute(async (request, response) => {
  const result = await pool.query(
    queries.observationSummary,
    [request.user.farmId],
  )
  response.json(result.rows[0])
}))

async function modelFresh(farmId) {
  const result = await pool.query(
    queries.modelFresh,
    [farmId],
  )
  if (!result.rowCount) return false
  const { dataCutoff, latestObservationAt } = result.rows[0]
  return !latestObservationAt || (dataCutoff && new Date(latestObservationAt) <= new Date(dataCutoff))
}

app.get('/api/herd', requireAuth, asyncRoute(async (request, response) => {
  const freshModel = await modelFresh(request.user.farmId)
  const result = await pool.query(
    queries.herd,
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
    queries.observations,
    [request.user.farmId, days, cowId],
  )
  response.json({ observations: result.rows })
}))

app.get('/api/predictions', requireAuth, asyncRoute(async (request, response) => {
  if (!(await modelFresh(request.user.farmId))) return response.json({ predictions: [] })
  const cowId = request.query.cowId ? String(request.query.cowId) : null
  const result = await pool.query(
    queries.predictions,
    [request.user.farmId, cowId],
  )
  response.json({ predictions: result.rows })
}))

app.get('/api/models/status', requireAuth, asyncRoute(async (request, response) => {
  const result = await pool.query(
    queries.modelStatus,
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
    queries.findRunningTraining,
    [request.user.farmId],
  )
  if (running.rowCount) return response.status(409).json({ error: 'Model training is already running.' })
  const observations = await pool.query(
    queries.trainingObservations,
    [request.user.farmId],
  )
  if (observations.rowCount < 30) return response.status(400).json({ error: 'At least 30 dated RMS observations are required to train and validate the model.' })
  const dataCutoff = observations.rows.reduce((latest, row) => !latest || new Date(row.createdAt) > latest ? new Date(row.createdAt) : latest, null)
  let run
  try {
    run = await pool.query(
      queries.insertModelRun,
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
        await client.query(queries.begin)
        await client.query(queries.deletePredictions, [farmId])
        for (const prediction of trained.forecasts) {
          await client.query(
            queries.insertPrediction,
            [farmId, runId, prediction.cowId, prediction.date, prediction.dmy, prediction.mf, prediction.fc, prediction.pc],
          )
        }
        await client.query(
          queries.completeModelRun,
          [JSON.stringify(trained.metrics), JSON.stringify(trained.featureImportance), runId],
        )
        await client.query(queries.commit)
      } catch (error) {
        await client.query(queries.rollback)
        throw error
      } finally {
        client.release()
      }
    } catch (error) {
      console.error(`Model training failed for run ${runId}:`, error)
      await pool.query(
        queries.failModelRun,
        [String(error.message).slice(0, 1000), runId],
      )
    }
  })
}))

async function getAlerts(farmId) {
  const freshModel = await modelFresh(farmId)
  const result = await pool.query(
    queries.alerts,
    [farmId, freshModel],
  )
  return result.rows.flatMap((cow) => {
    const alerts = []
    if (Number(cow.thiMax) >= alertThiThreshold) {
      alerts.push({ cowId: cow.cowId, name: cow.name, kind: 'heat-stress', priority: 'high', thi: Number(cow.thiMax), message: `THI ${Number(cow.thiMax).toFixed(1)} â€” review environmental conditions.` })
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
  const user = await pool.query(queries.findAlertRecipient, [request.user.id])
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
    queries.reportExport,
    [request.user.farmId, freshModel],
  )
  const headers = ['cow_id', 'name', 'observation_date', 'dim', 'daily_milk_yield_kg', 'milking_frequency_per_day', 'fat_percent', 'protein_percent', 'thi_max', 'prediction_date', 'predicted_dmy_kg', 'predicted_mf', 'predicted_fat_percent', 'predicted_protein_percent']
  const lines = result.rows.map((row) => [
    row.cow_id, row.cow_name, row.recorded_at?.toISOString?.().slice(0, 10) ?? row.recorded_at,
    row.dim, row.dmy, row.mf, row.fc, row.pc, row.thi_max,
    row.prediction_date?.toISOString?.().slice(0, 10) ?? row.prediction_date,
    row.forecast_dmy, row.forecast_mf, row.forecast_fc, row.forecast_pc,
  ])
  response.type('text/csv')
  response.setHeader('Content-Disposition', 'attachment; filename="milksense-herd-report.csv"')
  response.send([headers, ...lines].map((line) => line.map(csvEscape).join(',')).join('\r\n'))
}))

app.get('/api/reports/metrics', requireAuth, asyncRoute(async (request, response) => {
  const result = await pool.query(
    queries.reportMetrics,
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

}
