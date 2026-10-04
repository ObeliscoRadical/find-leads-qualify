import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'node:crypto'
import { resetEncryptionCache } from '@/lib/encryption'

describe('Encryption (AES-256-GCM + PBKDF2)', () => {
  beforeEach(() => {
    resetEncryptionCache()
    // Set required env vars for all tests
    process.env.ENCRYPTION_KEY = 'test-encryption-key-minimum-32-chars-long'
    vi.stubEnv('NODE_ENV', 'test')
    delete process.env.ENCRYPTION_SALT
  })

  // Import the module fresh for each test to avoid cache issues
  async function getMod() {
    vi.resetModules()
    resetEncryptionCache()
    process.env.ENCRYPTION_KEY = 'test-encryption-key-minimum-32-chars-long'
    vi.stubEnv('NODE_ENV', 'test')
    delete process.env.ENCRYPTION_SALT
    const mod = await import('@/lib/encryption')
    return { encrypt: mod.encrypt, decrypt: mod.decrypt }
  }

  it('encrypts and decrypts round-trip', async () => {
    const { encrypt, decrypt } = await getMod()
    const plaintext = 'secret-access-token-12345'
    const ciphertext = encrypt(plaintext)
    expect(ciphertext.length).toBeGreaterThan(plaintext.length)
    expect(ciphertext).toContain(':')

    const decrypted = decrypt(ciphertext)
    expect(decrypted).toBe(plaintext)
  })

  it('handles empty string', async () => {
    const { encrypt, decrypt } = await getMod()
    expect(encrypt('')).toBe('')
    expect(decrypt('')).toBe('')
  })

  it('handles unicode and special characters', async () => {
    const { encrypt, decrypt } = await getMod()
    const plaintext = 'token-with-🔐-émojis-and-áçõrés'
    const ciphertext = encrypt(plaintext)
    const decrypted = decrypt(ciphertext)
    expect(decrypted).toBe(plaintext)
  })

  it('produces different ciphertext each time (random IV)', async () => {
    const { encrypt, decrypt } = await getMod()
    const plaintext = 'same-input'
    const c1 = encrypt(plaintext)
    const c2 = encrypt(plaintext)
    expect(c1).not.toEqual(c2)
    expect(decrypt(c1)).toBe(plaintext)
    expect(decrypt(c2)).toBe(plaintext)
  })

  it('detects tampering (auth tag mismatch)', async () => {
    const { encrypt, decrypt } = await getMod()
    const plaintext = 'important-data'
    const ciphertext = encrypt(plaintext)
    const parts = ciphertext.split(':')
    const encryptedHex = parts[3]
    const tamperedEncrypted = encryptedHex.slice(0, -1) + (encryptedHex.endsWith('a') ? 'b' : 'a')
    const tampered = parts[0] + ':' + parts[1] + ':' + parts[2] + ':' + tamperedEncrypted
    expect(() => decrypt(tampered)).toThrow(/Invalid ciphertext|Unsupported state|Authentication failed|Invalid encoding/)
  })

  it('rejects invalid format', async () => {
    const { decrypt } = await getMod()
    expect(() => decrypt('invalid')).toThrow(/Invalid ciphertext format/)
    expect(() => decrypt('a:b:c')).toThrow(/Invalid ciphertext format/)
    expect(() => decrypt('a:b:c:d:e')).toThrow(/Invalid ciphertext format/)
  })

  it('decrypts tokens encrypted by the previous production version', async () => {
    const { decrypt } = await getMod()
    const key = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY!).digest()
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = cipher.update('existing-meta-token', 'utf8', 'hex') + cipher.final('hex')
    const legacy = `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted}`
    expect(decrypt(legacy)).toBe('existing-meta-token')
  })

  it('uses a configured salt and decrypts after restarting', async () => {
    const { encrypt } = await getMod()
    process.env.ENCRYPTION_SALT = 'a'.repeat(32)
    const mod = await import('@/lib/encryption')
    mod.resetEncryptionCache()
    const ciphertext = encrypt('persistent-token')
    expect(ciphertext.split(':')[0]).toBe('a'.repeat(32))
    delete process.env.ENCRYPTION_SALT
    mod.resetEncryptionCache()
    expect(mod.decrypt(ciphertext)).toBe('persistent-token')
  })

  it('rejects a salt that has the wrong length', async () => {
    const { encrypt } = await getMod()
    process.env.ENCRYPTION_SALT = 'a'.repeat(64)
    const mod = await import('@/lib/encryption')
    mod.resetEncryptionCache()
    expect(() => encrypt('token')).toThrow()
  })

  it('long plaintext (10KB)', async () => {
    const { encrypt, decrypt } = await getMod()
    const plaintext = 'x'.repeat(10_000)
    const ciphertext = encrypt(plaintext)
    const decrypted = decrypt(ciphertext)
    expect(decrypted).toBe(plaintext)
  })
})