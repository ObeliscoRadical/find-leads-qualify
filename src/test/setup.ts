// Vitest setup file - runs before all tests
import { vi, beforeEach } from 'vitest'

// Mock environment variables for all tests
vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test')
vi.stubEnv('JWT_SECRET', 'test-secret-minimum-32-characters-long-for-testing')
vi.stubEnv('ENCRYPTION_KEY', 'test-encryption-key-minimum-32-chars-long-for-testing')
vi.stubEnv('NODE_ENV', 'test')
vi.stubEnv('META_APP_ID', 'test-app-id')
vi.stubEnv('META_APP_SECRET', 'test-app-secret')
vi.stubEnv('META_REDIRECT_URI', 'http://localhost:3000/api/meta/oauth/callback')
vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')

// Reset modules before each test to avoid state leakage
beforeEach(() => {
  vi.resetModules()
})