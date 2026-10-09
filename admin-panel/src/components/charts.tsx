import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(e!.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

// "Nice" 4-tick axis: step = 1/2/5 × 10^n; counts ke liye step kam se kam 1 (taaki 0.25 jaise ticks na banein)
function niceStep(max: number, integer: boolean) {
  const raw = Math.max(max, integer ? 4 : 1e-9) / 4
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / p
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
  return integer ? Math.max(1, Math.round(step)) : step
}

export interface SeriesPoint { label: string; value: number; tooltip?: ReactNode }

/** Single-series area/line chart with crosshair + tooltip. */
export function AreaChart({ points, color = 'var(--series-1)', format = String, height = 230, integer = false }: {
  points: SeriesPoint[]; color?: string; format?: (n: number) => string; height?: number; integer?: boolean
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const padL = 44, padR = 12, padT = 12, padB = 26
  const iw = Math.max(0, width - padL - padR)
  const ih = height - padT - padB
  const step = niceStep(Math.max(0, ...points.map(p => p.value)), integer)
  const max = step * 4
  const n = points.length
  const x = (i: number) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw)
  const y = (v: number) => padT + ih - (v / max) * ih
  const line = points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.value).toFixed(1)).join('')
  const area = n ? line + 'L' + x(n - 1).toFixed(1) + ',' + (padT + ih) + 'L' + x(0).toFixed(1) + ',' + (padT + ih) + 'Z' : ''
  const ticks = [0, 1, 2, 3, 4].map(i => i * step)
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 64))))
  const gid = useRef('g' + Math.random().toString(36).slice(2)).current

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    const i = n <= 1 ? 0 : Math.round(((px - padL) / iw) * (n - 1))
    setHover(Math.min(n - 1, Math.max(0, i)))
  }

  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img">
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity=".22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map(t => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className="grid-line" />
              <text x={padL - 8} y={y(t)} className="axis-text" textAnchor="end" dominantBaseline="middle">{format(t)}</text>
            </g>
          ))}
          {points.map((p, i) => (i % labelEvery === 0 || i === n - 1) && (
            <text key={i} x={x(i)} y={height - 6} className="axis-text" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{p.label}</text>
          ))}
          <path d={area} fill={'url(#' + gid + ')'} />
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} className="crosshair" />
              <circle cx={x(hover)} cy={y(points[hover]!.value)} r="5" fill={color} stroke="var(--surface)" strokeWidth="2" />
            </>
          )}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(x(hover), 70), width - 70), top: Math.max(0, y(points[hover]!.value) - 12) }}>
          {points[hover]!.tooltip ?? <><div className="strong">{format(points[hover]!.value)}</div><div className="muted">{points[hover]!.label}</div></>}
        </div>
      )}
    </div>
  )
}

/** Tiny trend line for KPI cards. */
export function Sparkline({ values, color = 'var(--series-1)' }: { values: number[]; color?: string }) {
  const w = 96, h = 32
  const max = Math.max(1, ...values)
  const n = values.length
  const pts = values.map((v, i) => [(i / Math.max(1, n - 1)) * (w - 4) + 2, h - 3 - (v / max) * (h - 6)] as const)
  const d = pts.map(([px, py], i) => (i ? 'L' : 'M') + px.toFixed(1) + ',' + py.toFixed(1)).join('')
  const last = pts[n - 1]
  return (
    <svg width={w} height={h} className="sparkline" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />}
    </svg>
  )
}

export interface Segment { key: string; label: string; value: number; color: string }

/** 100% stacked bar with legend underneath (legend carries label + value so colour is never alone). */
export function SegmentBar({ segments, format = String }: { segments: Segment[]; format?: (n: number) => string }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const [hover, setHover] = useState<string | null>(null)
  return (
    <div className="segbar">
      <div className="segbar-track">
        {total === 0 ? <span className="segbar-empty" /> : segments.filter(s => s.value > 0).map(s => (
          <span key={s.key} className={'segbar-seg' + (hover && hover !== s.key ? ' dim' : '')}
            style={{ flexGrow: s.value, background: s.color }} title={s.label + ': ' + format(s.value)}
            onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)} />
        ))}
      </div>
      <ul className="legend">
        {segments.map(s => (
          <li key={s.key} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)} className={hover === s.key ? 'on' : ''}>
            <span className="legend-swatch" style={{ background: s.color }} />
            <span className="legend-label">{s.label}</span>
            <span className="legend-value">{format(s.value)}</span>
            <span className="legend-pct muted">{total ? Math.round((s.value / total) * 100) + '%' : '—'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Vertical columns, single series, per-bar tooltip. */
export function Columns({ points, color = 'var(--series-1)', height = 180, labelEvery = 1 }: {
  points: SeriesPoint[]; color?: string; height?: number; labelEvery?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...points.map(p => p.value))
  return (
    <div className="columns" style={{ height }} onMouseLeave={() => setHover(null)}>
      {points.map((p, i) => (
        <div key={i} className={'col' + (hover === i ? ' hover' : '')} onMouseEnter={() => setHover(i)}
          tabIndex={0} onFocus={() => setHover(i)} aria-label={p.label + ': ' + p.value}>
          <div className="col-plot">
            {hover === i && <div className="chart-tip chart-tip-col">{p.tooltip ?? <><div className="strong">{p.value}</div><div className="muted">{p.label}</div></>}</div>}
            <div className="col-fill" style={{ height: (p.value / max) * 100 + '%', background: color }} />
          </div>
          <span className="col-label">{i % labelEvery === 0 ? p.label : ''}</span>
        </div>
      ))}
    </div>
  )
}

/** Ranked horizontal bars. */
export function BarList({ rows, format = String, color = 'var(--series-1)' }: {
  rows: { key: string; label: ReactNode; value: number; sub?: ReactNode }[]; format?: (n: number) => string; color?: string
}) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return (
    <ul className="barlist">
      {rows.map(r => (
        <li key={r.key}>
          <div className="barlist-top">
            <span className="barlist-label">{r.label}</span>
            <span className="barlist-value">{format(r.value)}</span>
          </div>
          <div className="barlist-track"><span style={{ width: (r.value / max) * 100 + '%', background: color }} /></div>
          {r.sub && <div className="muted small">{r.sub}</div>}
        </li>
      ))}
    </ul>
  )
}
