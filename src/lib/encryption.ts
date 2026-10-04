import crypto from 'crypto'
import { getEnv, resetEnvCache } from '@/lib/env'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16 // 128 bits
const AUTH_TAG_LENGTH = 16 // 128 bits
const PBKDF2_ITERATIONS = 100_000 // OWASP 2024 recommendation
const KEY_LENGTH = 32 // 256 bits
const SALT_LENGTH = 16

let cachedKey: Buffer | null = null
let cachedSalt: Buffer | null = null

/**
 * Resets the encryption cache - for testing only.
 * Call this after modifying process.env in tests.
 */
export function resetEncryptionCache(): void {
  cachedKey = null
  cachedSalt = null
  resetEnvCache()
}

/**
 * Derive encryption key using PBKDF2 with a stored salt.
 * Salt is generated once on first run and persisted in ENCRYPTION_SALT env var.
 * If ENCRYPTION_SALT is not set, a random salt is generated and logged (dev only).
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey

  const env = getEnv()
  let salt: Buffer

  if (env.ENCRYPTION_SALT) {
    salt = Buffer.from(env.ENCRYPTION_SALT, 'hex')
    if (salt.length !== SALT_LENGTH) {
      throw new Error(`ENCRYPTION_SALT must be ${SALT_LENGTH * 2} hex chars (${SALT_LENGTH} bytes)`)
    }
  } else {
    // Dev fallback - generate and warn
    salt = crypto.randomBytes(SALT_LENGTH)
    if (env.NODE_ENV !== 'production') {
      console.warn(
        `[encryption] ENCRYPTION_SALT not set. Generated temporary salt: ${salt.toString('hex')}. ` +
          `Add ENCRYPTION_SALT="${salt.toString('hex')}" to your .env for persistence.`
      )
    }
  }

  cachedSalt = salt
  cachedKey = crypto.pbkdf2Sync(env.ENCRYPTION_KEY, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256')
  return cachedKey
}

/**
 * Encrypts a plaintext string using AES-256-GCM with PBKDF2-derived key.
 * Output format: `saltHex:ivHex:authTagHex:encryptedHex`
 * Salt is included so decryption works across restarts without env salt.
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return ''

  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  const salt = cachedSalt || crypto.randomBytes(SALT_LENGTH)
  return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * Decrypts a ciphertext string produced by `encrypt`.
 * Expects format: `saltHex:ivHex:authTagHex:encryptedHex`
 * Verifies auth tag (integrity + authenticity).
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ''

  const parts = ciphertext.split(':')
  if (parts.length !== 4) {
    throw new Error('Invalid ciphertext format (expected salt:iv:authTag:encrypted)')
  }

  const [saltHex, ivHex, authTagHex, encryptedHex] = parts
  const salt = Buffer.from(saltHex, 'hex')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')

  // Re-derive key with the salt from ciphertext
  const env = getEnv()
  const key = crypto.pbkdf2Sync(env.ENCRYPTION_KEY, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256')

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Rotate encryption key: decrypt with old key, re-encrypt with new key.
 * Use when ENCRYPTION_KEY is changed. Provide old key via env ENCRYPTION_KEY_OLD.
 */
export async function rotateEncryption(
  decryptFn: (ciphertext: string) => string,
  encryptFn: (plaintext: string) => string
): Promise<{ rotated: number; failed: number }> {
  // This is a placeholder for a migration script that would:
  // 1. Fetch all encrypted rows from DB
  // 2. Decrypt with old key (using ENCRYPTION_KEY_OLD env)
  // 3. Re-encrypt with new key (current ENCRYPTION_KEY)
  // 4. Update DB
  // Implementation depends on your migration strategy.
  return { rotated: 0, failed: 0 }
}