'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.get('email'),
        password: form.get('password'),
      }),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => null)
      setError(body?.error || 'Não foi possível entrar.')
      setLoading(false)
      return
    }

    const redirect = sanitizeRedirect(new URLSearchParams(window.location.search).get('redirect'))
    router.push(redirect)
    router.refresh()
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <p className="eyebrow">Captação de leads</p>
        <h1>Entrar na conta</h1>
        <p className="muted">Acede ao teu painel para configurar campanhas e acompanhar contactos.</p>
        <form className="form" onSubmit={onSubmit}>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Palavra-passe
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" disabled={loading}>
            {loading ? 'A entrar...' : 'Entrar'}
          </button>
        </form>
        <p className="muted small">
          Ainda não tens conta? <Link href="/register">Criar conta</Link>
        </p>
      </section>
    </main>
  )
}

function sanitizeRedirect(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  return value
}
