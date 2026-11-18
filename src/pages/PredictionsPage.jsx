import { Icon } from "../components/Icon.jsx";
import { EmptyState, PageHeading, PredictionCard } from "../components/DashboardComponents.jsx";

import { TrendChart } from "../components/TrendChart.jsx";



export function PredictionsPage({
  cows,
  metric,
  setMetric,
  days,
  setDays,
  observations,
  predictions,
  model,
  onSelect,
}) {
  const [selectedId, setSelectedId] = useState(cows[0]?.id ?? "");
  const selectedCowId = cows.some(
    (cow) => String(cow.id) === String(selectedId),
  )
    ? selectedId
    : (cows[0]?.id ?? "");
  const selectedCow = cows.find(
    (cow) => String(cow.id) === String(selectedCowId),
  );
  const cowPredictions = predictions.filter(
    (prediction) => String(prediction.cowId) === String(selectedCowId),
  );
  const latest = cowPredictions[0];
  const meetsTargets =
    model?.metrics &&
    Object.values(model.metrics).every((values) => values.meetsTarget);
  const modelLabel =
    model?.status === "completed" && model.stale
      ? "Retraining required"
      : model?.status === "training"
        ? "Training in progress"
        : meetsTargets
          ? "Model meets targets"
          : model?.status === "completed"
            ? "Metrics below target"
            : "Model not trained";
  return (
    <>
      <PageHeading
        eyebrow="28-DAY OUTLOOK"
        title="Predictions"
        description="Explore individual-cow performance forecasts produced by the trained XGBoost model."
        actions={
          <span className="model-badge">
            <span />
            {modelLabel}
          </span>
        }
      />
      {selectedCow ? (
        <>
          <section className="panel prediction-feature">
            <div className="panel-heading">
              <div>
                <div className="section-kicker">COW FORECAST</div>
                <h2>
                  {selectedCow.name}{" "}
                  <span className="inline-id">#{selectedCow.id}</span>
                </h2>
                <p>
                  {selectedCow.breed} · {selectedCow.dim} days in milk
                </p>
              </div>
              <div className="prediction-actions">
                <select
                  className="filter-select"
                  value={selectedId}
                  onChange={(event) => setSelectedId(event.target.value)}
                  aria-label="Select cow for prediction"
                >
                  {cows.map((cow) => (
                    <option key={cow.id} value={cow.id}>
                      {cow.name} · #{cow.id}
                    </option>
                  ))}
                </select>
                <button
                  className="button button-secondary"
                  onClick={() => onSelect(selectedCow)}
                >
                  Cow details <Icon name="chevron" size={16} />
                </button>
              </div>
            </div>
            <div className="prediction-controls">
              <div className="segmented-control">
                <button
                  className={metric === "yield" ? "segment-active" : ""}
                  onClick={() => setMetric("yield")}
                >
                  Daily yield
                </button>
                <button
                  className={metric === "frequency" ? "segment-active" : ""}
                  onClick={() => setMetric("frequency")}
                >
                  Milking
                </button>
                <button
                  className={metric === "fat" ? "segment-active" : ""}
                  onClick={() => setMetric("fat")}
                >
                  Fat
                </button>
                <button
                  className={metric === "protein" ? "segment-active" : ""}
                  onClick={() => setMetric("protein")}
                >
                  Protein
                </button>
              </div>
              <div className="chart-range">
                <button
                  className={days === 7 ? "range-active" : ""}
                  onClick={() => setDays(7)}
                >
                  7d
                </button>
                <button
                  className={days === 14 ? "range-active" : ""}
                  onClick={() => setDays(14)}
                >
                  14d
                </button>
                <button
                  className={days === 28 ? "range-active" : ""}
                  onClick={() => setDays(28)}
                >
                  28d
                </button>
              </div>
            </div>
            <TrendChart
              metric={metric}
              days={days}
              cow={selectedCow}
              observations={observations}
              predictions={predictions}
            />
          </section>
          <div className="prediction-cards">
            <PredictionCard
              title="Daily milk yield"
              value={
                latest ? `${Number(latest.dmy).toFixed(1)} kg` : "Unavailable"
              }
              note={
                latest
                  ? "First forecast day"
                  : "Train a model to generate forecasts"
              }
              tone="green"
            />
            <PredictionCard
              title="Fat content"
              value={
                latest ? `${Number(latest.fc).toFixed(2)}%` : "Unavailable"
              }
              note="First forecast day"
              tone="amber"
            />
            <PredictionCard
              title="Protein content"
              value={
                latest ? `${Number(latest.pc).toFixed(2)}%` : "Unavailable"
              }
              note="First forecast day"
              tone="blue"
            />
            <PredictionCard
              title="Milking frequency"
              value={
                latest ? `${Number(latest.mf).toFixed(1)} / day` : "Unavailable"
              }
              note="First forecast day"
              tone="violet"
            />
          </div>
          <p className="inline-disclaimer">
            {model?.status === "completed"
              ? "Validation metrics are available on the Data & models page. Accuracy targets are not guaranteed."
              : "No trained model is available. Import dated historical observations and start model training to generate predictions."}
          </p>
        </>
      ) : (
        <EmptyState
          title="No cow records yet"
          action="Import dated RMS records to build herd predictions."
        />
      )}
    </>
  );
}
