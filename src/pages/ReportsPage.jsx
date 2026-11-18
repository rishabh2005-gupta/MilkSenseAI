import { Icon } from "../components/Icon.jsx";

import { PageHeading } from "../components/DashboardComponents.jsx";



export function ReportsPage({ cows, total, onExport, onPage }) {
  return (
    <>
      <PageHeading
        eyebrow="HERD MANAGEMENT"
        title="Reports"
        description="Export current observations and available 28-day model predictions."
        actions={
          <button className="button button-primary" onClick={onExport}>
            <Icon name="download" size={16} />
            Export CSV report
          </button>
        }
      />
      <section className="panel report-panel">
        <div className="report-icon">
          <Icon name="file" size={22} />
        </div>
        <div>
          <div className="section-kicker">HERD PERFORMANCE REPORT</div>
          <h2>Current workspace report</h2>
          <p>
            Download the latest recorded measurements, available 28-day
            predictions, and composition for each cow.
          </p>
        </div>
        <div className="report-stats">
          <div>
            <strong>{total}</strong>
            <span>cow records</span>
          </div>
          <div>
            <strong>
              {cows.filter((cow) => cow.status !== "Healthy").length}
            </strong>
            <span>flagged for review</span>
          </div>
          <div>
            <strong>28 days</strong>
            <span>prediction horizon</span>
          </div>
        </div>
        <div className="report-actions">
          <span>
            CSV · generated from PostgreSQL observations and model output
          </span>
          <button className="button button-secondary" onClick={onExport}>
            <Icon name="download" size={16} />
            Download report
          </button>
        </div>
      </section>
      <section className="panel report-note">
        <span className="note-mark">i</span>
        <p>
          <strong>About this report</strong>
          <br />
          Forecast columns are blank until a model has been trained. Validation
          metrics and feature importance are available under Data & models.
        </p>
        <button className="text-button" onClick={() => onPage("data")}>
          Review model status <Icon name="arrow" size={15} />
        </button>
      </section>
    </>
  );
}
