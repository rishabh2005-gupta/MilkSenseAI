CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS farms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_verifications (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  cow_id text NOT NULL,
  cow_name text,
  breed text,
  recorded_at date NOT NULL,
  dim numeric,
  dmy numeric,
  mf numeric,
  fc numeric,
  pc numeric,
  mt numeric,
  rt numeric,
  tmax numeric,
  tmin numeric,
  rhmax numeric,
  rhmin numeric,
  vp numeric,
  vpd numeric,
  thi_max numeric,
  thi_min numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (farm_id, cow_id, recorded_at)
);
CREATE INDEX IF NOT EXISTS observations_farm_date_idx ON observations(farm_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS observations_farm_cow_date_idx ON observations(farm_id, cow_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS observations_farm_created_idx ON observations(farm_id, created_at DESC);

CREATE TABLE IF NOT EXISTS model_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('training', 'completed', 'failed')),
  metrics jsonb,
  feature_importance jsonb,
  error text,
  data_cutoff timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE model_runs ADD COLUMN IF NOT EXISTS data_cutoff timestamptz;
CREATE INDEX IF NOT EXISTS model_runs_farm_started_idx ON model_runs(farm_id, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS model_runs_one_training_per_farm_idx
  ON model_runs(farm_id) WHERE status = 'training';

CREATE TABLE IF NOT EXISTS predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  model_run_id uuid NOT NULL REFERENCES model_runs(id) ON DELETE CASCADE,
  cow_id text NOT NULL,
  target_date date NOT NULL,
  dmy numeric,
  mf numeric,
  fc numeric,
  pc numeric,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (farm_id, model_run_id, cow_id, target_date)
);
CREATE INDEX IF NOT EXISTS predictions_farm_cow_date_idx ON predictions(farm_id, cow_id, target_date);
