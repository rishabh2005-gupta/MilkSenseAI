# MilkSense AI

MilkSense AI is a React dashboard backed by a Node.js REST API, PostgreSQL, and a Python XGBoost training engine.

## Local setup

1. Create a PostgreSQL database and copy `.env.example` to `.env`.
2. Set `DATABASE_URL`, a random `SESSION_SECRET` of at least 32 characters, and SMTP settings. Email verification is required before sign-in.
3. Install JavaScript dependencies with `npm install`.
4. Install the model dependencies with `python -m pip install -r ml/requirements.txt`.
5. Start the API with `npm run server` and the dashboard with `npm run dev`.

The API applies `server/schema.sql` when it starts. Vite proxies `/api` requests to `http://localhost:3001`.

## Historical data and models

Upload a CSV with one dated record per cow. Required columns are `date`, `cow_id`, `DIM`, `DMY`, `MF`, `FC`, and `PC`. Optional columns are `MT`, `RT`, `Tmax`, `Tmin`, `RHmax`, `RHmin`, `VP`, `VPD`, `THImax`, and `THImin`. When temperature and relative humidity are present, THI is calculated during ingestion. Repeated cow/date rows update that observation.

At least 30 observations are required to start training; training additionally requires consecutive daily observations for each target. The engine clips statistical outliers, imputes missing feature values, normalizes model inputs, engineers day-of-year and rolling-average features, trains four XGBoost regressors, and evaluates them with time-series cross-validation. Accuracy and R² are measured from held-out predictions. The report's >80% accuracy and R² >0.90 are targets, not guaranteed results; metrics below target are shown as such.

Predictions are hidden when the model has not completed training or has become stale after new observations are imported. Retrain to refresh them.

Run `npm test` for API data-processing tests and `npm run test:ml` for Python feature-engineering and model tests.

## Backups and deployment

Run `npm run backup` to create a custom-format PostgreSQL dump. Schedule this command with the host's scheduler and point `BACKUP_DIR` at persistent cloud-backed storage to satisfy the regular backup requirement. Keep model files in persistent storage by setting `MODEL_DIR`.

In hosted deployments, terminate HTTPS at the hosting platform or trusted reverse proxy, set `NODE_ENV=production` and `TRUST_PROXY=true` when appropriate, and configure SMTP, PostgreSQL SSL, persistent model storage, and a cloud-backed backup schedule. The application does not include credentials or a provider-specific deployment configuration.
