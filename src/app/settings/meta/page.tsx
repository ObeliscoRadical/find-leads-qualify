'use client'
import BackButton from '../../back-button'

import { useEffect, useState } from 'react'

type StatusResponse = {
  status: 'disconnected' | 'pending_selection' | 'connected' | string
  captureReady?: boolean
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
    if (body.status !== 'connected') {
      const outcome = new URLSearchParams(window.location.search).get('meta')
      if (outcome === 'no_pages') setMessage('A Meta não retornou nenhuma Página com Instagram profissional associado. Confira as contas selecionadas e volte a ligar.')
      else if (outcome === 'expired') setMessage('A autorização expirou. Clique em Ligar Meta para tentar novamente.')
      else if (outcome === 'provider_error') setMessage('Não foi possível consultar a Meta. Confira o acesso às contas e tente novamente.')
    }
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

  async function activateCapture() {
    setActionLoading(true)
    setMessage('')
    try {
      const response = await fetch('/api/meta/capture', { method: 'POST' })
      const body = await response.json()
      setMessage(response.ok ? `Captação ativada. ${body.imported} leads importados; ${body.existing} já existiam.${body.moreAvailable ? ' Há mais registros históricos na Meta além deste lote.' : ''}` : body.error)
    } catch { setMessage('Não foi possível ativar a captação. Tente novamente.') }
    finally { setActionLoading(false) }
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
        <BackButton />
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

        {status?.status === 'connected' ? (
          <section>
            <h2>Leads de formulários Meta</h2>
            <p>Receba automaticamente os contatos enviados aos formulários da sua Página. A ativação também importa até 100 contatos por formulário, de até 50 formulários, sem duplicar leads.</p>
            {status.captureReady ? (
              <button className="primary-button" onClick={activateCapture} disabled={actionLoading}>
                {actionLoading ? 'A ativar...' : 'Ativar captação e importar formulários'}
              </button>
            ) : <><p>A captação aguarda configuração e autorização de acesso aos formulários na Meta.</p><a className="primary-button" href="/api/meta/oauth/connect?capture=1">Autorizar acesso aos formulários</a></>}
            <p><a href="/leads">Ver leads recebidos</a></p>
          </section>
        ) : null}

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
