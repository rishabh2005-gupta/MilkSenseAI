import { Icon } from "../components/Icon.jsx";

import { EmptyState, PageHeading } from "../components/DashboardComponents.jsx";



export function AlertsPage({ alerts, cows, onSelect, onNotify }) {
  return (
    <>
      <PageHeading
        eyebrow="HERD MONITORING"
        title="Alerts"
        description="Review cows with elevated THI or model-predicted performance deviations."
        actions={
          <button className="button button-secondary" onClick={onNotify}>
            Email alert digest
          </button>
        }
      />
      <section className="panel alerts-panel">
        <div className="panel-heading">
          <div>
            <div className="section-kicker">NEEDS REVIEW</div>
            <h2>{alerts.length} active alerts</h2>
            <p>
              Heat-risk flags use THImax ≥ 78; performance flags use model
              validation error.
            </p>
          </div>
        </div>
        {alerts.length ? (
          <div className="alert-list">
            {alerts.map((alert, index) => (
              <button
                className="alert-item"
                key={`${alert.cowId}-${alert.kind}-${index}`}
                onClick={() => {
                  const cow = cows.find(
                    (item) => String(item.id) === String(alert.cowId),
                  );
                  if (cow) onSelect(cow);
                }}
              >
                <span
                  className={`alert-symbol ${alert.priority === "high" ? "alert-symbol-high" : ""}`}
                >
                  <Icon
                    name={alert.kind === "heat-stress" ? "sun" : "chart"}
                    size={18}
                  />
                </span>
                <span className="alert-copy">
                  <strong>
                    {alert.kind === "heat-stress"
                      ? "Elevated heat-stress risk"
                      : "Predicted yield deviation"}{" "}
                    <small> · Cow {alert.cowId}</small>
                  </strong>
                  <span>
                    {alert.name} · {alert.message}
                  </span>
                </span>
                <span className="alert-priority">
                  {alert.priority === "high" ? "Review" : "Monitor"}
                </span>
                <Icon name="chevron" size={17} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No active alerts"
            action="There are no cows flagged in the current dataset."
          />
        )}
      </section>
    </>
  );
}
