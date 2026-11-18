import { Icon } from "./Icon.jsx";

import { Status } from "./DashboardComponents.jsx";

import { TrendChart } from "./TrendChart.jsx";



export function CowDetail({
  cow,
  observations,
  predictions,
  featureImportance,
  onClose,
}) {
  const importantFeatures = featureImportance?.DMY?.slice(0, 3) ?? [];
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="cow-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cow-detail-title"
      >
        <div className="modal-header">
          <div className="cow-identity">
            <span className="cow-avatar avatar-1">
              <Icon name="cow" size={19} />
            </span>
            <span>
              <small>INDIVIDUAL COW</small>
              <strong id="cow-detail-title">
                {cow.name} <span className="inline-id">#{cow.id}</span>
              </strong>
            </span>
          </div>
          <button
            className="icon-button"
            aria-label="Close cow details"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="cow-facts">
          <span>
            <small>Breed</small>
            <strong>{cow.breed}</strong>
          </span>
          <span>
            <small>Days in milk</small>
            <strong>{cow.dim} days</strong>
          </span>
          <span>
            <small>Herd status</small>
            <Status value={cow.status} />
          </span>
        </div>
        <div className="detail-chart">
          <div className="section-kicker">HISTORICAL & 28-DAY OUTLOOK</div>
          <TrendChart
            metric="yield"
            days={28}
            cow={cow}
            observations={observations}
            predictions={predictions}
          />
        </div>
        <div className="detail-composition">
          <div>
            <span>Daily yield</span>
            <strong>
              {Number(cow.dmy).toFixed(1)} <small>kg</small>
            </strong>
          </div>
          <div>
            <span>Fat content</span>
            <strong>
              {Number(cow.fat).toFixed(2)}
              <small>%</small>
            </strong>
          </div>
          <div>
            <span>Protein</span>
            <strong>
              {Number(cow.protein).toFixed(2)}
              <small>%</small>
            </strong>
          </div>
          <div>
            <span>Milking frequency</span>
            <strong>
              {Number(cow.mf).toFixed(1)}
              <small>/ day</small>
            </strong>
          </div>
        </div>
        <div className="feature-box">
          <div>
            <div className="section-kicker">MODEL CONTEXT</div>
            <strong>
              {importantFeatures.length
                ? "Top DMY prediction drivers"
                : "Feature importance unavailable"}
            </strong>
          </div>
          <p>
            {importantFeatures.length
              ? importantFeatures
                  .map(
                    (item) =>
                      `${item.feature} (${(Number(item.importance) * 100).toFixed(1)}%)`,
                  )
                  .join(" · ")
              : "Train a model on historical data to calculate feature importance."}
          </p>
        </div>
      </section>
    </div>
  );
}
