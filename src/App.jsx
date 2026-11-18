import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AuthScreen from './AuthScreen.jsx'
import { apiRequest, downloadApiFile } from './api.js'
import './App.css'

const pageDate = new Date()
const pageDateLabel = pageDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()
const pageTodayUtc = Date.UTC(pageDate.getUTCFullYear(), pageDate.getUTCMonth(), pageDate.getUTCDate())

const navigation = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'herd', label: 'Herd', icon: 'cow' },
  { id: 'predictions', label: 'Predictions', icon: 'chart' },
  { id: 'alerts', label: 'Alerts', icon: 'bell' },
  { id: 'data', label: 'Data & models', icon: 'database' },
  { id: 'reports', label: 'Reports', icon: 'file' },
]

const paths = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  cow: <><path d="M7 8 4 5 2 7l3 4" /><path d="m17 8 3-3 2 2-3 4" /><path d="M6 9a6 6 0 0 1 12 0v5a6 6 0 0 1-12 0z" /><path d="M9 14h6m-5-3h.01M14 11h.01M10 19v2m4-2v2" /></>,
  chart: <><path d="M3 3v18h18" /><path d="m7 14 4-4 4 3 6-7" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8m-8 4h8" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
  upload: <><path d="M12 16V4m-4 4 4-4 4 4" /><path d="M20 16.5v3A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5v-3" /></>,
  download: <><path d="M12 4v12m-4-4 4 4 4-4" /><path d="M4 19h16" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <><path d="m18 6-12 12M6 6l12 12" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  leaf: <><path d="M20 4c-9 0-15 4-15 11a5 5 0 0 0 5 5c7 0 11-6 10-16Z" /><path d="M5 19c3-4 6-7 11-10" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
}

function Icon({ name, size = 18 }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function Status({ value }) {
  const tone = value === 'Healthy' ? 'healthy' : value === 'Alert' ? 'alert' : 'watch'
  return <span className={`status status-${tone}`}><span />{value}</span>
}

function Sparkline({ color = 'green', downward = false }) {
  return (
    <svg className={`sparkline sparkline-${color}`} viewBox="0 0 78 28" aria-hidden="true">
      <path d={downward ? 'M2 6 14 10 25 8 37 15 49 12 61 19 76 22' : 'M2 21 14 17 25 19 37 10 49 15 61 7 76 4'} />
    </svg>
  )
}

function TrendChart({ metric, days, cow, observations = [], predictions = [] }) {
  const field = { yield: 'dmy', frequency: 'mf', fat: 'fc', protein: 'pc' }[metric]
  const label = { yield: 'Daily milk yield', frequency: 'Milking frequency', fat: 'Fat content', protein: 'Protein content' }[metric]
  const unit = { yield: 'kg / cow / day', frequency: 'visits / day', fat: '%', protein: '%' }[metric]
  const today = pageTodayUtc
  const start = today - days * 86_400_000
  const end = today + days * 86_400_000
  const aggregate = (source) => {
    const filtered = source.filter((entry) => (!cow || String(entry.cowId) === String(cow.id)) && entry.date && entry[field] !== null && entry[field] !== undefined)
    if (cow) return filtered.map((entry) => ({ date: Date.parse(entry.date), value: Number(entry[field]) })).filter((entry) => Number.isFinite(entry.date) && Number.isFinite(entry.value))
    const grouped = new Map()
    filtered.forEach((entry) => {
      const date = String(entry.date).slice(0, 10)
      const value = Number(entry[field])
      if (!Number.isFinite(value)) return
      const group = grouped.get(date) ?? { total: 0, count: 0 }
      group.total += value
      group.count += 1
      grouped.set(date, group)
    })
    return [...grouped].map(([date, group]) => ({ date: Date.parse(date), value: group.total / group.count }))
  }
  const history = aggregate(observations).filter((entry) => entry.date >= start && entry.date <= today)
  const forecast = aggregate(predictions).filter((entry) => entry.date > today && entry.date <= end)
  const values = [...history, ...forecast].map((entry) => entry.value)
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 1
  const padding = (max - min || Math.abs(max) * .1 || 1) * .15
  const scaleY = (value) => 188 - ((value - min + padding) / (max - min + padding * 2)) * 150
  const scaleX = (date) => 44 + ((date - start) / (end - start)) * 550
  const historyPoints = history.map((entry) => `${scaleX(entry.date)},${scaleY(entry.value)}`).join(' ')
  const forecastPoints = forecast.map((entry) => `${scaleX(entry.date)},${scaleY(entry.value)}`).join(' ')
  const latestByCow = new Map()
  observations.forEach((entry) => {
    if (entry[field] === null || entry[field] === undefined || !entry.date) return
    const current = latestByCow.get(String(entry.cowId))
    if (!current || String(entry.date).slice(0, 10) > String(current.date).slice(0, 10)) latestByCow.set(String(entry.cowId), entry)
  })
  const latestValues = [...latestByCow.values()].map((entry) => Number(entry[field])).filter(Number.isFinite)
  const currentValue = cow
    ? cow[field === 'fc' ? 'fat' : field === 'pc' ? 'protein' : field]
    : latestValues.length ? latestValues.reduce((sum, value) => sum + value, 0) / latestValues.length : null
  const currentLabel = currentValue == null ? '—' : `${Number(currentValue).toFixed(metric === 'yield' || metric === 'frequency' ? 1 : 2)} ${unit}`
  return (
    <div className="chart-wrap">
      <div className="chart-summary"><strong>{currentLabel}</strong><span>{cow ? 'latest recorded value' : 'latest herd average'}</span></div>
      {!values.length && <div className="chart-empty">Import dated RMS records to view {label.toLowerCase()} trends.</div>}
      <svg className="trend-chart" viewBox="0 0 620 228" role="img" aria-label={`${label} historical observations and model predictions for ${days} days`}>
        {[35, 75, 115, 155, 195].map((y) => <line key={y} x1="42" x2="594" y1={y} y2={y} className="chart-grid" />)}
        {historyPoints && <polyline points={historyPoints} className="chart-line history-line" />}
        {forecastPoints && <polyline points={forecastPoints} className="chart-line forecast-line" />}
        <line x1="319" x2="319" y1="28" y2="190" className="forecast-marker" />
        {history.map((entry, index) => <circle key={`h-${index}`} cx={scaleX(entry.date)} cy={scaleY(entry.value)} r="3.5" className="chart-dot" />)}
        {forecast.map((entry, index) => <circle key={`p-${index}`} cx={scaleX(entry.date)} cy={scaleY(entry.value)} r="3" className="chart-dot forecast-dot" />)}
        <text x="44" y="216" className="chart-label">{days} days ago</text>
        <text x="319" y="216" textAnchor="middle" className="chart-label">Today</text>
        <text x="594" y="216" textAnchor="end" className="chart-label">Next {days} days</text>
      </svg>
      <div className="chart-legend"><span><i className="legend-dot actual" /> Historical</span><span><i className="legend-dot forecast" />XGBoost prediction</span><span className="chart-unit">{unit}</span></div>
    </div>
  )
}

function CowTable({ cows, onSelect, onSort }) {
  return (
    <div className="table-scroll">
      <table className="cow-table">
        <thead><tr>
          <th><button className="sort-button" onClick={() => onSort('id')}>Cow <span>↕</span></button></th>
          <th><button className="sort-button" onClick={() => onSort('dim')}>DIM <span>↕</span></button></th>
          <th>Daily yield</th><th>28-day outlook</th><th>Milking / day</th><th>Herd status</th><th aria-label="View cow" />
        </tr></thead>
        <tbody>
          {cows.map((cow) => (
            <tr key={cow.id} onClick={() => onSelect(cow)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onSelect(cow)}>
              <td><div className="cow-identity"><span className={`cow-avatar avatar-${Number(cow.id) % 4}`}><Icon name="cow" size={17} /></span><span><strong>{cow.name}</strong><small>#{cow.id} · {cow.breed}</small></span></div></td>
              <td>{cow.dim}<span className="table-muted"> days</span></td>
              <td><strong>{cow.dmy.toFixed(1)}</strong><span className="table-muted"> kg</span></td>
              <td>{cow.change === null ? <span className="table-muted">—</span> : <span className={cow.change < 0 ? 'change-negative' : 'change-positive'}>{cow.change > 0 ? '+' : ''}{cow.change.toFixed(1)}%</span>}</td>
              <td>{cow.mf.toFixed(1)} <span className="table-muted">visits</span></td>
              <td><Status value={cow.status} /></td>
              <td><button className="icon-button row-open" aria-label={`View ${cow.name}`} onClick={(event) => { event.stopPropagation(); onSelect(cow) }}><Icon name="chevron" size={17} /></button></td>
            </tr>
          ))}
          {cows.length === 0 && <tr><td className="empty-row" colSpan="7">No cows match those filters.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function App() {
  const [page, setPage] = useState('overview')
  const [cows, setCows] = useState([])
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authMessage, setAuthMessage] = useState('')
  const [authError, setAuthError] = useState('')
  const [observations, setObservations] = useState([])
  const [predictions, setPredictions] = useState([])
  const [alerts, setAlerts] = useState([])
  const [modelState, setModelState] = useState(null)
  const [metricRuns, setMetricRuns] = useState([])
  const [modelTraining, setModelTraining] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [observationTotal, setObservationTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All status')
  const [performanceFilter, setPerformanceFilter] = useState('All performance')
  const [dimMin, setDimMin] = useState('')
  const [dimMax, setDimMax] = useState('')
  const [sortKey, setSortKey] = useState('id')
  const [sortAscending, setSortAscending] = useState(true)
  const [metric, setMetric] = useState('yield')
  const [days, setDays] = useState(28)
  const [selectedCow, setSelectedCow] = useState(null)
  const [notice, setNotice] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const fileInput = useRef(null)

  const refreshWorkspace = useCallback(async () => {
    try {
      const [herd, model, history, forecast, alertResult, summary, metrics] = await Promise.all([
        apiRequest('/herd'),
        apiRequest('/models/status'),
        apiRequest('/observations?days=28'),
        apiRequest('/predictions'),
        apiRequest('/alerts'),
        apiRequest('/data/summary'),
        apiRequest('/reports/metrics'),
      ])
      setCows(herd.cows)
      setModelState(model.model)
      setObservations(history.observations)
      setPredictions(forecast.predictions)
      setAlerts(alertResult.alerts)
      setMetricRuns(metrics.runs)
      setObservationTotal(summary.observations)
      setDataLoading(false)
      return true
    } catch (error) {
      setDataLoading(false)
      if (error.status === 401) {
        setUser(null)
        setAuthError('Your session expired. Sign in again.')
      } else {
        showNotice(error.message)
      }
      return false
    }
  }, [])

  useEffect(() => {
    let active = true
    async function initialize() {
      const params = new URLSearchParams(window.location.search)
      const verificationToken = params.get('verify')
      if (verificationToken) {
        try {
          const result = await apiRequest(`/auth/verify?token=${encodeURIComponent(verificationToken)}`)
          if (active) setAuthMessage(result.message)
        } catch (error) {
          if (active) setAuthError(error.message)
        } finally {
          window.history.replaceState({}, '', window.location.pathname)
        }
      }
      try {
        const result = await apiRequest('/auth/me')
        if (active) {
          setUser(result.user)
          await refreshWorkspace()
        }
      } catch (error) {
        if (active && error.status !== 401) setAuthError(`Backend connection failed: ${error.message}`)
      } finally {
        if (active) setAuthLoading(false)
      }
    }
    initialize()
    return () => { active = false }
  }, [refreshWorkspace])

  const filteredCows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return [...cows]
      .filter((cow) => !query || `${cow.id} ${cow.name} ${cow.breed}`.toLowerCase().includes(query))
      .filter((cow) => statusFilter === 'All status' || cow.status === statusFilter)
      .filter((cow) => dimMin === '' || cow.dim >= Number(dimMin))
      .filter((cow) => dimMax === '' || cow.dim <= Number(dimMax))
      .filter((cow) => performanceFilter === 'All performance' || (performanceFilter === 'Predicted' ? cow.forecast !== null : cow.forecast === null))
      .sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey]), undefined, { numeric: true }) * (sortAscending ? 1 : -1))
  }, [cows, search, statusFilter, performanceFilter, dimMin, dimMax, sortKey, sortAscending])

  const averageYield = cows.length ? cows.reduce((sum, cow) => sum + cow.dmy, 0) / cows.length : 0
  const herdThi = cows.filter((cow) => cow.thi !== null).map((cow) => cow.thi)
  const averageThi = herdThi.length ? herdThi.reduce((sum, value) => sum + value, 0) / herdThi.length : null
  const pageTitle = navigation.find((item) => item.id === page)?.label ?? 'Overview'

  function showNotice(message) {
    setNotice(message)
    window.clearTimeout(showNotice.timeout)
    showNotice.timeout = window.setTimeout(() => setNotice(''), 5000)
  }

  function openPage(nextPage) {
    setPage(nextPage)
    setMobileNav(false)
    setSearch('')
    setStatusFilter('All status')
    setPerformanceFilter('All performance')
    setDimMin('')
    setDimMax('')
  }

  function sortBy(key) {
    if (sortKey === key) setSortAscending((current) => !current)
    else {
      setSortKey(key)
      setSortAscending(true)
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      showNotice('Please choose a CSV file with dated RMS records.')
      return
    }
    try {
      const result = await apiRequest('/data/import', {
        method: 'POST',
        body: JSON.stringify({ csv: await file.text() }),
      })
      if (await refreshWorkspace()) showNotice(result.message)
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'The CSV could not be read.')
    }
  }

  async function exportReport() {
    try {
      await downloadApiFile('/reports/export', 'milksense-herd-report.csv')
      showNotice('Exported the latest herd observations and available predictions.')
    } catch (error) {
      showNotice(error.message)
    }
  }

  async function startTraining() {
    setModelTraining(true)
    try {
      const { runId } = await apiRequest('/models/train', { method: 'POST', body: '{}' })
      showNotice('XGBoost training started. This may take a few minutes.')
      let result = null
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000))
        const status = await apiRequest('/models/status')
        result = status.model
        if (result?.id === runId && result.status !== 'training') break
      }
      await refreshWorkspace()
      if (result?.status === 'completed') showNotice('Training complete. Review time-series validation metrics before using predictions.')
      else if (result?.status === 'failed') showNotice(result.error || 'Model training failed.')
      else showNotice('Training is still running. Check the model status again shortly.')
    } catch (error) {
      showNotice(error.message)
    } finally {
      setModelTraining(false)
    }
  }

  async function logout() {
    try {
      await apiRequest('/auth/logout', { method: 'POST', body: '{}' })
      setUser(null)
      setCows([])
      setObservations([])
      setPredictions([])
      setAlerts([])
      setModelState(null)
    } catch (error) {
      showNotice(error.message)
    }
  }

  async function saveProfile(profile) {
    try {
      const result = await apiRequest('/auth/profile', { method: 'PATCH', body: JSON.stringify(profile) })
      setUser(result.user)
      setProfileOpen(false)
      showNotice('Profile updated.')
    } catch (error) {
      showNotice(error.message)
    }
  }

  if (authLoading) return <AuthScreen loading />
  if (!user) {
    return <AuthScreen
      initialMessage={authMessage}
      initialError={authError}
      onAuthenticated={(authenticatedUser) => {
        setAuthError('')
        setAuthMessage('')
        setUser(authenticatedUser)
        refreshWorkspace()
      }}
    />
  }

  return (
    <div className="app-shell">
      {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Icon name="leaf" size={22} /></div>
          <div><strong>MilkSense<span>AI</span></strong><small>DAIRY INTELLIGENCE</small></div>
        </div>
        <div className="farm-select"><span className="farm-avatar">{user.farmName?.slice(0, 1).toUpperCase() ?? 'F'}</span><span><strong>{user.farmName}</strong><small>Farm workspace</small></span><Icon name="chevron" size={15} /></div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map((item) => <button key={item.id} className={`nav-link ${page === item.id ? 'nav-active' : ''}`} onClick={() => openPage(item.id)}><Icon name={item.icon} size={18} /><span>{item.label}</span>{item.id === 'alerts' && alerts.length > 0 && <span className="nav-count">{alerts.length}</span>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note"><span className="demo-indicator" /><span><strong>{modelState?.status === 'completed' ? 'Model trained' : 'Farm workspace'}</strong><small>{dataLoading ? 'Loading farm data' : `${cows.length} cow records`}</small></span></div>
          <div className="profile-row"><span className="profile-avatar">{user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.email}</small></span><button className="icon-button profile-more" aria-label="Profile options" onClick={() => setProfileOpen(true)}>···</button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Icon name="menu" /></button>
          <div className="breadcrumb"><span>{user.farmName}</span><Icon name="chevron" size={14} /><strong>{pageTitle}</strong></div>
          <div className="topbar-actions">
            <label className="global-search"><Icon name="search" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search cows..." aria-label="Search cows" /><kbd>⌘ K</kbd></label>
            <button className="icon-button top-notifications" aria-label={`Open alerts, ${alerts.length} active`} onClick={() => openPage('alerts')}><Icon name="bell" size={19} />{alerts.length > 0 && <i />}</button>
            <button className="top-avatar" title={user.name} onClick={() => setProfileOpen(true)}>{user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</button>
          </div>
        </header>

        <div className="page-content">
          <div className="demo-banner"><span className="demo-dot" /><span><strong>Farm data workspace</strong><span className="banner-divider">·</span> Predictions appear only after an XGBoost model has been trained and validated on your historical records.</span><button className="sign-out-button" onClick={logout}>Sign out</button></div>
          {page === 'overview' && <Overview cows={filteredCows} total={cows.length} avgYield={averageYield} avgThi={averageThi} alerts={alerts} metric={metric} setMetric={setMetric} days={days} setDays={setDays} search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} performanceFilter={performanceFilter} setPerformanceFilter={setPerformanceFilter} dimMin={dimMin} setDimMin={setDimMin} dimMax={dimMax} setDimMax={setDimMax} observations={observations} predictions={predictions} onSelect={setSelectedCow} onSort={sortBy} onPage={openPage} onExport={exportReport} onImport={() => fileInput.current?.click()} />}
          {page === 'herd' && <HerdPage cows={filteredCows} total={cows.length} search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} performanceFilter={performanceFilter} setPerformanceFilter={setPerformanceFilter} dimMin={dimMin} setDimMin={setDimMin} dimMax={dimMax} setDimMax={setDimMax} onSelect={setSelectedCow} onSort={sortBy} onImport={() => fileInput.current?.click()} />}
          {page === 'predictions' && <PredictionsPage cows={filteredCows} metric={metric} setMetric={setMetric} days={days} setDays={setDays} observations={observations} predictions={predictions} model={modelState} onSelect={setSelectedCow} />}
          {page === 'alerts' && <AlertsPage alerts={alerts} cows={cows} onSelect={setSelectedCow} onNotify={async () => { try { const result = await apiRequest('/alerts/notify', { method: 'POST', body: '{}' }); showNotice(result.message) } catch (error) { showNotice(error.message) } }} />}
          {page === 'data' && <><DataPage total={cows.length} observations={observationTotal} model={modelState} training={modelTraining} onTrain={startTraining} onImport={() => fileInput.current?.click()} /><ModelRunHistory runs={metricRuns} /></>}
          {page === 'reports' && <ReportsPage cows={filteredCows} total={cows.length} onExport={exportReport} onPage={openPage} />}
        </div>
      </main>
      <input ref={fileInput} className="visually-hidden" type="file" accept=".csv,text/csv" onChange={handleUpload} />
      {notice && <div className="toast" role="status"><span className="toast-check"><Icon name="check" size={15} /></span>{notice}<button className="icon-button" aria-label="Dismiss message" onClick={() => setNotice('')}><Icon name="close" size={15} /></button></div>}
      {selectedCow && <CowDetail cow={selectedCow} observations={observations} predictions={predictions} featureImportance={modelState?.featureImportance} onClose={() => setSelectedCow(null)} />}
      {profileOpen && <ProfileDialog user={user} onSave={saveProfile} onClose={() => setProfileOpen(false)} />}
    </div>
  )
}

function PageHeading({ eyebrow, title, description, actions }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{actions}</div></div>
}

function HerdFilters({ search, setSearch, statusFilter, setStatusFilter, performanceFilter, setPerformanceFilter, dimMin, setDimMin, dimMax, setDimMax, placeholder }) {
  return <div className="table-toolbar">
    <label className="table-search"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={placeholder} aria-label="Search herd by name or ID" /></label>
    <label className="dim-filter"><span>DIM</span><input type="number" min="0" placeholder="Min" value={dimMin} onChange={(event) => setDimMin(event.target.value)} aria-label="Minimum days in milk" /><input type="number" min="0" placeholder="Max" value={dimMax} onChange={(event) => setDimMax(event.target.value)} aria-label="Maximum days in milk" /></label>
    <select className="filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by herd status"><option>All status</option><option>Healthy</option><option>Watch</option><option>Alert</option></select>
    <select className="filter-select" value={performanceFilter} onChange={(event) => setPerformanceFilter(event.target.value)} aria-label="Filter by prediction availability"><option>All performance</option><option>Predicted</option><option>Not predicted</option></select>
  </div>
}

function Overview({ cows, total, avgYield, avgThi, alerts, metric, setMetric, days, setDays, search, setSearch, statusFilter, setStatusFilter, performanceFilter, setPerformanceFilter, dimMin, setDimMin, dimMax, setDimMax, observations, predictions, onSelect, onSort, onPage, onExport, onImport }) {
  const climate = observations.reduce((summary, record) => ({
    minTemperature: record.tmin == null ? summary.minTemperature : Math.min(summary.minTemperature, Number(record.tmin)),
    maxTemperature: record.tmax == null ? summary.maxTemperature : Math.max(summary.maxTemperature, Number(record.tmax)),
    minHumidity: record.rhmin == null ? summary.minHumidity : Math.min(summary.minHumidity, Number(record.rhmin)),
    maxHumidity: record.rhmax == null ? summary.maxHumidity : Math.max(summary.maxHumidity, Number(record.rhmax)),
    latestDate: String(record.date) > summary.latestDate ? String(record.date) : summary.latestDate,
  }), { minTemperature: Infinity, maxTemperature: -Infinity, minHumidity: Infinity, maxHumidity: -Infinity, latestDate: '' })
  const temperatureLabel = Number.isFinite(climate.minTemperature) && Number.isFinite(climate.maxTemperature) ? `${climate.minTemperature.toFixed(1)}° — ${climate.maxTemperature.toFixed(1)}°C` : 'No climate records'
  const humidityLabel = Number.isFinite(climate.minHumidity) && Number.isFinite(climate.maxHumidity) ? `${climate.minHumidity.toFixed(0)}% — ${climate.maxHumidity.toFixed(0)}%` : 'No climate records'
  return (
    <>
      <PageHeading eyebrow={pageDateLabel} title="Herd overview" description="A clear picture of production records, predictions, and herd alerts." actions={<><button className="button button-secondary" onClick={onImport}><Icon name="upload" size={16} />Import data</button><button className="button button-primary" onClick={onExport}><Icon name="download" size={16} />Export report</button></>} />
      <div className="metric-grid">
        <MetricCard label="Herd size" value={total.toLocaleString()} unit="cows" caption="In this workspace" icon="cow" tone="blue" trend="All animals" />
        <MetricCard label="Avg. daily yield" value={total ? avgYield.toFixed(1) : '—'} unit="kg / cow" caption="Across latest records" icon="leaf" tone="green" trend="Latest recorded DMY" positive />
        <MetricCard label="Needs attention" value={new Set(alerts.map((alert) => alert.cowId)).size.toString().padStart(2, '0')} unit="cows" caption="Performance or heat risk" icon="bell" tone="amber" trend="Review alerts" onClick={() => onPage('alerts')} />
        <MetricCard label="Avg. heat index" value={avgThi === null ? '—' : avgThi.toFixed(0)} unit="THI" caption="Latest recorded THImax" icon="sun" tone="violet" trend={avgThi === null ? 'Climate data unavailable' : avgThi >= 78 ? 'Elevated conditions' : 'Below alert threshold'} positive={avgThi !== null && avgThi < 78} />
      </div>

      <div className="overview-grid">
        <section className="panel trend-panel">
          <div className="panel-heading"><div><div className="section-kicker">PRODUCTION TREND</div><h2>Herd performance trends</h2><p>Historical records and validated model predictions</p></div><div className="segmented-control" aria-label="Production metric"><button className={metric === 'yield' ? 'segment-active' : ''} onClick={() => setMetric('yield')}>Yield</button><button className={metric === 'frequency' ? 'segment-active' : ''} onClick={() => setMetric('frequency')}>Milking</button><button className={metric === 'fat' ? 'segment-active' : ''} onClick={() => setMetric('fat')}>Fat</button><button className={metric === 'protein' ? 'segment-active' : ''} onClick={() => setMetric('protein')}>Protein</button></div></div>
          <div className="chart-controls"><div className="chart-range"><button className={days === 7 ? 'range-active' : ''} onClick={() => setDays(7)}>7 days</button><button className={days === 14 ? 'range-active' : ''} onClick={() => setDays(14)}>14 days</button><button className={days === 28 ? 'range-active' : ''} onClick={() => setDays(28)}>28 days</button></div><span className="chart-info">Forecast horizon <strong>28 days</strong></span></div>
          <TrendChart metric={metric} days={days} observations={observations} predictions={predictions} />
        </section>
        <section className="panel conditions-panel">
          <div className="panel-heading panel-heading-tight"><div><div className="section-kicker">FARM CONDITIONS</div><h2>Latest conditions</h2></div><span className="live-tag"><i /> DATA</span></div>
          <div className="weather-card"><div className="weather-icon"><Icon name="sun" size={22} /></div><div><strong>{avgThi === null ? '—' : avgThi.toFixed(0)} <small>THI</small></strong><span>Average latest THImax</span></div><span className={`weather-status ${avgThi !== null && avgThi >= 78 ? 'weather-warm' : ''}`}>{avgThi === null ? 'No data' : avgThi >= 78 ? 'Elevated' : 'Below threshold'}</span></div>
          <div className="condition-row"><span>Temperature range</span><strong>{temperatureLabel}</strong></div>
          <div className="condition-row"><span>Relative humidity range</span><strong>{humidityLabel}</strong></div>
          <div className="condition-row"><span>Latest observation</span><strong>{climate.latestDate || 'No records yet'}</strong></div>
          <div className="condition-alert"><span className="condition-alert-icon"><Icon name="sun" size={16} /></span><span><strong>{alerts.length ? `${alerts.length} alerts to review` : 'No active alerts'}</strong><small>Based on recorded THI and available model predictions.</small></span><button aria-label="View alerts" onClick={() => onPage('alerts')}><Icon name="chevron" size={16} /></button></div>
        </section>
      </div>

      <section className="panel herd-panel">
        <div className="panel-heading herd-heading"><div><div className="section-kicker">INDIVIDUAL PERFORMANCE</div><h2>Herd list <span className="count-pill">{cows.length}</span></h2></div><button className="text-button" onClick={() => onPage('herd')}>View all cows <Icon name="arrow" size={15} /></button></div>
        <HerdFilters search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} performanceFilter={performanceFilter} setPerformanceFilter={setPerformanceFilter} dimMin={dimMin} setDimMin={setDimMin} dimMax={dimMax} setDimMax={setDimMax} placeholder="Search by name or cow ID" />
        <CowTable cows={cows.slice(0, 5)} onSelect={onSelect} onSort={onSort} />
        <div className="panel-footnote"><span><i className="demo-dot" />Sample farm records</span><button className="text-button" onClick={() => onPage('herd')}>Explore herd <Icon name="chevron" size={15} /></button></div>
      </section>
      <div className="page-footnote">Predictions are displayed only when produced by a trained model. Review validation metrics before operational use.</div>
    </>
  )
}

function MetricCard({ label, value, unit, caption, icon, tone, trend, positive, onClick }) {
  return <button className={`metric-card metric-${tone} ${onClick ? 'metric-clickable' : ''}`} onClick={onClick} disabled={!onClick}><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon name={icon} size={18} /></span></div><div className="metric-value">{value}<small>{unit}</small></div><div className="metric-bottom"><span>{caption}</span><Sparkline color={tone === 'amber' ? 'amber' : 'green'} downward={tone === 'amber'} /></div><div className={`metric-trend ${positive === false ? 'trend-neutral' : ''}`}>{trend}</div></button>
}

function HerdPage({ cows, total, search, setSearch, statusFilter, setStatusFilter, performanceFilter, setPerformanceFilter, dimMin, setDimMin, dimMax, setDimMax, onSelect, onSort, onImport }) {
  return <><PageHeading eyebrow="ANIMALS & PERFORMANCE" title="Herd" description={`${total} cows in your workspace. Search by ID, DIM, or prediction availability.`} actions={<button className="button button-primary" onClick={onImport}><Icon name="upload" size={16} />Import records</button>} /><section className="panel full-table-panel"><HerdFilters search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} performanceFilter={performanceFilter} setPerformanceFilter={setPerformanceFilter} dimMin={dimMin} setDimMin={setDimMin} dimMax={dimMax} setDimMax={setDimMax} placeholder="Search by name, ID, or breed" /><CowTable cows={cows} onSelect={onSelect} onSort={onSort} /></section><div className="page-footnote">DIM = days in milk. Forecast values are available only after model training.</div></>
}

function PredictionsPage({ cows, metric, setMetric, days, setDays, observations, predictions, model, onSelect }) {
  const [selectedId, setSelectedId] = useState(cows[0]?.id ?? '')
  const selectedCowId = cows.some((cow) => String(cow.id) === String(selectedId)) ? selectedId : (cows[0]?.id ?? '')
  const selectedCow = cows.find((cow) => String(cow.id) === String(selectedCowId))
  const cowPredictions = predictions.filter((prediction) => String(prediction.cowId) === String(selectedCowId))
  const latest = cowPredictions[0]
  const meetsTargets = model?.metrics && Object.values(model.metrics).every((values) => values.meetsTarget)
  const modelLabel = model?.status === 'completed' && model.stale ? 'Retraining required' : model?.status === 'training' ? 'Training in progress' : meetsTargets ? 'Model meets targets' : model?.status === 'completed' ? 'Metrics below target' : 'Model not trained'
  return <><PageHeading eyebrow="28-DAY OUTLOOK" title="Predictions" description="Explore individual-cow performance forecasts produced by the trained XGBoost model." actions={<span className="model-badge"><span />{modelLabel}</span>} />{selectedCow ? <><section className="panel prediction-feature"><div className="panel-heading"><div><div className="section-kicker">COW FORECAST</div><h2>{selectedCow.name} <span className="inline-id">#{selectedCow.id}</span></h2><p>{selectedCow.breed} · {selectedCow.dim} days in milk</p></div><div className="prediction-actions"><select className="filter-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} aria-label="Select cow for prediction">{cows.map((cow) => <option key={cow.id} value={cow.id}>{cow.name} · #{cow.id}</option>)}</select><button className="button button-secondary" onClick={() => onSelect(selectedCow)}>Cow details <Icon name="chevron" size={16} /></button></div></div><div className="prediction-controls"><div className="segmented-control"><button className={metric === 'yield' ? 'segment-active' : ''} onClick={() => setMetric('yield')}>Daily yield</button><button className={metric === 'frequency' ? 'segment-active' : ''} onClick={() => setMetric('frequency')}>Milking</button><button className={metric === 'fat' ? 'segment-active' : ''} onClick={() => setMetric('fat')}>Fat</button><button className={metric === 'protein' ? 'segment-active' : ''} onClick={() => setMetric('protein')}>Protein</button></div><div className="chart-range"><button className={days === 7 ? 'range-active' : ''} onClick={() => setDays(7)}>7d</button><button className={days === 14 ? 'range-active' : ''} onClick={() => setDays(14)}>14d</button><button className={days === 28 ? 'range-active' : ''} onClick={() => setDays(28)}>28d</button></div></div><TrendChart metric={metric} days={days} cow={selectedCow} observations={observations} predictions={predictions} /></section><div className="prediction-cards"><PredictionCard title="Daily milk yield" value={latest ? `${Number(latest.dmy).toFixed(1)} kg` : 'Unavailable'} note={latest ? 'First forecast day' : 'Train a model to generate forecasts'} tone="green" /><PredictionCard title="Fat content" value={latest ? `${Number(latest.fc).toFixed(2)}%` : 'Unavailable'} note="First forecast day" tone="amber" /><PredictionCard title="Protein content" value={latest ? `${Number(latest.pc).toFixed(2)}%` : 'Unavailable'} note="First forecast day" tone="blue" /><PredictionCard title="Milking frequency" value={latest ? `${Number(latest.mf).toFixed(1)} / day` : 'Unavailable'} note="First forecast day" tone="violet" /></div><p className="inline-disclaimer">{model?.status === 'completed' ? 'Validation metrics are available on the Data & models page. Accuracy targets are not guaranteed.' : 'No trained model is available. Import dated historical observations and start model training to generate predictions.'}</p></> : <EmptyState title="No cow records yet" action="Import dated RMS records to build herd predictions." />}</>
}

function PredictionCard({ title, value, note, tone }) {
  return <div className={`prediction-card prediction-${tone}`}><span>{title}</span><strong>{value}</strong><small>{note}</small></div>
}

function AlertsPage({ alerts, cows, onSelect, onNotify }) {
  return <><PageHeading eyebrow="HERD MONITORING" title="Alerts" description="Review cows with elevated THI or model-predicted performance deviations." actions={<button className="button button-secondary" onClick={onNotify}>Email alert digest</button>} /><section className="panel alerts-panel"><div className="panel-heading"><div><div className="section-kicker">NEEDS REVIEW</div><h2>{alerts.length} active alerts</h2><p>Heat-risk flags use THImax ≥ 78; performance flags use model validation error.</p></div></div>{alerts.length ? <div className="alert-list">{alerts.map((alert, index) => <button className="alert-item" key={`${alert.cowId}-${alert.kind}-${index}`} onClick={() => { const cow = cows.find((item) => String(item.id) === String(alert.cowId)); if (cow) onSelect(cow) }}><span className={`alert-symbol ${alert.priority === 'high' ? 'alert-symbol-high' : ''}`}><Icon name={alert.kind === 'heat-stress' ? 'sun' : 'chart'} size={18} /></span><span className="alert-copy"><strong>{alert.kind === 'heat-stress' ? 'Elevated heat-stress risk' : 'Predicted yield deviation'} <small> · Cow {alert.cowId}</small></strong><span>{alert.name} · {alert.message}</span></span><span className="alert-priority">{alert.priority === 'high' ? 'Review' : 'Monitor'}</span><Icon name="chevron" size={17} /></button>)}</div> : <EmptyState title="No active alerts" action="There are no cows flagged in the current dataset." />}</section></>
}

function DataPage({ total, observations, model, training, onTrain, onImport }) {
  const importance = model?.featureImportance ?? {}
  const metricNames = { DMY: 'Daily milk yield', MF: 'Milking frequency', FC: 'Fat content', PC: 'Protein content' }
  return <><PageHeading eyebrow="FARM DATA & MODEL" title="Data & models" description="Import dated RMS and climate records, then train or revalidate the XGBoost model." actions={<button className="button button-primary" onClick={onImport}><Icon name="upload" size={16} />Upload CSV</button>} /><div className="data-grid"><section className="panel import-panel"><div className="section-kicker">RMS & CLIMATE DATA</div><h2>Import historical records</h2><p>Upload dated records from robotic milking systems, RFID, and weather sources. Each row represents one cow on one date.</p><button className="upload-dropzone" onClick={onImport}><span className="upload-icon"><Icon name="upload" size={21} /></span><strong>Choose a CSV file</strong><span>Required: date, cow_id, DMY, MF, FC, PC, DIM</span><small>Optional: MT, RT, Tmax, Tmin, RHmax, RHmin, VP, VPD, THI</small></button><div className="import-help"><strong>Column guide</strong><span><b>DMY</b> daily milk yield · <b>MF</b> milking frequency</span><span><b>FC / PC</b> fat / protein (%) · <b>DIM</b> days in milk</span><span>Climate inputs calculate THImax / THImin when temperature and humidity are provided.</span></div></section><div className="data-side"><section className="panel data-status-panel"><div className="panel-heading panel-heading-tight"><div><div className="section-kicker">WORKSPACE DATA</div><h2>Current dataset</h2></div><span className={`status ${total ? 'status-healthy' : 'status-watch'}`}><span />{total ? 'Connected' : 'Empty'}</span></div><div className="dataset-count"><strong>{total}</strong><span>cow records</span></div><div className="condition-row"><span>Observations</span><strong>{observations}</strong></div><div className="condition-row"><span>Database</span><strong>PostgreSQL</strong></div><div className="condition-row"><span>Model status</span><strong>{model?.stale ? 'Retraining required' : model?.status ?? 'Not trained'}</strong></div><button className="button button-primary train-button" disabled={training || model?.status === 'training' || observations < 30} onClick={onTrain}>{training || model?.status === 'training' ? 'Training model…' : 'Train / revalidate model'}</button>{observations < 30 && <small className="training-hint">At least 30 dated observations are required to start.</small>}</section></div></div><section className="panel model-status-panel model-results"><span className="model-icon"><Icon name="chart" size={19} /></span><div className="section-kicker">MODEL EVALUATION</div><h2>XGBoost time-series validation</h2>{model?.error && <p className="auth-error" role="alert">{model.error}</p>}{model?.status === 'completed' ? <><div className="model-metrics">{Object.entries(model.metrics ?? {}).map(([target, values]) => <div key={target}><strong>{metricNames[target] ?? target}</strong><span>Accuracy {Number(values.accuracyPercent).toFixed(1)}% · R² {Number(values.r2).toFixed(3)} · MAE {Number(values.mae).toFixed(2)}</span><small>{values.meetsTarget ? 'Meets >80% accuracy and R² >0.90 targets' : 'Does not meet the stated accuracy and R² targets'}{model.stale ? ' · Results are stale after new data was imported' : ''}</small></div>)}</div><div className="importance-grid">{Object.entries(importance).map(([target, items]) => <div key={target}><strong>{metricNames[target] ?? target} drivers</strong>{items.slice(0, 5).map((item) => <span key={item.feature}>{item.feature}<b>{(Number(item.importance) * 100).toFixed(1)}%</b></span>)}</div>)}</div></> : <p>{model?.status === 'training' ? 'Training is in progress.' : 'No trained model or evaluation metrics are available. Import historical records to train and validate the model.'}</p>}<span className="model-badge"><span />{model?.status ?? 'Offline'}</span></section><p className="inline-disclaimer">Validation scores are measured from time-series cross-validation and are not guaranteed targets. Predictions remain unavailable until training succeeds.</p></>
}

function ModelRunHistory({ runs }) {
  const targets = { DMY: 'DMY', MF: 'MF', FC: 'FC', PC: 'PC' }
  return <section className="panel model-history">
    <div className="section-kicker">ONGOING VALIDATION</div>
    <h2>Model performance history</h2>
    {runs.length ? <div className="model-history-list">{runs.map((run) => (
      <div key={run.id}>
        <span><strong>{run.status}</strong><time dateTime={run.startedAt}>{String(run.startedAt).replace('T', ' ').slice(0, 19)} UTC</time></span>
        <p>{run.metrics ? Object.entries(run.metrics).map(([target, values]) => `${targets[target] ?? target}: ${Number(values.accuracyPercent).toFixed(1)}% accuracy, R² ${Number(values.r2).toFixed(3)}`).join(' · ') : run.error ?? 'Metrics will be available when training completes.'}</p>
      </div>
    ))}</div> : <p>No model training runs have been recorded.</p>}
  </section>
}

function ReportsPage({ cows, total, onExport, onPage }) {
  return <><PageHeading eyebrow="HERD MANAGEMENT" title="Reports" description="Export current observations and available 28-day model predictions." actions={<button className="button button-primary" onClick={onExport}><Icon name="download" size={16} />Export CSV report</button>} /><section className="panel report-panel"><div className="report-icon"><Icon name="file" size={22} /></div><div><div className="section-kicker">HERD PERFORMANCE REPORT</div><h2>Current workspace report</h2><p>Download the latest recorded measurements, available 28-day predictions, and composition for each cow.</p></div><div className="report-stats"><div><strong>{total}</strong><span>cow records</span></div><div><strong>{cows.filter((cow) => cow.status !== 'Healthy').length}</strong><span>flagged for review</span></div><div><strong>28 days</strong><span>prediction horizon</span></div></div><div className="report-actions"><span>CSV · generated from PostgreSQL observations and model output</span><button className="button button-secondary" onClick={onExport}><Icon name="download" size={16} />Download report</button></div></section><section className="panel report-note"><span className="note-mark">i</span><p><strong>About this report</strong><br />Forecast columns are blank until a model has been trained. Validation metrics and feature importance are available under Data & models.</p><button className="text-button" onClick={() => onPage('data')}>Review model status <Icon name="arrow" size={15} /></button></section></>
}

function CowDetail({ cow, observations, predictions, featureImportance, onClose }) {
  const importantFeatures = featureImportance?.DMY?.slice(0, 3) ?? []
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="cow-detail-modal" role="dialog" aria-modal="true" aria-labelledby="cow-detail-title"><div className="modal-header"><div className="cow-identity"><span className="cow-avatar avatar-1"><Icon name="cow" size={19} /></span><span><small>INDIVIDUAL COW</small><strong id="cow-detail-title">{cow.name} <span className="inline-id">#{cow.id}</span></strong></span></div><button className="icon-button" aria-label="Close cow details" onClick={onClose}><Icon name="close" /></button></div><div className="cow-facts"><span><small>Breed</small><strong>{cow.breed}</strong></span><span><small>Days in milk</small><strong>{cow.dim} days</strong></span><span><small>Herd status</small><Status value={cow.status} /></span></div><div className="detail-chart"><div className="section-kicker">HISTORICAL & 28-DAY OUTLOOK</div><TrendChart metric="yield" days={28} cow={cow} observations={observations} predictions={predictions} /></div><div className="detail-composition"><div><span>Daily yield</span><strong>{Number(cow.dmy).toFixed(1)} <small>kg</small></strong></div><div><span>Fat content</span><strong>{Number(cow.fat).toFixed(2)}<small>%</small></strong></div><div><span>Protein</span><strong>{Number(cow.protein).toFixed(2)}<small>%</small></strong></div><div><span>Milking frequency</span><strong>{Number(cow.mf).toFixed(1)}<small>/ day</small></strong></div></div><div className="feature-box"><div><div className="section-kicker">MODEL CONTEXT</div><strong>{importantFeatures.length ? 'Top DMY prediction drivers' : 'Feature importance unavailable'}</strong></div><p>{importantFeatures.length ? importantFeatures.map((item) => `${item.feature} (${(Number(item.importance) * 100).toFixed(1)}%)`).join(' · ') : 'Train a model on historical data to calculate feature importance.'}</p></div></section></div>
}

function ProfileDialog({ user, onSave, onClose }) {
  const [name, setName] = useState(user.name)
  const [farmName, setFarmName] = useState(user.farmName)
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title"><div className="modal-header"><h2 id="profile-title">Profile and farm</h2><button className="icon-button" aria-label="Close profile" onClick={onClose}><Icon name="close" /></button></div><form onSubmit={(event) => { event.preventDefault(); onSave({ name, farmName }) }}><label>Full name<input required maxLength="120" value={name} onChange={(event) => setName(event.target.value)} /></label><label>Farm or organization<input required maxLength="160" value={farmName} onChange={(event) => setFarmName(event.target.value)} /></label><label>Email address<input disabled value={user.email} /></label><button className="button button-primary">Save profile</button></form></section></div>
}

function EmptyState({ title, action }) {
  return <div className="empty-state"><span><Icon name="cow" size={22} /></span><strong>{title}</strong><p>{action}</p></div>
}

export default App
