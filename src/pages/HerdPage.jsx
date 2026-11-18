import { Icon } from "../components/Icon.jsx";

import { CowTable } from "../components/CowTable.jsx";

import { HerdFilters, PageHeading } from "../components/DashboardComponents.jsx";



export function HerdPage({
  cows,
  total,
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
  onSelect,
  onSort,
  onImport,
}) {
  return (
    <>
      <PageHeading
        eyebrow="ANIMALS & PERFORMANCE"
        title="Herd"
        description={`${total} cows in your workspace. Search by ID, DIM, or prediction availability.`}
        actions={
          <button className="button button-primary" onClick={onImport}>
            <Icon name="upload" size={16} />
            Import records
          </button>
        }
      />
      <section className="panel full-table-panel">
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
          placeholder="Search by name, ID, or breed"
        />
        <CowTable cows={cows} onSelect={onSelect} onSort={onSort} />
      </section>
      <div className="page-footnote">
        DIM = days in milk. Forecast values are available only after model
        training.
      </div>
    </>
  );
}
