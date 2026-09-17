import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { getEnv } from '@/lib/env'
import * as schema from './schema'

let db: ReturnType<typeof drizzle> | null = null

export function getDb() {
  if (!db) {
    const sql = postgres(getEnv().DATABASE_URL)
    db = drizzle({ client: sql, schema })
  }
  return db
}

export type Database = ReturnType<typeof drizzle>
