'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export default function BackButton() {
  const router = useRouter()

  return (
    <button
      type="button"
      className="secondary-button"
      style={{ width: 'fit-content' }}
      onClick={() => router.push('/dashboard')}
    >
      <ArrowLeft size={16} aria-hidden="true" />
      Voltar
    </button>
  )
}
