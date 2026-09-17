import { ZodError } from 'zod'

export function jsonError(message: string, status = 400, details?: unknown) {
  return Response.json({ error: message, details }, { status })
}

export async function parseJson<T>(request: Request, schema: { parse: (input: unknown) => T }) {
  try {
    const body = await request.json()
    return { data: schema.parse(body), error: null as null }
  } catch (error) {
    if (error instanceof ZodError) {
      return { data: null, error: jsonError('Dados inválidos.', 422, error.flatten()) }
    }
    return { data: null, error: jsonError('JSON inválido.', 400) }
  }
}
