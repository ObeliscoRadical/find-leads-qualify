'use client'

import { useEffect, useState } from 'react'

type StatusResponse = {
  status: 'disconnected' | 'pending_selection' | 'connected' | string
  connection: {
    pageId: string | null
    pageName: string | null
    igUserId: string | null
    igUsername: string | null
    expiresAt: string | null
    updatedAt: string
  } | null
}

type PageOption = {
  pageId: string
  pageName: string
  igUserId: string
  igUsername: string | null
}

export default function MetaSettingsPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [pages, setPages] = useState<PageOption[]>([])
  const [selectedPageId, setSelectedPageId] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    void loadStatus()
  }, [])

  useEffect(() => {
    if (status?.status === 'pending_selection') void loadPages()
  }, [status?.status])

  async function loadStatus() {
    setLoading(true)
    const response = await fetch('/api/meta/status')
    const body = await response.json().catch(() => null)
    setLoading(false)
    if (!response.ok) {
      setMessage(body?.error || 'Não foi possível carregar a ligação Meta.')
      return
    }
    setStatus(body)
  }

  async function loadPages() {
    const response = await fetch('/api/meta/pages')
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      setMessage(body?.error || 'Não foi possível carregar páginas elegíveis.')
      return
    }
    setPages(body.pages || [])
    setSelectedPageId(body.pages?.[0]?.pageId || '')
  }

  async function selectPage() {
    setActionLoading(true)
    setMessage('')
    const response = await fetch('/api/meta/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: selectedPageId }),
    })
    const body = await response.json().catch(() => null)
    setActionLoading(false)
    if (!response.ok) {
      setMessage(body?.error || 'Não foi possível selecionar a página.')
      return
    }
    setMessage('Página Meta ligada com sucesso.')
    await loadStatus()
  }

  async function disconnect() {
    setActionLoading(true)
    setMessage('')
    const response = await fetch('/api/meta/disconnect', { method: 'POST' })
    const body = await response.json().catch(() => null)
    setActionLoading(false)
    if (!response.ok) {
      setMessage(body?.error || 'Não foi possível desligar a Meta.')
      return
    }
    setPages([])
    setSelectedPageId('')
    setMessage('Ligação Meta removida.')
    await loadStatus()
  }

  return (
    <main className="app-shell">
      <section className="dashboard">
        <div>
          <p className="eyebrow">Definições</p>
          <h1>Meta e Instagram</h1>
          <p className="muted">Liga uma Página do Facebook com Instagram profissional associado.</p>
        </div>

        {message ? <p className="form-error">{message}</p> : null}

        {loading ? (
          <p className="muted">A carregar ligação...</p>
        ) : status?.status === 'connected' ? (
          <div className="metric-grid">
            <article>
              <span>Página</span>
              <strong>{status.connection?.pageName || status.connection?.pageId}</strong>
            </article>
            <article>
              <span>Instagram</span>
              <strong>{status.connection?.igUsername ? `@${status.connection.igUsername}` : status.connection?.igUserId}</strong>
            </article>
            <article>
              <span>Estado</span>
              <strong>Ligado</strong>
            </article>
          </div>
        ) : status?.status === 'pending_selection' ? (
          <div className="form onboarding-form">
            <label>
              Página elegível
              <select value={selectedPageId} onChange={(event) => setSelectedPageId(event.target.value)}>
                {pages.map((page) => (
                  <option key={page.pageId} value={page.pageId}>
                    {page.pageName} {page.igUsername ? `(@${page.igUsername})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button" onClick={selectPage} disabled={!selectedPageId || actionLoading}>
              {actionLoading ? 'A guardar...' : 'Selecionar página'}
            </button>
          </div>
        ) : (
          <div className="settings-actions">
            <a className="primary-button" href="/api/meta/oauth/connect">
              Ligar Meta
            </a>
          </div>
        )}

        {status?.status === 'connected' || status?.status === 'pending_selection' ? (
          <div className="settings-actions">
            <a className="secondary-button" href="/api/meta/oauth/connect">
              Voltar a ligar
            </a>
            <button className="secondary-button" onClick={disconnect} disabled={actionLoading}>
              Desligar
            </button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
