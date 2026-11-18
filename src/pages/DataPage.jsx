import { Icon } from "../components/Icon.jsx";
import { PageHeading } from "../components/DashboardComponents.jsx";
import {
  optionalCsvHeaders,
  requiredCsvHeaders,
} from "../../shared/observation-schema.js";



export function DataPage({ total, observations, model, training, onTrain, onImport }) {
  const requiredColumns = requiredCsvHeaders.join(", ");
  const optionalColumns = optionalCsvHeaders.join(", ");
  const importance = model?.featureImportance ?? {};
  const metricNames = {
    DMY: "Daily milk yield",
    MF: "Milking frequency",
    FC: "Fat content",
    PC: "Protein content",
  };
  return (
    <>
      <PageHeading
        eyebrow="FARM DATA & MODEL"
        title="Data & models"
        description="Import dated RMS and climate records, then train or revalidate the XGBoost model."
        actions={
          <button className="button button-primary" onClick={onImport}>
            <Icon name="upload" size={16} />
            Upload CSV
          </button>
        }
      />
      <div className="data-grid">
        <section className="panel import-panel">
          <div className="section-kicker">RMS & CLIMATE DATA</div>
          <h2>Import historical records</h2>
          <p>
            Upload dated records from robotic milking systems, RFID, and weather
            sources. Each row represents one cow on one date.
          </p>
          <button className="upload-dropzone" onClick={onImport}>
            <span className="upload-icon">
              <Icon name="upload" size={21} />
            </span>
            <strong>Choose a CSV file</strong>
            <span>Required: {requiredColumns}</span>
            <small>
              Optional: {optionalColumns}
            </small>
          </button>
          <div className="import-help">
            <strong>Column guide</strong>
            <span>
              <b>DMY</b> daily milk yield · <b>MF</b> milking frequency
            </span>
            <span>
              <b>FC / PC</b> fat / protein (%) · <b>DIM</b> days in milk
            </span>
            <span>
              Climate inputs calculate THImax / THImin when temperature and
              humidity are provided.
            </span>
          </div>
        </section>
        <div className="data-side">
          <section className="panel data-status-panel">
            <div className="panel-heading panel-heading-tight">
              <div>
                <div className="section-kicker">WORKSPACE DATA</div>
                <h2>Current dataset</h2>
              </div>
              <span
                className={`status ${total ? "status-healthy" : "status-watch"}`}
              >
                <span />
                {total ? "Connected" : "Empty"}
              </span>
            </div>
            <div className="dataset-count">
              <strong>{total}</strong>
              <span>cow records</span>
            </div>
            <div className="condition-row">
              <span>Observations</span>
              <strong>{observations}</strong>
            </div>
            <div className="condition-row">
              <span>Database</span>
              <strong>PostgreSQL</strong>
            </div>
            <div className="condition-row">
              <span>Model status</span>
              <strong>
                {model?.stale
                  ? "Retraining required"
                  : (model?.status ?? "Not trained")}
              </strong>
            </div>
            <button
              className="button button-primary train-button"
              disabled={
                training || model?.status === "training" || observations < 30
              }
              onClick={onTrain}
            >
              {training || model?.status === "training"
                ? "Training model…"
                : "Train / revalidate model"}
            </button>
            {observations < 30 && (
              <small className="training-hint">
                At least 30 dated observations are required to start.
              </small>
            )}
          </section>
        </div>
      </div>
      <section className="panel model-status-panel model-results">
        <span className="model-icon">
          <Icon name="chart" size={19} />
        </span>
        <div className="section-kicker">MODEL EVALUATION</div>
        <h2>XGBoost time-series validation</h2>
        {model?.error && (
          <p className="auth-error" role="alert">
            {model.error}
          </p>
        )}
        {model?.status === "completed" ? (
          <>
            <div className="model-metrics">
              {Object.entries(model.metrics ?? {}).map(([target, values]) => (
                <div key={target}>
                  <strong>{metricNames[target] ?? target}</strong>
                  <span>
                    Accuracy {Number(values.accuracyPercent).toFixed(1)}% · R²{" "}
                    {Number(values.r2).toFixed(3)} · MAE{" "}
                    {Number(values.mae).toFixed(2)}
                  </span>
                  <small>
                    {values.meetsTarget
                      ? "Meets >80% accuracy and R² >0.90 targets"
                      : "Does not meet the stated accuracy and R² targets"}
                    {model.stale
                      ? " · Results are stale after new data was imported"
                      : ""}
                  </small>
                </div>
              ))}
            </div>
            <div className="importance-grid">
              {Object.entries(importance).map(([target, items]) => (
                <div key={target}>
                  <strong>{metricNames[target] ?? target} drivers</strong>
                  {items.slice(0, 5).map((item) => (
                    <span key={item.feature}>
                      {item.feature}
                      <b>{(Number(item.importance) * 100).toFixed(1)}%</b>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p>
            {model?.status === "training"
              ? "Training is in progress."
              : "No trained model or evaluation metrics are available. Import historical records to train and validate the model."}
          </p>
        )}
        <span className="model-badge">
          <span />
          {model?.status ?? "Offline"}
        </span>
      </section>
      <p className="inline-disclaimer">
        Validation scores are measured from time-series cross-validation and are
        not guaranteed targets. Predictions remain unavailable until training
        succeeds.
      </p>
    </>
  );
}
