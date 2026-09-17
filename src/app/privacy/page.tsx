'use client'

import { useCallback, useEffect, useState } from 'react'

type PrivacyResponse = {
  policy: {
    organizationId: string
    version: number | null
    content: string
    acceptedAt: string | null
    createdAt: string
  } | null
  generatedContent: string
  organization: {
    name: string
    nif: string | null
    cae: string | null
    nicho: string | null
    description: string | null
    timezone: string | null
  }
}

export default function PrivacyPage() {
  const [data, setData] = useState<PrivacyResponse | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadPolicy = useCallback(async () => {
    const response = await fetch('/api/privacy')
    const body = await response.json().catch(() => null)
    setLoading(false)
    if (!response.ok) {
      setMessage(body?.error || 'Não foi possível carregar a política.')
      return
    }
    setData(body)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPolicy()
  }, [loadPolicy])

  async function savePolicy() {
    setSaving(true)
    setMessage('')
    const response = await fetch('/api/privacy', { method: 'POST' })
    const body = await response.json().catch(() => null)
    setSaving(false)
    if (!response.ok) {
      setMessage(body?.error || 'Não foi possível guardar a política.')
      return
    }
    setData((current) => current && { ...current, policy: body.policy })
    setMessage('Política RGPD guardada.')
  }

  const content = data?.policy?.content || data?.generatedContent || ''
  const version = data?.policy?.version || 0

  return (
    <main className="app-shell">
      <section className="dashboard privacy-workbench">
        <div className="page-heading">
          <div>
            <p className="eyebrow">RGPD</p>
            <h1>Política de privacidade</h1>
            <p className="muted">Gera uma política determinística a partir dos dados reais da organização.</p>
          </div>
          <a className="secondary-button" href="/dashboard">
            Voltar ao painel
          </a>
        </div>

        {message ? <p className="form-error">{message}</p> : null}
        {loading ? <p className="muted">A carregar política...</p> : null}

        {data ? (
          <div className="privacy-layout">
            <aside className="privacy-facts">
              <h2>Dados usados</h2>
              <dl>
                <dt>Organização</dt>
                <dd>{data.organization.name}</dd>
                <dt>NIF</dt>
                <dd>{data.organization.nif || 'Não definido'}</dd>
                <dt>CAE</dt>
                <dd>{data.organization.cae || 'Não definido'}</dd>
                <dt>Nicho</dt>
                <dd>{data.organization.nicho || 'Não definido'}</dd>
                <dt>Versão guardada</dt>
                <dd>{version > 0 ? version : 'Ainda não guardada'}</dd>
              </dl>
              <button className="primary-button" onClick={savePolicy} disabled={saving}>
                {saving ? 'A guardar...' : version > 0 ? 'Regenerar e guardar' : 'Guardar política'}
              </button>
            </aside>

            <article className="privacy-document">
              <pre>{content}</pre>
            </article>
          </div>
        ) : null}
      </section>
    </main>
  )
}
