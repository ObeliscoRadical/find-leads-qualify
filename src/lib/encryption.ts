import crypto from 'crypto'
import { getEnv } from '@/lib/env'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16 // 128 bits
const AUTH_TAG_LENGTH = 16 // 128 bits

// Derive a 32-byte key from the configured ENCRYPTION_KEY using SHA-256
function getKey(): Buffer {
  return crypto.createHash('sha256').update(getEnv().ENCRYPTION_KEY).digest()
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Output format: `ivHex:authTagHex:encryptedHex`
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return ''
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * Decrypts a ciphertext string produced by `encrypt`.
 * Expects format: `ivHex:authTagHex:encryptedHex`
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ''
  const parts = ciphertext.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format')
  }

  const [ivHex, authTagHex, encryptedHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
