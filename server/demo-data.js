import { observationSchema } from '../shared/observation-schema.js'
import { normalizeObservation } from './data.js'

const cowNames = ['Daisy', 'Clover', 'Maple', 'Willow', 'Fern', 'Rosie', 'Poppy', 'Juniper']
const breeds = [
  { name: 'Holstein', yieldOffset: 0, fatOffset: 0 },
  { name: 'Jersey', yieldOffset: -3.2, fatOffset: 0.55 },
  { name: 'Holstein Friesian', yieldOffset: 1.4, fatOffset: 0.2 },
]

const round = (value) => Number(value.toFixed(2))

export function createDemoObservations({ days = 60, endDate = new Date() } = {}) {
  if (!Number.isInteger(days) || days < 6 || days > 365) {
    throw new Error('Demo data must cover between 6 and 365 consecutive days.')
  }
  const end = new Date(endDate)
  if (Number.isNaN(end.getTime())) throw new Error('A valid demo end date is required.')
  const lastDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())

  return cowNames.flatMap((cowName, cowIndex) => {
    const breed = breeds[cowIndex % breeds.length]
    return Array.from({ length: days }, (_, dayIndex) => {
      const date = new Date(lastDay - (days - dayIndex - 1) * 86_400_000)
      const seasonal = Math.sin(dayIndex / 7 + cowIndex * 0.6)
      const dailyVariation = Math.sin(dayIndex / 2.4 + cowIndex) * 0.2
      const tmax = 27 + Math.sin(dayIndex / 5 + cowIndex * 0.2) * 2.5
      const tmin = 16 + Math.sin(dayIndex / 6 + cowIndex * 0.2) * 1.8
      const rhmax = 68 + Math.sin(dayIndex / 8 + cowIndex * 0.3) * 7
      const rhmin = 47 + Math.sin(dayIndex / 9 + cowIndex * 0.3) * 6

      return normalizeObservation({
        cowId: `DEMO-${String(cowIndex + 1).padStart(3, '0')}`,
        cowName,
        breed: breed.name,
        recordedAt: date.toISOString().slice(0, 10),
        dim: 75 + cowIndex * 12 + dayIndex,
        dmy: round(27 + breed.yieldOffset + cowIndex * 0.45 + dayIndex * 0.025 + seasonal * 1.05 + dailyVariation),
        mf: round(2.6 + cowIndex * 0.045 + seasonal * 0.12 + dailyVariation * 0.2),
        fc: round(3.65 + breed.fatOffset + seasonal * 0.07 + dailyVariation * 0.08),
        pc: round(3.18 + cowIndex * 0.025 + seasonal * 0.035 + dailyVariation * 0.04),
        mt: round(38.4 + seasonal * 0.25),
        rt: round(445 + cowIndex * 9 + seasonal * 17 + dailyVariation * 12),
        tmax: round(tmax),
        tmin: round(tmin),
        rhmax: round(rhmax),
        rhmin: round(rhmin),
        vp: round(12.5 + seasonal * 1.1),
        vpd: round(1.45 + Math.sin(dayIndex / 6 + cowIndex) * 0.25),
      })
    })
  })
}

export function serializeDemoCsv(observations) {
  const escapeCsv = (value) => {
    const text = String(value ?? '')
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  const headers = observationSchema.map((field) => field.csvHeader)
  const rows = observations.map((observation) =>
    observationSchema.map((field) => observation[field.key]),
  )
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n')
}
