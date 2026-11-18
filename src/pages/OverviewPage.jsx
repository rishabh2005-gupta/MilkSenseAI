import { Icon } from "../components/Icon.jsx";

import { CowTable } from "../components/CowTable.jsx";

import { HerdFilters, MetricCard, PageHeading } from "../components/DashboardComponents.jsx";

import { TrendChart } from "../components/TrendChart.jsx";



const pageDate = new Date();

const pageDateLabel = pageDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase();



export function Overview({
  cows,
  total,
  avgYield,
  avgThi,
  alerts,
  metric,
  setMetric,
  days,
  setDays,
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
  observations,
  predictions,
  onSelect,
  onSort,
  onPage,
  onExport,
  onImport,
}) {
  const climate = observations.reduce(
    (summary, record) => ({
      minTemperature:
        record.tmin == null
          ? summary.minTemperature
          : Math.min(summary.minTemperature, Number(record.tmin)),
      maxTemperature:
        record.tmax == null
          ? summary.maxTemperature
          : Math.max(summary.maxTemperature, Number(record.tmax)),
      minHumidity:
        record.rhmin == null
          ? summary.minHumidity
          : Math.min(summary.minHumidity, Number(record.rhmin)),
      maxHumidity:
        record.rhmax == null
          ? summary.maxHumidity
          : Math.max(summary.maxHumidity, Number(record.rhmax)),
      latestDate:
        String(record.date) > summary.latestDate
          ? String(record.date)
          : summary.latestDate,
    }),
    {
      minTemperature: Infinity,
      maxTemperature: -Infinity,
      minHumidity: Infinity,
      maxHumidity: -Infinity,
      latestDate: "",
    },
  );
  const temperatureLabel =
    Number.isFinite(climate.minTemperature) &&
    Number.isFinite(climate.maxTemperature)
      ? `${climate.minTemperature.toFixed(1)}° — ${climate.maxTemperature.toFixed(1)}°C`
      : "No climate records";
  const humidityLabel =
    Number.isFinite(climate.minHumidity) && Number.isFinite(climate.maxHumidity)
      ? `${climate.minHumidity.toFixed(0)}% — ${climate.maxHumidity.toFixed(0)}%`
      : "No climate records";
  return (
    <>
      <PageHeading
        eyebrow={pageDateLabel}
        title="Herd overview"
        description="A clear picture of production records, predictions, and herd alerts."
        actions={
          <>
            <button className="button button-secondary" onClick={onImport}>
              <Icon name="upload" size={16} />
              Import data
            </button>
            <button className="button button-primary" onClick={onExport}>
              <Icon name="download" size={16} />
              Export report
            </button>
          </>
        }
      />
      <div className="metric-grid">
        <MetricCard
          label="Herd size"
          value={total.toLocaleString()}
          unit="cows"
          caption="In this workspace"
          icon="cow"
          tone="blue"
          trend="All animals"
        />
        <MetricCard
          label="Avg. daily yield"
          value={total ? avgYield.toFixed(1) : "—"}
          unit="kg / cow"
          caption="Across latest records"
          icon="leaf"
          tone="green"
          trend="Latest recorded DMY"
          positive
        />
        <MetricCard
          label="Needs attention"
          value={new Set(alerts.map((alert) => alert.cowId)).size
            .toString()
            .padStart(2, "0")}
          unit="cows"
          caption="Performance or heat risk"
          icon="bell"
          tone="amber"
          trend="Review alerts"
          onClick={() => onPage("alerts")}
        />
        <MetricCard
          label="Avg. heat index"
          value={avgThi === null ? "—" : avgThi.toFixed(0)}
          unit="THI"
          caption="Latest recorded THImax"
          icon="sun"
          tone="violet"
          trend={
            avgThi === null
              ? "Climate data unavailable"
              : avgThi >= 78
                ? "Elevated conditions"
                : "Below alert threshold"
          }
          positive={avgThi !== null && avgThi < 78}
        />
      </div>

      <div className="overview-grid">
        <section className="panel trend-panel">
          <div className="panel-heading">
            <div>
              <div className="section-kicker">PRODUCTION TREND</div>
              <h2>Herd performance trends</h2>
              <p>Historical records and validated model predictions</p>
            </div>
            <div className="segmented-control" aria-label="Production metric">
              <button
                className={metric === "yield" ? "segment-active" : ""}
                onClick={() => setMetric("yield")}
              >
                Yield
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
          </div>
          <div className="chart-controls">
            <div className="chart-range">
              <button
                className={days === 7 ? "range-active" : ""}
                onClick={() => setDays(7)}
              >
                7 days
              </button>
              <button
                className={days === 14 ? "range-active" : ""}
                onClick={() => setDays(14)}
              >
                14 days
              </button>
              <button
                className={days === 28 ? "range-active" : ""}
                onClick={() => setDays(28)}
              >
                28 days
              </button>
            </div>
            <span className="chart-info">
              Forecast horizon <strong>28 days</strong>
            </span>
          </div>
          <TrendChart
            metric={metric}
            days={days}
            observations={observations}
            predictions={predictions}
          />
        </section>
        <section className="panel conditions-panel">
          <div className="panel-heading panel-heading-tight">
            <div>
              <div className="section-kicker">FARM CONDITIONS</div>
              <h2>Latest conditions</h2>
            </div>
            <span className="live-tag">
              <i /> DATA
            </span>
          </div>
          <div className="weather-card">
            <div className="weather-icon">
              <Icon name="sun" size={22} />
            </div>
            <div>
              <strong>
                {avgThi === null ? "—" : avgThi.toFixed(0)} <small>THI</small>
              </strong>
              <span>Average latest THImax</span>
            </div>
            <span
              className={`weather-status ${avgThi !== null && avgThi >= 78 ? "weather-warm" : ""}`}
            >
              {avgThi === null
                ? "No data"
                : avgThi >= 78
                  ? "Elevated"
                  : "Below threshold"}
            </span>
          </div>
          <div className="condition-row">
            <span>Temperature range</span>
            <strong>{temperatureLabel}</strong>
          </div>
          <div className="condition-row">
            <span>Relative humidity range</span>
            <strong>{humidityLabel}</strong>
          </div>
          <div className="condition-row">
            <span>Latest observation</span>
            <strong>{climate.latestDate || "No records yet"}</strong>
          </div>
          <div className="condition-alert">
            <span className="condition-alert-icon">
              <Icon name="sun" size={16} />
            </span>
            <span>
              <strong>
                {alerts.length
                  ? `${alerts.length} alerts to review`
                  : "No active alerts"}
              </strong>
              <small>
                Based on recorded THI and available model predictions.
              </small>
            </span>
            <button aria-label="View alerts" onClick={() => onPage("alerts")}>
              <Icon name="chevron" size={16} />
            </button>
          </div>
        </section>
      </div>

      <section className="panel herd-panel">
        <div className="panel-heading herd-heading">
          <div>
            <div className="section-kicker">INDIVIDUAL PERFORMANCE</div>
            <h2>
              Herd list <span className="count-pill">{cows.length}</span>
            </h2>
          </div>
          <button className="text-button" onClick={() => onPage("herd")}>
            View all cows <Icon name="arrow" size={15} />
          </button>
        </div>
        <HerdFilters
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          performanceFilter={performanceFilter}
          setPerformanceFilter={setPerformanceFilter}
          dimMin={dimMin}
          setDimMin={setDimMin}
          dimMax={dimMax}
          setDimMax={setDimMax}
          placeholder="Search by name or cow ID"
        />
        <CowTable cows={cows.slice(0, 5)} onSelect={onSelect} onSort={onSort} />
        <div className="panel-footnote">
          <span>
            <i className="demo-dot" />
            Sample farm records
          </span>
          <button className="text-button" onClick={() => onPage("herd")}>
            Explore herd <Icon name="chevron" size={15} />
          </button>
        </div>
      </section>
      <div className="page-footnote">
        Predictions are displayed only when produced by a trained model. Review
        validation metrics before operational use.
      </div>
    </>
  );
}
