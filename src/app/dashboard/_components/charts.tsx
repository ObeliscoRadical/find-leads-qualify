export function scoreColor(score: number) {
  if (score >= 85) return '#67E8F9'
  if (score >= 75) return '#818CF8'
  if (score >= 60) return '#C084FC'
  return '#7E8BB0'
}

export function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * 160
    const y = 30 - ((value - min) / Math.max(max - min, 1)) * 26
    return `${x},${y}`
  })
  const area = `0,34 ${points.join(' ')} 160,34`
  return (
    <svg className="fl-spark" viewBox="0 0 160 34" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={area} fill={color} opacity=".16" />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      {points.at(-1) ? <circle cx={points.at(-1)!.split(',')[0]} cy={points.at(-1)!.split(',')[1]} r="2.6" fill="#fff" /> : null}
    </svg>
  )
}

export function ScoreRing({ score }: { score: number }) {
  const r = 15
  const length = 2 * Math.PI * r
  return (
    <span className="fl-score">
      <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true">
        <circle cx="19" cy="19" r={r} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="3.2" />
        <circle cx="19" cy="19" r={r} fill="none" stroke={scoreColor(score)} strokeWidth="3.2" strokeLinecap="round" strokeDasharray={length} strokeDashoffset={length * (1 - score / 100)} transform="rotate(-90 19 19)" />
      </svg>
      <span>{score}</span>
    </span>
  )
}

export function AreaChart({ discovered, qualified }: { discovered: number[]; qualified: number[] }) {
  const max = Math.max(...discovered, ...qualified, 1)
  const plot = (values: number[]) =>
    values.map((value, index) => {
      const x = 48 + (index / 11) * 644
      const y = 184 - (value / max) * 150
      return [x, y] as const
    })
  const d = plot(discovered)
  const q = plot(qualified)
  const line = (points: readonly (readonly [number, number])[]) => points.map(([x, y], index) => `${index ? 'L' : 'M'}${x} ${y}`).join(' ')
  const area = (points: readonly (readonly [number, number])[]) => `${line(points)} L692 184 L48 184 Z`
  return (
    <svg className="fl-chart" viewBox="0 0 720 220" role="img" aria-label="Descoberta versus qualificação nas últimas 12 semanas">
      {[0, .25, .5, .75, 1].map((tick) => (
        <g key={tick}>
          <line x1="48" x2="692" y1={184 - tick * 150} y2={184 - tick * 150} />
          <text x="12" y={188 - tick * 150}>{Math.round(max * tick)}</text>
        </g>
      ))}
      {Array.from({ length: 12 }, (_, index) => <text key={index} x={48 + (index / 11) * 644} y="210" textAnchor="middle">S{index + 1}</text>)}
      <path d={area(d)} fill="#22D3EE" opacity=".14" />
      <path d={area(q)} fill="#A855F7" opacity=".13" />
      <path d={line(d)} fill="none" stroke="#22D3EE" strokeWidth="2.2" />
      <path d={line(q)} fill="none" stroke="#A855F7" strokeWidth="2.2" />
    </svg>
  )
}

export function Kpi({ label, value, unit, series, color }: { label: string; value: string; unit: string; series: number[]; color: string }) {
  return <article className="fl-kpi" style={{ '--accent': color } as React.CSSProperties}><span>{label}</span><strong>{value}<small>{unit}</small></strong><Sparkline values={series} color={color} /></article>
}
