'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.get('name'),
        email: form.get('email'),
        password: form.get('password'),
        organizationName: form.get('organizationName'),
      }),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => null)
      setError(body?.error || 'Não foi possível criar a conta.')
      setLoading(false)
      return
    }

    router.push('/onboarding')
    router.refresh()
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel wide">
        <p className="eyebrow">Primeira configuração</p>
        <h1>Criar conta</h1>
        <p className="muted">Cria o utilizador, organização e campanha principal num único passo.</p>
        <form className="form" onSubmit={onSubmit}>
          <label>
            Nome
            <input name="name" autoComplete="name" required minLength={2} />
          </label>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Palavra-passe
            <input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <label>
            Nome da organização
            <input name="organizationName" autoComplete="organization" />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" disabled={loading}>
            {loading ? 'A criar...' : 'Criar conta'}
          </button>
        </form>
        <p className="muted small">
          Já tens conta? <Link href="/login">Entrar</Link>
        </p>
      </section>
    </main>
  )
}
