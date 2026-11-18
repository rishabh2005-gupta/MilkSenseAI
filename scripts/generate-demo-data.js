import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createDemoObservations, serializeDemoCsv } from '../server/demo-data.js'

const destination = resolve(process.argv[2] ?? 'data/demo-observations.csv')
const observations = createDemoObservations()

await mkdir(dirname(destination), { recursive: true })
await writeFile(destination, `${serializeDemoCsv(observations)}\r\n`, 'utf8')
console.log(`Created ${observations.length} synthetic observations at ${destination}.`)
