const pageDate = new Date();

const pageTodayUtc = Date.UTC(pageDate.getUTCFullYear(), pageDate.getUTCMonth(), pageDate.getUTCDate());



export function TrendChart({
  metric,
  days,
  cow,
  observations = [],
  predictions = [],
}) {
  const field = { yield: "dmy", frequency: "mf", fat: "fc", protein: "pc" }[
    metric
  ];
  const label = {
    yield: "Daily milk yield",
    frequency: "Milking frequency",
    fat: "Fat content",
    protein: "Protein content",
  }[metric];
  const unit = {
    yield: "kg / cow / day",
    frequency: "visits / day",
    fat: "%",
    protein: "%",
  }[metric];
  const today = pageTodayUtc;
  const start = today - days * 86_400_000;
  const end = today + days * 86_400_000;
  const aggregate = (source) => {
    const filtered = source.filter(
      (entry) =>
        (!cow || String(entry.cowId) === String(cow.id)) &&
        entry.date &&
        entry[field] !== null &&
        entry[field] !== undefined,
    );
    if (cow)
      return filtered
        .map((entry) => ({
          date: Date.parse(entry.date),
          value: Number(entry[field]),
        }))
        .filter(
          (entry) =>
            Number.isFinite(entry.date) && Number.isFinite(entry.value),
        );
    const grouped = new Map();
    filtered.forEach((entry) => {
      const date = String(entry.date).slice(0, 10);
      const value = Number(entry[field]);
      if (!Number.isFinite(value)) return;
      const group = grouped.get(date) ?? { total: 0, count: 0 };
      group.total += value;
      group.count += 1;
      grouped.set(date, group);
    });
    return [...grouped].map(([date, group]) => ({
      date: Date.parse(date),
      value: group.total / group.count,
    }));
  };
  const history = aggregate(observations).filter(
    (entry) => entry.date >= start && entry.date <= today,
  );
  const forecast = aggregate(predictions).filter(
    (entry) => entry.date > today && entry.date <= end,
  );
  const values = [...history, ...forecast].map((entry) => entry.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const padding = (max - min || Math.abs(max) * 0.1 || 1) * 0.15;
  const scaleY = (value) =>
    188 - ((value - min + padding) / (max - min + padding * 2)) * 150;
  const scaleX = (date) => 44 + ((date - start) / (end - start)) * 550;
  const historyPoints = history
    .map((entry) => `${scaleX(entry.date)},${scaleY(entry.value)}`)
    .join(" ");
  const forecastPoints = forecast
    .map((entry) => `${scaleX(entry.date)},${scaleY(entry.value)}`)
    .join(" ");
  const latestByCow = new Map();
  observations.forEach((entry) => {
    if (entry[field] === null || entry[field] === undefined || !entry.date)
      return;
    const current = latestByCow.get(String(entry.cowId));
    if (
      !current ||
      String(entry.date).slice(0, 10) > String(current.date).slice(0, 10)
    )
      latestByCow.set(String(entry.cowId), entry);
  });
  const latestValues = [...latestByCow.values()]
    .map((entry) => Number(entry[field]))
    .filter(Number.isFinite);
  const currentValue = cow
    ? cow[field === "fc" ? "fat" : field === "pc" ? "protein" : field]
    : latestValues.length
      ? latestValues.reduce((sum, value) => sum + value, 0) /
        latestValues.length
      : null;
  const currentLabel =
    currentValue == null
      ? "—"
      : `${Number(currentValue).toFixed(metric === "yield" || metric === "frequency" ? 1 : 2)} ${unit}`;
  return (
    <div className="chart-wrap">
      <div className="chart-summary">
        <strong>{currentLabel}</strong>
        <span>{cow ? "latest recorded value" : "latest herd average"}</span>
      </div>
      {!values.length && (
        <div className="chart-empty">
          Import dated RMS records to view {label.toLowerCase()} trends.
        </div>
      )}
      <svg
        className="trend-chart"
        viewBox="0 0 620 228"
        role="img"
        aria-label={`${label} historical observations and model predictions for ${days} days`}
      >
        {[35, 75, 115, 155, 195].map((y) => (
          <line key={y} x1="42" x2="594" y1={y} y2={y} className="chart-grid" />
        ))}
        {historyPoints && (
          <polyline
            points={historyPoints}
            className="chart-line history-line"
          />
        )}
        {forecastPoints && (
          <polyline
            points={forecastPoints}
            className="chart-line forecast-line"
          />
        )}
        <line x1="319" x2="319" y1="28" y2="190" className="forecast-marker" />
        {history.map((entry, index) => (
          <circle
            key={`h-${index}`}
            cx={scaleX(entry.date)}
            cy={scaleY(entry.value)}
            r="3.5"
            className="chart-dot"
          />
        ))}
        {forecast.map((entry, index) => (
          <circle
            key={`p-${index}`}
            cx={scaleX(entry.date)}
            cy={scaleY(entry.value)}
            r="3"
            className="chart-dot forecast-dot"
          />
        ))}
        <text x="44" y="216" className="chart-label">
          {days} days ago
        </text>
        <text x="319" y="216" textAnchor="middle" className="chart-label">
          Today
        </text>
        <text x="594" y="216" textAnchor="end" className="chart-label">
          Next {days} days
        </text>
      </svg>
      <div className="chart-legend">
        <span>
          <i className="legend-dot actual" /> Historical
        </span>
        <span>
          <i className="legend-dot forecast" />
          XGBoost prediction
        </span>
        <span className="chart-unit">{unit}</span>
      </div>
    </div>
  );
}
