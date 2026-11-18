import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AuthScreen from "./AuthScreen.jsx";
import { apiRequest, downloadApiFile } from "./api.js";
import "./App.css";
import { Icon } from "./components/Icon.jsx";
import { ModelRunHistory } from "./components/DashboardComponents.jsx";
import { CowDetail } from "./components/CowDetail.jsx";
import { ProfileDialog } from "./components/ProfileDialog.jsx";
import { AlertsPage } from "./pages/AlertsPage.jsx";
import { DataPage } from "./pages/DataPage.jsx";
import { HerdPage } from "./pages/HerdPage.jsx";
import { Overview } from "./pages/OverviewPage.jsx";
import { PredictionsPage } from "./pages/PredictionsPage.jsx";
import { ReportsPage } from "./pages/ReportsPage.jsx";

const navigation = [
  { id: "overview", label: "Overview", icon: "grid" },
  { id: "herd", label: "Herd", icon: "cow" },
  { id: "predictions", label: "Predictions", icon: "chart" },
  { id: "alerts", label: "Alerts", icon: "bell" },
  { id: "data", label: "Data & models", icon: "database" },
  { id: "reports", label: "Reports", icon: "file" },
];

function App() {
  const [page, setPage] = useState("overview");
  const [cows, setCows] = useState([]);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [observations, setObservations] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [modelState, setModelState] = useState(null);
  const [metricRuns, setMetricRuns] = useState([]);
  const [modelTraining, setModelTraining] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [observationTotal, setObservationTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All status");
  const [performanceFilter, setPerformanceFilter] = useState("All performance");
  const [dimMin, setDimMin] = useState("");
  const [dimMax, setDimMax] = useState("");
  const [sortKey, setSortKey] = useState("id");
  const [sortAscending, setSortAscending] = useState(true);
  const [metric, setMetric] = useState("yield");
  const [days, setDays] = useState(28);
  const [selectedCow, setSelectedCow] = useState(null);
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const fileInput = useRef(null);

  const refreshWorkspace = useCallback(async () => {
    try {
      const [herd, model, history, forecast, alertResult, summary, metrics] =
        await Promise.all([
          apiRequest("/herd"),
          apiRequest("/models/status"),
          apiRequest("/observations?days=28"),
          apiRequest("/predictions"),
          apiRequest("/alerts"),
          apiRequest("/data/summary"),
          apiRequest("/reports/metrics"),
        ]);
      setCows(herd.cows);
      setModelState(model.model);
      setObservations(history.observations);
      setPredictions(forecast.predictions);
      setAlerts(alertResult.alerts);
      setMetricRuns(metrics.runs);
      setObservationTotal(summary.observations);
      setDataLoading(false);
      return true;
    } catch (error) {
      setDataLoading(false);
      if (error.status === 401) {
        setUser(null);
        setAuthError("Your session expired. Sign in again.");
      } else {
        showNotice(error.message);
      }
      return false;
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      const params = new URLSearchParams(window.location.search);
      const verificationToken = params.get("verify");
      if (verificationToken) {
        try {
          const result = await apiRequest(
            `/auth/verify?token=${encodeURIComponent(verificationToken)}`,
          );
          if (active) setAuthMessage(result.message);
        } catch (error) {
          if (active) setAuthError(error.message);
        } finally {
          window.history.replaceState({}, "", window.location.pathname);
        }
      }
      try {
        const result = await apiRequest("/auth/me");
        if (active) {
          setUser(result.user);
          await refreshWorkspace();
        }
      } catch (error) {
        if (active && error.status !== 401)
          setAuthError(`Backend connection failed: ${error.message}`);
      } finally {
        if (active) setAuthLoading(false);
      }
    }
    initialize();
    return () => {
      active = false;
    };
  }, [refreshWorkspace]);

  const filteredCows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...cows]
      .filter(
        (cow) =>
          !query ||
          `${cow.id} ${cow.name} ${cow.breed}`.toLowerCase().includes(query),
      )
      .filter(
        (cow) => statusFilter === "All status" || cow.status === statusFilter,
      )
      .filter((cow) => dimMin === "" || cow.dim >= Number(dimMin))
      .filter((cow) => dimMax === "" || cow.dim <= Number(dimMax))
      .filter(
        (cow) =>
          performanceFilter === "All performance" ||
          (performanceFilter === "Predicted"
            ? cow.forecast !== null
            : cow.forecast === null),
      )
      .sort(
        (a, b) =>
          String(a[sortKey]).localeCompare(String(b[sortKey]), undefined, {
            numeric: true,
          }) * (sortAscending ? 1 : -1),
      );
  }, [
    cows,
    search,
    statusFilter,
    performanceFilter,
    dimMin,
    dimMax,
    sortKey,
    sortAscending,
  ]);

  const averageYield = cows.length
    ? cows.reduce((sum, cow) => sum + cow.dmy, 0) / cows.length
    : 0;
  const herdThi = cows.filter((cow) => cow.thi !== null).map((cow) => cow.thi);
  const averageThi = herdThi.length
    ? herdThi.reduce((sum, value) => sum + value, 0) / herdThi.length
    : null;
  const pageTitle =
    navigation.find((item) => item.id === page)?.label ?? "Overview";

  function showNotice(message) {
    setNotice(message);
    window.clearTimeout(showNotice.timeout);
    showNotice.timeout = window.setTimeout(() => setNotice(""), 5000);
  }

  function openPage(nextPage) {
    setPage(nextPage);
    setMobileNav(false);
    setSearch("");
    setStatusFilter("All status");
    setPerformanceFilter("All performance");
    setDimMin("");
    setDimMax("");
  }

  function sortBy(key) {
    if (sortKey === key) setSortAscending((current) => !current);
    else {
      setSortKey(key);
      setSortAscending(true);
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      showNotice("Please choose a CSV file with dated RMS records.");
      return;
    }
    try {
      const result = await apiRequest("/data/import", {
        method: "POST",
        body: JSON.stringify({ csv: await file.text() }),
      });
      if (await refreshWorkspace()) showNotice(result.message);
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "The CSV could not be read.",
      );
    }
  }

  async function exportReport() {
    try {
      await downloadApiFile("/reports/export", "milksense-herd-report.csv");
      showNotice(
        "Exported the latest herd observations and available predictions.",
      );
    } catch (error) {
      showNotice(error.message);
    }
  }

  async function startTraining() {
    setModelTraining(true);
    try {
      const { runId } = await apiRequest("/models/train", {
        method: "POST",
        body: "{}",
      });
      showNotice("XGBoost training started. This may take a few minutes.");
      let result = null;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const status = await apiRequest("/models/status");
        result = status.model;
        if (result?.id === runId && result.status !== "training") break;
      }
      await refreshWorkspace();
      if (result?.status === "completed")
        showNotice(
          "Training complete. Review time-series validation metrics before using predictions.",
        );
      else if (result?.status === "failed")
        showNotice(result.error || "Model training failed.");
      else
        showNotice(
          "Training is still running. Check the model status again shortly.",
        );
    } catch (error) {
      showNotice(error.message);
    } finally {
      setModelTraining(false);
    }
  }

  async function logout() {
    try {
      await apiRequest("/auth/logout", { method: "POST", body: "{}" });
      setUser(null);
      setCows([]);
      setObservations([]);
      setPredictions([]);
      setAlerts([]);
      setModelState(null);
    } catch (error) {
      showNotice(error.message);
    }
  }

  async function saveProfile(profile) {
    try {
      const result = await apiRequest("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify(profile),
      });
      setUser(result.user);
      setProfileOpen(false);
      showNotice("Profile updated.");
    } catch (error) {
      showNotice(error.message);
    }
  }

  if (authLoading) return <AuthScreen loading />;
  if (!user) {
    return (
      <AuthScreen
        initialMessage={authMessage}
        initialError={authError}
        onAuthenticated={(authenticatedUser) => {
          setAuthError("");
          setAuthMessage("");
          setUser(authenticatedUser);
          refreshWorkspace();
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <Icon name="leaf" size={22} />
          </div>
          <div>
            <strong>
              MilkSense<span>AI</span>
            </strong>
            <small>DAIRY INTELLIGENCE</small>
          </div>
        </div>
        <div className="farm-select">
          <span className="farm-avatar">
            {user.farmName?.slice(0, 1).toUpperCase() ?? "F"}
          </span>
          <span>
            <strong>{user.farmName}</strong>
            <small>Farm workspace</small>
          </span>
          <Icon name="chevron" size={15} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-link ${page === item.id ? "nav-active" : ""}`}
              onClick={() => openPage(item.id)}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {item.id === "alerts" && alerts.length > 0 && (
                <span className="nav-count">{alerts.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note">
            <span className="demo-indicator" />
            <span>
              <strong>
                {modelState?.status === "completed"
                  ? "Model trained"
                  : "Farm workspace"}
              </strong>
              <small>
                {dataLoading
                  ? "Loading farm data"
                  : `${cows.length} cow records`}
              </small>
            </span>
          </div>
          <div className="profile-row">
            <span className="profile-avatar">
              {user.name
                .split(/\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <span>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </span>
            <button
              className="icon-button profile-more"
              aria-label="Profile options"
              onClick={() => setProfileOpen(true)}
            >
              ···
            </button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobileNav(true)}
          >
            <Icon name="menu" />
          </button>
          <div className="breadcrumb">
            <span>{user.farmName}</span>
            <Icon name="chevron" size={14} />
            <strong>{pageTitle}</strong>
          </div>
          <div className="topbar-actions">
            <label className="global-search">
              <Icon name="search" size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search cows..."
                aria-label="Search cows"
              />
              <kbd>⌘ K</kbd>
            </label>
            <button
              className="icon-button top-notifications"
              aria-label={`Open alerts, ${alerts.length} active`}
              onClick={() => openPage("alerts")}
            >
              <Icon name="bell" size={19} />
              {alerts.length > 0 && <i />}
            </button>
            <button
              className="top-avatar"
              title={user.name}
              onClick={() => setProfileOpen(true)}
            >
              {user.name
                .split(/\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </button>
          </div>
        </header>

        <div className="page-content">
          <div className="demo-banner">
            <span className="demo-dot" />
            <span>
              <strong>Farm data workspace</strong>
              <span className="banner-divider">·</span> Predictions appear only
              after an XGBoost model has been trained and validated on your
              historical records.
            </span>
            <button className="sign-out-button" onClick={logout}>
              Sign out
            </button>
          </div>
          {page === "overview" && (
            <Overview
              cows={filteredCows}
              total={cows.length}
              avgYield={averageYield}
              avgThi={averageThi}
              alerts={alerts}
              metric={metric}
              setMetric={setMetric}
              days={days}
              setDays={setDays}
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
              observations={observations}
              predictions={predictions}
              onSelect={setSelectedCow}
              onSort={sortBy}
              onPage={openPage}
              onExport={exportReport}
              onImport={() => fileInput.current?.click()}
            />
          )}
          {page === "herd" && (
            <HerdPage
              cows={filteredCows}
              total={cows.length}
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
              onSelect={setSelectedCow}
              onSort={sortBy}
              onImport={() => fileInput.current?.click()}
            />
          )}
          {page === "predictions" && (
            <PredictionsPage
              cows={filteredCows}
              metric={metric}
              setMetric={setMetric}
              days={days}
              setDays={setDays}
              observations={observations}
              predictions={predictions}
              model={modelState}
              onSelect={setSelectedCow}
            />
          )}
          {page === "alerts" && (
            <AlertsPage
              alerts={alerts}
              cows={cows}
              onSelect={setSelectedCow}
              onNotify={async () => {
                try {
                  const result = await apiRequest("/alerts/notify", {
                    method: "POST",
                    body: "{}",
                  });
                  showNotice(result.message);
                } catch (error) {
                  showNotice(error.message);
                }
              }}
            />
          )}
          {page === "data" && (
            <>
              <DataPage
                total={cows.length}
                observations={observationTotal}
                model={modelState}
                training={modelTraining}
                onTrain={startTraining}
                onImport={() => fileInput.current?.click()}
              />
              <ModelRunHistory runs={metricRuns} />
            </>
          )}
          {page === "reports" && (
            <ReportsPage
              cows={filteredCows}
              total={cows.length}
              onExport={exportReport}
              onPage={openPage}
            />
          )}
        </div>
      </main>
      <input
        ref={fileInput}
        className="visually-hidden"
        type="file"
        accept=".csv,text/csv"
        onChange={handleUpload}
      />
      {notice && (
        <div className="toast" role="status">
          <span className="toast-check">
            <Icon name="check" size={15} />
          </span>
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setNotice("")}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {selectedCow && (
        <CowDetail
          cow={selectedCow}
          observations={observations}
          predictions={predictions}
          featureImportance={modelState?.featureImportance}
          onClose={() => setSelectedCow(null)}
        />
      )}
      {profileOpen && (
        <ProfileDialog
          user={user}
          onSave={saveProfile}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
