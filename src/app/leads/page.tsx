'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'

type Lead = {
  id: string
  instagramUsername: string | null
  instagramDisplayName: string | null
  contactEmail: string | null
  contactWhatsapp: string | null
  website: string | null
  leadStatus: LeadStatus
  leadType: string
  sourceType: string
  icpMatchScore: string | null
  createdAt: string
}

type LeadStatus = 'new' | 'contacted' | 'replied' | 'qualified' | 'closed' | 'opted_out'

const statusLabels: Record<LeadStatus, string> = {
  new: 'Novo',
  contacted: 'Contactado',
  replied: 'Respondeu',
  qualified: 'Qualificado',
  closed: 'Fechado',
  opted_out: 'Sem contacto',
}

const emptyForm = {
  instagramUsername: '',
  instagramDisplayName: '',
  instagramBio: '',
  instagramFollowers: '',
  instagramIsBusiness: false,
  instagramCategory: '',
  contactEmail: '',
  contactWhatsapp: '',
  website: '',
  leadType: 'customer',
  sourceType: 'manual',
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: '50' })
    if (search.trim()) params.set('search', search.trim())
    if (status) params.set('status', status)
    return params.toString()
  }, [search, status])

  const loadLeads = useCallback(async () => {
    const response = await fetch(`/api/leads?${query}`)
    const body = await response.json().catch(() => null)
    setLoading(false)
    if (!response.ok) {
      setMessage(body?.error || 'Não foi possível carregar leads.')
      return
    }
    setLeads(body.leads || [])
    setTotal(body.pagination?.total || 0)
  }, [query])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLeads()
  }, [loadLeads])

  async function createLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        instagramUsername: form.instagramUsername || null,
        instagramDisplayName: form.instagramDisplayName || null,
        instagramBio: form.instagramBio || null,
        instagramFollowers: form.instagramFollowers ? Number(form.instagramFollowers) : null,
        instagramCategory: form.instagramCategory || null,
        contactEmail: form.contactEmail || null,
        contactWhatsapp: form.contactWhatsapp || null,
        website: form.website || null,
      }),
    })
    const body = await response.json().catch(() => null)
    setSaving(false)
    if (!response.ok) {
      setMessage(body?.error || 'Não foi possível criar o lead.')
      return
    }
    setForm(emptyForm)
    setMessage('Lead criado.')
    await loadLeads()
  }

  async function deleteLead(id: string) {
    const response = await fetch(`/api/leads/${id}`, { method: 'DELETE' })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      setMessage(body?.error || 'Não foi possível apagar o lead.')
      return
    }
    setLeads((items) => items.filter((lead) => lead.id !== id))
    setTotal((value) => Math.max(value - 1, 0))
  }

  return (
    <main className="app-shell">
      <section className="dashboard workbench">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Leads</p>
            <h1>Gestão de leads</h1>
            <p className="muted">Pesquisa, cria e acompanha leads da organização atual.</p>
          </div>
          <a className="secondary-button" href="/kanban">
            Ver kanban
          </a>
        </div>

        {message ? <p className="form-error">{message}</p> : null}

        <div className="lead-layout">
          <form className="form lead-form" onSubmit={createLead}>
            <h2>Novo lead</h2>
            <label>
              Username Instagram
              <input value={form.instagramUsername} onChange={(event) => setForm({ ...form, instagramUsername: event.target.value })} placeholder="ex: empresa.pt" />
            </label>
            <label>
              Nome
              <input value={form.instagramDisplayName} onChange={(event) => setForm({ ...form, instagramDisplayName: event.target.value })} />
            </label>
            <label>
              Bio / contexto
              <textarea rows={3} value={form.instagramBio} onChange={(event) => setForm({ ...form, instagramBio: event.target.value })} />
            </label>
            <div className="two-col">
              <label>
                Seguidores
                <input type="number" min="0" value={form.instagramFollowers} onChange={(event) => setForm({ ...form, instagramFollowers: event.target.value })} />
              </label>
              <label>
                Categoria
                <input value={form.instagramCategory} onChange={(event) => setForm({ ...form, instagramCategory: event.target.value })} />
              </label>
            </div>
            <div className="two-col">
              <label>
                Email
                <input type="email" value={form.contactEmail} onChange={(event) => setForm({ ...form, contactEmail: event.target.value })} />
              </label>
              <label>
                WhatsApp
                <input value={form.contactWhatsapp} onChange={(event) => setForm({ ...form, contactWhatsapp: event.target.value })} />
              </label>
            </div>
            <label>
              Website
              <input type="url" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} />
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={form.instagramIsBusiness} onChange={(event) => setForm({ ...form, instagramIsBusiness: event.target.checked })} />
              Perfil profissional
            </label>
            <button className="primary-button" disabled={saving}>
              {saving ? 'A criar...' : 'Criar lead'}
            </button>
          </form>

          <div className="lead-list-panel">
            <div className="filters">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar lead" />
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">Todos os estados</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <p className="muted compact">{loading ? 'A carregar...' : `${total} lead(s) encontrados`}</p>
            <div className="lead-table">
              {leads.map((lead) => (
                <article key={lead.id} className="lead-row">
                  <div>
                    <strong>{lead.instagramDisplayName || lead.instagramUsername || lead.contactEmail || 'Lead sem nome'}</strong>
                    <span>{lead.website || lead.contactWhatsapp || lead.contactEmail || lead.sourceType}</span>
                  </div>
                  <div className="lead-row-meta">
                    <span className="status-pill">{statusLabels[lead.leadStatus]}</span>
                    <span>{lead.icpMatchScore ? `${Math.round(Number(lead.icpMatchScore) * 100)}% ICP` : 'ICP por definir'}</span>
                    <button className="secondary-button small-button" onClick={() => void deleteLead(lead.id)}>
                      Apagar
                    </button>
                  </div>
                </article>
              ))}
              {!loading && leads.length === 0 ? <p className="muted">Sem leads para estes filtros.</p> : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
