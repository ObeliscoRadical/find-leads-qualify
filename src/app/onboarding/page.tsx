'use client'

import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

type Path = 'nif' | 'manual' | 'skip'

export default function OnboardingPage() {
  const router = useRouter()
  const [path, setPath] = useState<Path>('nif')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [company, setCompany] = useState({
    organizationName: '',
    nif: '',
    cae: '',
    nicho: '',
    description: '',
  })

  async function lookupCompany() {
    setError('')
    setLookupLoading(true)
    const response = await fetch(`/api/onboarding/company-lookup?nif=${encodeURIComponent(company.nif)}`)
    const body = await response.json().catch(() => null)
    setLookupLoading(false)

    if (!response.ok) {
      const fallback = response.status === 503 ? ' Podes continuar pelo modo Manual sem depender do VIES.' : ''
      setError(`${body?.error || 'Não foi possível consultar o NIF.'}${fallback}`)
      return
    }

    setCompany((current) => ({
      ...current,
      organizationName: body.company.name || current.organizationName,
    }))
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')

    const payload =
      path === 'skip'
        ? { path }
        : path === 'manual'
          ? {
              path,
              organizationName: company.organizationName || undefined,
              nicho: company.nicho,
              description: company.description,
            }
          : { path, ...company }

    const response = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => null)
      setError(body?.error || 'Não foi possível guardar o onboarding.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="app-shell">
      <section className="onboarding">
        <div>
          <p className="eyebrow">Onboarding</p>
          <h1>Define o contexto comercial</h1>
          <p className="muted">Escolhe como queres iniciar a segmentação. Podes completar ou corrigir estes dados depois.</p>
        </div>

        <div className="path-grid">
          {[
            ['nif', 'NIF / CAE', 'Consultar dados e preencher uma base segura.'],
            ['manual', 'Manual', 'Descrever o nicho com as tuas palavras, sem consulta externa.'],
            ['skip', 'Saltar', 'Entrar com configuração genérica.'],
          ].map(([value, title, text]) => (
            <button
              type="button"
              key={value}
              className={`path-card ${path === value ? 'active' : ''}`}
              onClick={() => setPath(value as Path)}
            >
              <strong>{title}</strong>
              <span>{text}</span>
            </button>
          ))}
        </div>

        <form className="form onboarding-form" onSubmit={onSubmit}>
          {path === 'nif' ? (
            <>
              <label>
                NIF
                <div className="inline-input">
                  <input
                    value={company.nif}
                    onChange={(event) => setCompany({ ...company, nif: event.target.value.replace(/\D/g, '') })}
                    required
                    minLength={9}
                    maxLength={9}
                  />
                  <button type="button" className="secondary-button" onClick={lookupCompany} disabled={lookupLoading}>
                    {lookupLoading ? 'A consultar...' : 'Consultar'}
                  </button>
                </div>
              </label>
              <label>
                Nome da organização
                <input
                  value={company.organizationName}
                  onChange={(event) => setCompany({ ...company, organizationName: event.target.value })}
                  required
                />
              </label>
              <label>
                CAE
                <input
                  value={company.cae}
                  onChange={(event) => setCompany({ ...company, cae: event.target.value })}
                  placeholder="O EU VIES não fornece CAE; preenche manualmente se souberes."
                />
              </label>
            </>
          ) : null}

          {path !== 'skip' ? (
            <>
              <label>
                Nicho
                <input
                  value={company.nicho}
                  onChange={(event) => setCompany({ ...company, nicho: event.target.value })}
                  required={path === 'manual'}
                  placeholder="Ex: clínicas dentárias premium em Lisboa"
                />
              </label>
              <label>
                Descrição comercial
                <textarea
                  value={company.description}
                  onChange={(event) => setCompany({ ...company, description: event.target.value })}
                  required={path === 'manual'}
                  rows={5}
                  placeholder="Quem vendes, que resultado prometes e que clientes queres captar."
                />
              </label>
            </>
          ) : (
            <p className="skip-copy">Vamos usar um perfil genérico para começares já. A qualidade da segmentação melhora quando adicionares o nicho.</p>
          )}

          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" disabled={loading}>
            {loading ? 'A guardar...' : 'Concluir onboarding'}
          </button>
        </form>
      </section>
    </main>
  )
}
