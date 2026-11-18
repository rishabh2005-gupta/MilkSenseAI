const numericFields = ['dim', 'dmy', 'mf', 'fc', 'pc', 'mt', 'rt', 'tmax', 'tmin', 'rhmax', 'rhmin', 'vp', 'vpd', 'thiMax', 'thiMin']

const aliases = {
  cowId: ['cowid', 'id', 'animalid', 'rfid'],
  cowName: ['name', 'cowname', 'animalname'],
  breed: ['breed'],
  recordedAt: ['date', 'datetime', 'timestamp', 'recordedat', 'recorddate'],
  dim: ['dim', 'daysinmilk'],
  dmy: ['dmy', 'dailymilkyield', 'milkyield'],
  mf: ['mf', 'milkingfrequency', 'milkingsperday'],
  fc: ['fc', 'fat', 'fatcontent', 'fatcontentpercent'],
  pc: ['pc', 'protein', 'proteincontent', 'proteincontentpercent'],
  mt: ['mt', 'milkingtemperature', 'milktemperature'],
  rt: ['rt', 'ruminationtime'],
  tmax: ['tmax', 'maxtemperature'],
  tmin: ['tmin', 'mintemperature'],
  rhmax: ['rhmax', 'maxrelativehumidity'],
  rhmin: ['rhmin', 'minrelativehumidity'],
  vp: ['vp', 'vapourpressure', 'vaporpressure'],
  vpd: ['vpd', 'vapourpressuredeficit', 'vaporpressuredeficit'],
  thiMax: ['thimax', 'thi', 'temperaturehumidityindex'],
  thiMin: ['thimin'],
}

const headerKey = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        cell += character
      }
    } else if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(cell.trim())
      cell = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += character
    }
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.')
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  if (rows.length < 2) throw new Error('CSV must include a header row and at least one data row.')
  const headers = rows[0].map(headerKey)
  const columnIndexes = Object.fromEntries(
    Object.entries(aliases).map(([field, names]) => [field, headers.findIndex((header) => names.includes(header))]),
  )
  const required = ['cowId', 'recordedAt', 'dmy', 'mf', 'fc', 'pc', 'dim']
  const missing = required.filter((field) => columnIndexes[field] < 0)
  if (missing.length) throw new Error(`Missing required columns: ${missing.map((field) => aliases[field][0]).join(', ')}.`)
  return rows.slice(1).map((values, offset) => {
    const rowData = {}
    for (const [field, columnIndex] of Object.entries(columnIndexes)) {
      if (columnIndex >= 0) rowData[field] = values[columnIndex] ?? ''
    }
    try {
      return normalizeObservation(rowData)
    } catch (error) {
      throw new Error(`row ${offset + 2}: ${error.message}`)
    }
  })
}

export function normalizeObservation(input) {
  const cowId = String(input.cowId ?? '').trim()
  const date = new Date(input.recordedAt)
  if (!cowId || cowId.length > 100) throw new Error('a cow ID of at most 100 characters is required.')
  if (!input.recordedAt || Number.isNaN(date.getTime())) throw new Error('a valid observation date is required.')
  const recordedAt = date.toISOString().slice(0, 10)
  const normalized = {
    cowId,
    cowName: input.cowName ? String(input.cowName).trim().slice(0, 120) : null,
    breed: input.breed ? String(input.breed).trim().slice(0, 120) : null,
    recordedAt,
  }
  for (const field of numericFields) {
    const value = input[field] === '' || input[field] === undefined || input[field] === null ? null : Number(input[field])
    if (value !== null && !Number.isFinite(value)) throw new Error(`${field} must be a finite number.`)
    normalized[field] = value
  }
  for (const field of ['dim', 'dmy', 'mf', 'fc', 'pc']) {
    if (normalized[field] === null) throw new Error(`${field} is required.`)
  }
  if (normalized.dim < 0 || normalized.dmy < 0 || normalized.mf < 0) {
    throw new Error('DIM, DMY, and MF cannot be negative.')
  }
  if (normalized.rhmax !== null && (normalized.rhmax < 0 || normalized.rhmax > 100)) {
    throw new Error('RHmax must be between 0 and 100.')
  }
  if (normalized.rhmin !== null && (normalized.rhmin < 0 || normalized.rhmin > 100)) {
    throw new Error('RHmin must be between 0 and 100.')
  }
  if (normalized.tmax !== null && normalized.rhmax !== null) {
    normalized.thiMax = 0.8 * normalized.tmax + (normalized.rhmax / 100) * (normalized.tmax - 14.4) + 46.4
  }
  if (normalized.tmin !== null && normalized.rhmin !== null) {
    normalized.thiMin = 0.8 * normalized.tmin + (normalized.rhmin / 100) * (normalized.tmin - 14.4) + 46.4
  }
  return normalized
}

export function observationValues(observation) {
  return [
    observation.farmId,
    observation.cowId,
    observation.cowName,
    observation.breed,
    observation.recordedAt,
    ...numericFields.map((field) => observation[field]),
  ]
}
