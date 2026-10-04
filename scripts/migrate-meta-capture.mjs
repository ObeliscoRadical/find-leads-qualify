import fs from 'node:fs/promises'
import postgres from 'postgres'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const sql = postgres(process.env.DATABASE_URL, { max: 1 })
try {
  const statements = (await fs.readFile(new URL('../drizzle/0001_optimal_maginty.sql', import.meta.url), 'utf8')).split('--> statement-breakpoint')
  await sql.begin(async tx => {
    await tx`SET LOCAL lock_timeout = '5s'`
    for (const statement of statements) if (statement.trim()) await tx.unsafe(statement)
  })
  console.log('Meta capture schema migration applied.')
} catch {
  console.error('Migration failed; transaction was rolled back.')
  process.exitCode = 1
} finally { await sql.end() }
