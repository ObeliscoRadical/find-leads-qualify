'use client'

import { useEffect, useState } from 'react'

type LeadStatus = 'new' | 'contacted' | 'replied' | 'qualified' | 'closed' | 'opted_out'

type Lead = {
  id: string
  contactName: string | null
  contactPhone: string | null
  instagramUsername: string | null
  instagramDisplayName: string | null
  contactEmail: string | null
  website: string | null
  leadStatus: LeadStatus
  icpMatchScore: string | null
}

const columns: Array<{ status: LeadStatus; label: string }> = [
  { status: 'new', label: 'Novo' },
  { status: 'contacted', label: 'Contactado' },
  { status: 'replied', label: 'Respondeu' },
  { status: 'qualified', label: 'Qualificado' },
  { status: 'closed', label: 'Fechado' },
  { status: 'opted_out', label: 'Sem contacto' },
]

export default function KanbanPage() {
  const [leadsByStatus, setLeadsByStatus] = useState<Record<string, Lead[]>>({})
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void loadFunnel()
  }, [])

  async function loadFunnel() {
    setLoading(true)
    const response = await fetch('/api/leads/funnel')
    const body = await response.json().catch(() => null)
    setLoading(false)
    if (!response.ok) {
      setMessage(body?.error || 'Não foi possível carregar o funil.')
      return
    }
    setCounts(body.counts || {})
    setLeadsByStatus(body.leadsByStatus || {})
  }

  async function moveLead(leadId: string, nextStatus: LeadStatus) {
    const previous = leadsByStatus
    const lead = Object.values(previous)
      .flat()
      .find((item) => item.id === leadId)
    if (!lead || lead.leadStatus === nextStatus) return

    const next = Object.fromEntries(columns.map((column) => [column.status, [...(previous[column.status] || [])]])) as Record<string, Lead[]>
    next[lead.leadStatus] = next[lead.leadStatus].filter((item) => item.id !== leadId)
    next[nextStatus] = [{ ...lead, leadStatus: nextStatus }, ...(next[nextStatus] || [])]
    setLeadsByStatus(next)
    setCounts((current) => ({
      ...current,
      [lead.leadStatus]: Math.max((current[lead.leadStatus] || 1) - 1, 0),
      [nextStatus]: (current[nextStatus] || 0) + 1,
    }))

    const response = await fetch(`/api/leads/${leadId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      setMessage(body?.error || 'Não foi possível atualizar o estado.')
      setLeadsByStatus(previous)
      await loadFunnel()
      return
    }
    setMessage('')
  }

  return (
    <main className="app-shell">
      <section className="dashboard kanban-workbench">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Pipeline</p>
            <h1>Kanban de leads</h1>
            <p className="muted">Move leads entre etapas e mantém o funil sincronizado.</p>
          </div>
          <a className="secondary-button" href="/leads">
            Gerir leads
          </a>
        </div>

        {message ? <p className="form-error">{message}</p> : null}
        {loading ? <p className="muted">A carregar funil...</p> : null}

        <div className="kanban-board">
          {columns.map((column) => (
            <section
              key={column.status}
              className="kanban-column"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const id = event.dataTransfer.getData('text/plain') || draggingId
                if (id) void moveLead(id, column.status)
                setDraggingId(null)
              }}
            >
              <header>
                <h2>{column.label}</h2>
                <span>{counts[column.status] || 0}</span>
              </header>
              <div className="kanban-stack">
                {(leadsByStatus[column.status] || []).map((lead) => (
                  <article
                    key={lead.id}
                    className="kanban-card"
                    draggable
                    onDragStart={(event) => {
                      setDraggingId(lead.id)
                      event.dataTransfer.setData('text/plain', lead.id)
                    }}
                    onDragEnd={() => setDraggingId(null)}
                  >
                    <strong>{lead.contactName || lead.instagramDisplayName || lead.instagramUsername || lead.contactEmail || 'Lead sem nome'}</strong>
                    <span>{lead.website || lead.contactEmail || 'Sem contacto direto'}</span>
                    <div className="kanban-card-footer">
                      <small>{lead.icpMatchScore ? `${Math.round(Number(lead.icpMatchScore) * 100)}% ICP` : 'ICP por definir'}</small>
                      <select
                        aria-label="Alterar estado do lead"
                        value={lead.leadStatus}
                        onChange={(event) => void moveLead(lead.id, event.target.value as LeadStatus)}
                      >
                        {columns.map((item) => (
                          <option key={item.status} value={item.status}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  )
}
