import { Icon } from "./Icon.jsx";



export function Status({ value }) {
  const tone =
    value === "Healthy" ? "healthy" : value === "Alert" ? "alert" : "watch";
  return (
    <span className={`status status-${tone}`}>
      <span />
      {value}
    </span>
  );
}

export function Sparkline({ color = "green", downward = false }) {
  return (
    <svg
      className={`sparkline sparkline-${color}`}
      viewBox="0 0 78 28"
      aria-hidden="true"
    >
      <path
        d={
          downward
            ? "M2 6 14 10 25 8 37 15 49 12 61 19 76 22"
            : "M2 21 14 17 25 19 37 10 49 15 61 7 76 4"
        }
      />
    </svg>
  );
}

export function PageHeading({ eyebrow, title, description, actions }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{actions}</div>
    </div>
  );
}

export function HerdFilters({
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  performanceFilter,
  setPerformanceFilter,
  dimMin,
  setDimMin,
  dimMax,
  setDimMax,
  placeholder,
}) {
  return (
    <div className="table-toolbar">
      <label className="table-search">
        <Icon name="search" size={16} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={placeholder}
          aria-label="Search herd by name or ID"
        />
      </label>
      <label className="dim-filter">
        <span>DIM</span>
        <input
          type="number"
          min="0"
          placeholder="Min"
          value={dimMin}
          onChange={(event) => setDimMin(event.target.value)}
          aria-label="Minimum days in milk"
        />
        <input
          type="number"
          min="0"
          placeholder="Max"
          value={dimMax}
          onChange={(event) => setDimMax(event.target.value)}
          aria-label="Maximum days in milk"
        />
      </label>
      <select
        className="filter-select"
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value)}
        aria-label="Filter by herd status"
      >
        <option>All status</option>
        <option>Healthy</option>
        <option>Watch</option>
        <option>Alert</option>
      </select>
      <select
        className="filter-select"
        value={performanceFilter}
        onChange={(event) => setPerformanceFilter(event.target.value)}
        aria-label="Filter by prediction availability"
      >
        <option>All performance</option>
        <option>Predicted</option>
        <option>Not predicted</option>
      </select>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  unit,
  caption,
  icon,
  tone,
  trend,
  positive,
  onClick,
}) {
  return (
    <button
      className={`metric-card metric-${tone} ${onClick ? "metric-clickable" : ""}`}
      onClick={onClick}
      disabled={!onClick}
    >
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">
          <Icon name={icon} size={18} />
        </span>
      </div>
      <div className="metric-value">
        {value}
        <small>{unit}</small>
      </div>
      <div className="metric-bottom">
        <span>{caption}</span>
        <Sparkline
          color={tone === "amber" ? "amber" : "green"}
          downward={tone === "amber"}
        />
      </div>
      <div
        className={`metric-trend ${positive === false ? "trend-neutral" : ""}`}
      >
        {trend}
      </div>
    </button>
  );
}

export function PredictionCard({ title, value, note, tone }) {
  return (
    <div className={`prediction-card prediction-${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

export function ModelRunHistory({ runs }) {
  const targets = { DMY: "DMY", MF: "MF", FC: "FC", PC: "PC" };
  return (
    <section className="panel model-history">
      <div className="section-kicker">ONGOING VALIDATION</div>
      <h2>Model performance history</h2>
      {runs.length ? (
        <div className="model-history-list">
          {runs.map((run) => (
            <div key={run.id}>
              <span>
                <strong>{run.status}</strong>
                <time dateTime={run.startedAt}>
                  {String(run.startedAt).replace("T", " ").slice(0, 19)} UTC
                </time>
              </span>
              <p>
                {run.metrics
                  ? Object.entries(run.metrics)
                      .map(
                        ([target, values]) =>
                          `${targets[target] ?? target}: ${Number(values.accuracyPercent).toFixed(1)}% accuracy, R² ${Number(values.r2).toFixed(3)}`,
                      )
                      .join(" · ")
                  : (run.error ??
                    "Metrics will be available when training completes.")}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p>No model training runs have been recorded.</p>
      )}
    </section>
  );
}

export function EmptyState({ title, action }) {
  return (
    <div className="empty-state">
      <span>
        <Icon name="cow" size={22} />
      </span>
      <strong>{title}</strong>
      <p>{action}</p>
    </div>
  );
}
