# MilkSense AI

MilkSense AI is a React dashboard backed by a Node.js REST API, PostgreSQL, and a Python XGBoost training engine.

## Local setup

1. Create a PostgreSQL database and copy `.env.example` to `.env`.
2. Set `DATABASE_URL`, a random `SESSION_SECRET` of at least 32 characters, and SMTP settings. Email verification is required before sign-in.
3. Install JavaScript dependencies with `npm install`.
4. Install the model dependencies into the Python environment used by the API with `python -m pip install -r ml/requirements.txt`. Set `PYTHON_EXECUTABLE` in `.env` to that interpreter if `python` does not select it.
5. Start the API with `npm run server` and the dashboard with `npm run dev`.

The API applies `server/schema.sql` when it starts. Vite proxies `/api` requests to `http://localhost:3001`.

## Using the dashboard

1. Create an account with your name, email, farm or organization, and a password of at least 12 characters. Verify the email using the link sent by the configured SMTP service, then sign in. Use the profile control to update your name or farm name, and **Sign out** to end the session.
2. In **Data & models**, upload a CSV exported from your robotic milking, RFID, or weather data source. Each row is one cow on one date. There is no provider-specific sensor or weather API connector in this project.
3. In **Herd** or **Overview**, search by cow ID or name, set a DIM range, and filter by herd status or prediction availability. Select a cow to view its record and model context.
4. After importing enough history, choose **Train / revalidate model** on **Data & models**. Review the four target metrics and feature-importance values before using forecasts. Open **Predictions** to compare historical and forecast trends for DMY, MF, fat, or protein over 7, 14, or 28 days.
5. Review **Alerts** for elevated THI or predicted yield deviations. **Email alert digest** sends active alerts to the signed-in, verified email address.
6. Open **Reports** and choose **Export CSV report** to download each cow's latest recorded measurements and the available daily predictions, including their forecast dates, across the 28-day horizon.

## Historical data and models

Upload a CSV with one dated record per cow. Required columns are `date`, `cow_id`, `DIM`, `DMY`, `MF`, `FC`, and `PC`. Optional columns are `MT`, `RT`, `Tmax`, `Tmin`, `RHmax`, `RHmin`, `VP`, `VPD`, `THImax`, and `THImin`. When temperature and relative humidity are present, THI is calculated during ingestion. Repeated cow/date rows update that observation.

At least 30 observations are required to start training; training additionally requires consecutive daily observations for each target. The engine clips statistical outliers, imputes missing feature values, normalizes model inputs, engineers day-of-year and rolling-average features, trains four XGBoost regressors, and evaluates them with time-series cross-validation. Accuracy and R² are measured from held-out predictions. The report's >80% accuracy and R² >0.90 are targets, not guaranteed results; metrics below target are shown as such.

Predictions are hidden when the model has not completed training or has become stale after new observations are imported. Retrain to refresh them.

## Synthetic presentation and testing data

The repository includes `data/demo-observations.csv`: 480 synthetic observations for eight cows over 60 consecutive days. The generator and CSV import share the observation schema in `shared/observation-schema.js`.

- Regenerate the CSV with `node scripts/generate-demo-data.js`. Pass a different output path as the first argument if needed.
- To load the same demo records directly into an existing account's farm, run `node server/seed-demo-data.js <existing-account-email>` with the API's `.env` database settings configured. The script updates matching farm/cow/date records and does not create an account.
- Alternatively, import the CSV through **Data & models**. Do not mix the demo records with real production measurements.

Run `npm test` for API data-processing tests and `npm run test:ml` for Python feature-engineering and model tests.

## Backups and deployment

Run `npm run backup` to create a custom-format PostgreSQL dump. Schedule this command with the host's scheduler and point `BACKUP_DIR` at persistent cloud-backed storage to satisfy the regular backup requirement. Keep model files in persistent storage by setting `MODEL_DIR`.

In hosted deployments, terminate HTTPS at the hosting platform or trusted reverse proxy, set `NODE_ENV=production` and `TRUST_PROXY=true` when appropriate, and configure SMTP, PostgreSQL SSL, persistent model storage, and a cloud-backed backup schedule. The application does not include credentials or a provider-specific deployment configuration.

## Project estimate

The accompanying project-estimation report gives an approximate size of 6,000 LOC, 15.8 person-months of effort, and a 7.1-month full-scale schedule (about 3 months for the academic prototype). It estimates peak implementation staffing at 3–4 people and a total project cost of approximately ₹2,65,000–₹2,71,000 including one-time hardware. These are planning estimates, not measured project totals or runtime guarantees.
