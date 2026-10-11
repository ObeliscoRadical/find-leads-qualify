import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Find Leads Qualify',
    short_name: 'Find Leads',
    description: 'Descoberta e acompanhamento de leads empresariais',
    lang: 'pt',
    start_url: '/leads',
    scope: '/',
    display: 'standalone',
    background_color: '#04060e',
    theme_color: '#04060e',
    icons: [
      { src: '/icons/find-leads-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/find-leads-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/find-leads-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
