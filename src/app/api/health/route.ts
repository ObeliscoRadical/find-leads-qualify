import { NextResponse } from 'next/server'
import { getDb } from '@/db'
import { sql } from 'drizzle-orm'
import { limiters, applyRateLimit, getClientIdentifier } from '@/lib/rate-limit'

export async function GET(request: Request) {
  const { response, result } = applyRateLimit(request, limiters.apiDefault, getClientIdentifier(request))
  if (response) return response

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: 'unknown',
    uptime: process.uptime(),
  }

  try {
    const db = getDb()
    await db.execute(sql`SELECT 1`)
    health.database = 'ok'
  } catch {
    health.database = 'error'
    health.status = 'degraded'
  }

  return NextResponse.json(health, {
    status: health.status === 'ok' ? 200 : 503,
    headers: { 'X-RateLimit-Remaining': String(result.remaining) },
  })
}