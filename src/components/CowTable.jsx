import { Icon } from "./Icon.jsx";
import { Status } from "./DashboardComponents.jsx";

export function CowTable({ cows, onSelect, onSort }) {
  return (
    <div className="table-scroll">
      <table className="cow-table">
        <thead>
          <tr>
            <th>
              <button className="sort-button" onClick={() => onSort("id")}>
                Cow <span>↕</span>
              </button>
            </th>
            <th>
              <button className="sort-button" onClick={() => onSort("dim")}>
                DIM <span>↕</span>
              </button>
            </th>
            <th>Daily yield</th>
            <th>28-day outlook</th>
            <th>Milking / day</th>
            <th>Herd status</th>
            <th aria-label="View cow" />
          </tr>
        </thead>
        <tbody>
          {cows.map((cow) => (
            <tr
              key={cow.id}
              onClick={() => onSelect(cow)}
              tabIndex={0}
              onKeyDown={(event) => event.key === "Enter" && onSelect(cow)}
            >
              <td>
                <div className="cow-identity">
                  <span className={`cow-avatar avatar-${Number(cow.id) % 4}`}>
                    <Icon name="cow" size={17} />
                  </span>
                  <span>
                    <strong>{cow.name}</strong>
                    <small>
                      #{cow.id} · {cow.breed}
                    </small>
                  </span>
                </div>
              </td>
              <td>
                {cow.dim}
                <span className="table-muted"> days</span>
              </td>
              <td>
                <strong>{cow.dmy.toFixed(1)}</strong>
                <span className="table-muted"> kg</span>
              </td>
              <td>
                {cow.change === null ? (
                  <span className="table-muted">—</span>
                ) : (
                  <span
                    className={
                      cow.change < 0 ? "change-negative" : "change-positive"
                    }
                  >
                    {cow.change > 0 ? "+" : ""}
                    {cow.change.toFixed(1)}%
                  </span>
                )}
              </td>
              <td>
                {cow.mf.toFixed(1)} <span className="table-muted">visits</span>
              </td>
              <td>
                <Status value={cow.status} />
              </td>
              <td>
                <button
                  className="icon-button row-open"
                  aria-label={`View ${cow.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(cow);
                  }}
                >
                  <Icon name="chevron" size={17} />
                </button>
              </td>
            </tr>
          ))}
          {cows.length === 0 && (
            <tr>
              <td className="empty-row" colSpan="7">
                No cows match those filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
