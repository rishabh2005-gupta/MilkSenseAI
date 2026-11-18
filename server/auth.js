import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)

export const hashToken = (token) => createHmac('sha256', process.env.SESSION_SECRET).update(token).digest('hex')

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
    throw new Error('Password must be between 12 and 200 characters.')
  }
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

export async function verifyPassword(password, storedHash) {
  const [algorithm, saltHex, hashHex] = String(storedHash).split('$')
  if (algorithm !== 'scrypt' || !saltHex || !hashHex || typeof password !== 'string') return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function createToken() {
  return randomBytes(32).toString('base64url')
}

export function smtpConfigured(config) {
  return Boolean(config.smtpHost && config.smtpFrom)
}
