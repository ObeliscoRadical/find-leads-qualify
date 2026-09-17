import Link from 'next/link'

export default function Home() {
  return (
    <main className="home-shell">
      <section className="home-hero">
        <p className="eyebrow">Captação de leads</p>
        <h1>Autenticação e onboarding prontos para começar campanhas.</h1>
        <p className="muted">
          Cria uma conta, configura a organização por NIF/CAE ou descrição manual e entra no painel com isolamento por tenant.
        </p>
        <div className="actions">
          <Link className="primary-button" href="/register">
            Criar conta
          </Link>
          <Link className="secondary-button" href="/login">
            Entrar
          </Link>
        </div>
      </section>
    </main>
  )
}
