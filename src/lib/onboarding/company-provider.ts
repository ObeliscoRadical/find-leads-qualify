export type CompanyLookupResult = {
  name: string
  nif: string
  provider: string
}

export interface CompanyLookupProvider {
  lookup(nif: string): Promise<CompanyLookupResult | null>
}

type Fetcher = typeof fetch

type ViesResponse = {
  isValid?: boolean
  name?: string
  vatNumber?: string
}

const VIES_TIMEOUT_MS = 8000

export class CompanyLookupUnavailableError extends Error {
  constructor(message = 'Serviço VIES indisponível.') {
    super(message)
    this.name = 'CompanyLookupUnavailableError'
  }
}

export function isValidPortugueseNif(nif: string) {
  if (!/^\d{9}$/.test(nif)) return false

  const digits = nif.split('').map(Number)
  const sum = digits.slice(0, 8).reduce((total, digit, index) => total + digit * (9 - index), 0)
  const remainder = sum % 11
  const checkDigit = remainder < 2 ? 0 : 11 - remainder

  return digits[8] === checkDigit
}

export class ViesCompanyProvider implements CompanyLookupProvider {
  private readonly fetcher: Fetcher
  private readonly timeoutMs: number

  constructor(fetcher: Fetcher = fetch, timeoutMs = VIES_TIMEOUT_MS) {
    this.fetcher = fetcher
    this.timeoutMs = timeoutMs
  }

  async lookup(nif: string): Promise<CompanyLookupResult | null> {
    if (!isValidPortugueseNif(nif)) return null

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    let response: Response
    try {
      response = await this.fetcher(`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/PT/vat/${nif}`, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      })
    } catch (error) {
      throw new CompanyLookupUnavailableError(error instanceof Error ? error.message : undefined)
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      throw new CompanyLookupUnavailableError(`VIES respondeu com estado ${response.status}.`)
    }

    let body: ViesResponse
    try {
      body = (await response.json()) as ViesResponse
    } catch {
      throw new CompanyLookupUnavailableError('VIES devolveu uma resposta inválida.')
    }

    if (body.isValid === false) return null
    if (body.isValid !== true || typeof body.name !== 'string' || !body.name.trim()) {
      throw new CompanyLookupUnavailableError('VIES devolveu dados incompletos.')
    }

    return {
      name: body.name.trim(),
      nif: normalizeVatNumber(body.vatNumber) || nif,
      provider: 'EU VIES',
    }
  }
}

export function getCompanyLookupProvider(): CompanyLookupProvider {
  return new ViesCompanyProvider()
}

function normalizeVatNumber(value: string | undefined) {
  const normalized = value?.replace(/^PT/i, '').replace(/\D/g, '') || ''
  return /^\d{9}$/.test(normalized) ? normalized : null
}
