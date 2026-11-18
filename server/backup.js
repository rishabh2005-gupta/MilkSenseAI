import 'dotenv/config'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.')
  process.exit(1)
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backupDirectory = resolve(root, process.env.BACKUP_DIR ?? 'backups')
const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const destination = resolve(backupDirectory, `milksense-${timestamp}.dump`)

await mkdir(backupDirectory, { recursive: true })
const backup = spawn(process.env.PG_DUMP_EXECUTABLE ?? 'pg_dump', [
  '--format=custom',
  '--no-owner',
  '--file',
  destination,
  process.env.DATABASE_URL,
], { stdio: 'inherit' })

backup.on('error', (error) => {
  console.error(`Could not start pg_dump: ${error.message}`)
  process.exitCode = 1
})
backup.on('close', (code) => {
  if (code !== 0) {
    console.error(`pg_dump failed with exit code ${code}.`)
    process.exitCode = 1
  } else {
    console.log(`Database backup created: ${destination}`)
  }
})
