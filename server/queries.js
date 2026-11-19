import { observationSchema } from '../shared/observation-schema.js'

export const queries = {
  requireAuth: `SELECT u.id, u.farm_id AS "farmId", u.name, u.email
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > now() AND u.email_verified_at IS NOT NULL`,
  cleanupExpiredSessions: 'DELETE FROM sessions WHERE expires_at <= now()',
  health: 'SELECT 1',
  begin: 'BEGIN',
  commit: 'COMMIT',
  rollback: 'ROLLBACK',
  insertFarm: 'INSERT INTO farms (name) VALUES ($1) RETURNING id',
  insertUser: 'INSERT INTO users (farm_id, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, email',
  insertEmailVerification:
    "INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES ($1, $2, now() + ($3 * interval '1 hour'))",
  findUnverifiedUserByEmail:
    'SELECT id, name FROM users WHERE email = $1 AND email_verified_at IS NULL',
  upsertEmailVerification: `INSERT INTO email_verifications (user_id, token_hash, expires_at)
    VALUES ($1, $2, now() + ($3 * interval '1 hour'))
    ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at`,
  verifyUser: `UPDATE users SET email_verified_at = now()
    WHERE id = (SELECT user_id FROM email_verifications WHERE token_hash = $1 AND expires_at > now())
    RETURNING id`,
  deleteEmailVerification: 'DELETE FROM email_verifications WHERE user_id = $1',
  findLoginUser: `SELECT u.id, u.name, u.email, u.password_hash, f.name AS "farmName"
    FROM users u JOIN farms f ON f.id = u.farm_id WHERE u.email = $1`,
  findVerificationStatus: 'SELECT email_verified_at FROM users WHERE id = $1',
  insertSession:
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + ($3 * interval '1 day'))",
  findAuthenticatedUser:
    `SELECT u.id, u.name, u.email, f.name AS "farmName"
       FROM users u JOIN farms f ON f.id = u.farm_id WHERE u.id = $1`,
  updateUserName: 'UPDATE users SET name = $1 WHERE id = $2',
  updateFarmName: 'UPDATE farms SET name = $1 WHERE id = $2',
  deleteSession: 'DELETE FROM sessions WHERE token_hash = $1',
  observationSummary: `SELECT count(*)::integer AS observations, count(DISTINCT cow_id)::integer AS cows,
    min(recorded_at) AS "firstDate", max(recorded_at) AS "lastDate"
    FROM observations WHERE farm_id = $1`,
  modelFresh: `SELECT mr.data_cutoff AS "dataCutoff", max(o.created_at) AS "latestObservationAt"
    FROM model_runs mr LEFT JOIN observations o ON o.farm_id = mr.farm_id
    WHERE mr.farm_id = $1 AND mr.status = 'completed'
    GROUP BY mr.id ORDER BY mr.started_at DESC LIMIT 1`,
  herd: `SELECT DISTINCT ON (o.cow_id)
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
  observations: `SELECT cow_id AS "cowId", recorded_at AS date, dmy, mf, fc, pc, dim,
    tmax, tmin, rhmax, rhmin, thi_max AS "thiMax", thi_min AS "thiMin"
    FROM observations
    WHERE farm_id = $1 AND recorded_at >= CURRENT_DATE - ($2 * interval '1 day')
      AND ($3::text IS NULL OR cow_id = $3)
    ORDER BY recorded_at, cow_id`,
  predictions: `SELECT cow_id AS "cowId", target_date AS date, dmy, mf, fc, pc, generated_at AS "generatedAt"
    FROM predictions WHERE farm_id = $1 AND target_date >= CURRENT_DATE AND target_date <= CURRENT_DATE + interval '28 days'
      AND ($2::text IS NULL OR cow_id = $2)
    ORDER BY target_date, cow_id`,
  modelStatus: `SELECT id, status, metrics, feature_importance AS "featureImportance", error, started_at AS "startedAt", completed_at AS "completedAt"
    FROM model_runs WHERE farm_id = $1 ORDER BY started_at DESC LIMIT 1`,
  findRunningTraining:
    "SELECT id FROM model_runs WHERE farm_id = $1 AND status = 'training' LIMIT 1",
  trainingObservations: `SELECT cow_id AS "cowId", recorded_at AS date, dim, dmy, mf, fc, pc, mt, rt, created_at AS "createdAt",
    tmax, tmin, rhmax, rhmin, vp, vpd, thi_max AS "thiMax", thi_min AS "thiMin"
    FROM observations WHERE farm_id = $1 ORDER BY recorded_at, cow_id`,
  insertModelRun:
    "INSERT INTO model_runs (farm_id, status, data_cutoff) VALUES ($1, 'training', $2) RETURNING id",
  deletePredictions: 'DELETE FROM predictions WHERE farm_id = $1',
  insertPrediction: `INSERT INTO predictions (farm_id, model_run_id, cow_id, target_date, dmy, mf, fc, pc)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
  completeModelRun:
    "UPDATE model_runs SET status = 'completed', metrics = $1, feature_importance = $2, completed_at = now() WHERE id = $3",
  failModelRun:
    "UPDATE model_runs SET status = 'failed', error = $1, completed_at = now() WHERE id = $2",
  alerts: `SELECT DISTINCT ON (o.cow_id)
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
  findAlertRecipient: 'SELECT email, name FROM users WHERE id = $1',
  reportExport: `WITH latest_observations AS (
    SELECT DISTINCT ON (o.cow_id)
      o.farm_id, o.cow_id, COALESCE(o.cow_name, 'Cow ' || o.cow_id) AS cow_name,
      o.recorded_at, o.dim, o.dmy, o.mf, o.fc, o.pc, o.thi_max
    FROM observations o
    WHERE o.farm_id = $1
    ORDER BY o.cow_id, o.recorded_at DESC
  )
  SELECT o.cow_id, o.cow_name, o.recorded_at, o.dim, o.dmy, o.mf, o.fc, o.pc, o.thi_max,
    p.target_date AS prediction_date, p.dmy AS forecast_dmy, p.mf AS forecast_mf,
    p.fc AS forecast_fc, p.pc AS forecast_pc
  FROM latest_observations o
  LEFT JOIN predictions p ON p.farm_id = o.farm_id AND p.cow_id = o.cow_id
    AND p.target_date >= CURRENT_DATE
    AND p.target_date <= CURRENT_DATE + interval '28 days'
    AND $2::boolean
  ORDER BY o.cow_id, p.target_date`,
  reportMetrics: `SELECT id, status, metrics, started_at AS "startedAt", completed_at AS "completedAt"
    FROM model_runs WHERE farm_id = $1 ORDER BY started_at DESC LIMIT 20`,
}

const observationColumns = observationSchema.map((field) => field.databaseColumn)
const updateColumns = observationSchema
  .filter((field) => !['cowId', 'recordedAt'].includes(field.key))
  .map((field) => `${field.databaseColumn} = EXCLUDED.${field.databaseColumn}`)

export const insertObservation = `INSERT INTO observations (farm_id, ${observationColumns.join(', ')})
  VALUES (${observationColumns.map((_, index) => `$${index + 2}`).join(', ')})
  ON CONFLICT (farm_id, cow_id, recorded_at) DO UPDATE SET
  ${updateColumns.join(', ')}, created_at = now()`
