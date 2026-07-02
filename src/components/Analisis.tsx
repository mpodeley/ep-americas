import { useMemo, useState } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, Cell,
} from 'recharts'
import type { Company, Commodities } from '../types'
import { colors, categoryColor, radius, space, card, sectionTitle, badge } from '../theme'
import { usd, num, pct, DASH } from '../utils/format'
import { goToCompany } from '../hooks/useHashRoute'

// --- Commodity strip ---
function CommodityStrip({ commodities }: { commodities: Commodities | null }) {
  if (!commodities) return null
  return (
    <div style={{ display: 'flex', gap: space.md, flexWrap: 'wrap', marginBottom: space.xl }}>
      {Object.entries(commodities).map(([k, c]) => {
        const up = (c.change_pct ?? 0) >= 0
        return (
          <div key={k} style={{ ...card, padding: space.md, minWidth: 150 }}>
            <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{c.label}</div>
            <div style={{ color: colors.textPrimary, fontSize: 22, fontWeight: 700, marginTop: 2 }}>
              {c.last} <span style={{ fontSize: 11, color: colors.textDim }}>{c.unit}</span>
            </div>
            {c.change_pct != null && (
              <div style={{ color: up ? colors.oil : colors.gas, fontSize: 12 }}>{up ? '▲' : '▼'} {Math.abs(c.change_pct)}%</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// --- Axis metric options for the scatter ---
interface AxisOpt { key: keyof Company; label: string; fmt: (v: number) => string }
const AXES: AxisOpt[] = [
  { key: 'ev_ebitda', label: 'EV/EBITDA', fmt: (v) => `${v.toFixed(1)}x` },
  { key: 'net_debt_to_ebitda', label: 'Deuda neta/EBITDA', fmt: (v) => `${v.toFixed(2)}x` },
  { key: 'fcf_yield_pct', label: 'FCF yield %', fmt: (v) => `${v.toFixed(1)}%` },
  { key: 'ev_per_boed_usd', label: 'EV/prod (US$/boe-d)', fmt: (v) => `${(v / 1000).toFixed(0)}k` },
  { key: 'ev_per_1p_boe_usd', label: 'EV/1P (US$/boe)', fmt: (v) => `$${v.toFixed(1)}` },
  { key: 'rp_years', label: 'R/P (años)', fmt: (v) => v.toFixed(1) },
  { key: 'pct_gas', label: '% gas', fmt: (v) => `${v.toFixed(0)}%` },
  { key: 'roace_pct', label: 'ROACE %', fmt: (v) => `${v.toFixed(1)}%` },
  { key: 'production_kboed', label: 'Producción kboe/d', fmt: (v) => num(v, 0) },
]

function Scatter2D({ companies }: { companies: Company[] }) {
  const [xk, setXk] = useState<keyof Company>('net_debt_to_ebitda')
  const [yk, setYk] = useState<keyof Company>('fcf_yield_pct')
  const xOpt = AXES.find((a) => a.key === xk)!
  const yOpt = AXES.find((a) => a.key === yk)!

  const data = useMemo(() =>
    companies
      .filter((c) => typeof c[xk] === 'number' && typeof c[yk] === 'number')
      .map((c) => ({ x: c[xk] as number, y: c[yk] as number, z: c.market_cap_usd ?? 1e9, id: c.id, name: c.name, category: c.category })),
    [companies, xk, yk])

  const sel: React.CSSProperties = { background: colors.surfaceAlt, color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: radius.sm, padding: '5px 8px', fontSize: 12 }

  return (
    <div style={card}>
      <div style={{ display: 'flex', gap: space.md, flexWrap: 'wrap', marginBottom: space.md, alignItems: 'center' }}>
        <label style={{ color: colors.textMuted, fontSize: 12 }}>X:
          <select value={String(xk)} onChange={(e) => setXk(e.target.value as keyof Company)} style={{ ...sel, marginLeft: 6 }}>
            {AXES.map((a) => <option key={String(a.key)} value={String(a.key)}>{a.label}</option>)}
          </select>
        </label>
        <label style={{ color: colors.textMuted, fontSize: 12 }}>Y:
          <select value={String(yk)} onChange={(e) => setYk(e.target.value as keyof Company)} style={{ ...sel, marginLeft: 6 }}>
            {AXES.map((a) => <option key={String(a.key)} value={String(a.key)}>{a.label}</option>)}
          </select>
        </label>
        <span style={{ color: colors.textDim, fontSize: 11 }}>tamaño ∝ market cap · click = perfil</span>
      </div>
      <div style={{ height: 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid stroke={colors.border} />
            <XAxis type="number" dataKey="x" name={xOpt.label} stroke={colors.textMuted} fontSize={11}
              tickFormatter={(v) => xOpt.fmt(v)} label={{ value: xOpt.label, position: 'insideBottom', offset: -10, fill: colors.textMuted, fontSize: 12 }} />
            <YAxis type="number" dataKey="y" name={yOpt.label} stroke={colors.textMuted} fontSize={11}
              tickFormatter={(v) => yOpt.fmt(v)} label={{ value: yOpt.label, angle: -90, position: 'insideLeft', fill: colors.textMuted, fontSize: 12 }} />
            <ZAxis type="number" dataKey="z" range={[40, 500]} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8 }}
              formatter={(v: number, n: string) => n === xOpt.label ? xOpt.fmt(v) : n === yOpt.label ? yOpt.fmt(v) : v}
              labelFormatter={() => ''}
              content={({ payload }) => {
                if (!payload || !payload.length) return null
                const p = payload[0].payload
                return (
                  <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 8, fontSize: 12 }}>
                    <strong style={{ color: colors.textPrimary }}>{p.name}</strong>
                    <div style={{ color: colors.textMuted }}>{xOpt.label}: {xOpt.fmt(p.x)}</div>
                    <div style={{ color: colors.textMuted }}>{yOpt.label}: {yOpt.fmt(p.y)}</div>
                  </div>
                )
              }}
            />
            <Scatter data={data} isAnimationActive={false} onClick={(d) => d?.id && goToCompany(d.id)}>
              {data.map((d) => <Cell key={d.id} fill={categoryColor(d.category)} />)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// --- Rankings ---
interface RankOpt { key: keyof Company; label: string; fmt: (c: Company) => string }
const RANKS: RankOpt[] = [
  { key: 'market_cap_usd', label: 'Market cap', fmt: (c) => usd(c.market_cap_usd) },
  { key: 'production_kboed', label: 'Producción (kboe/d)', fmt: (c) => num(c.production_kboed, 0) },
  { key: 'reserves_1p_mmboe', label: 'Reservas 1P (MMboe)', fmt: (c) => num(c.reserves_1p_mmboe, 0) },
  { key: 'fcf_yield_pct', label: 'FCF yield %', fmt: (c) => pct(c.fcf_yield_pct, 1) },
  { key: 'net_debt_to_ebitda', label: 'Apalancamiento (menor=mejor)', fmt: (c) => c.net_debt_to_ebitda != null ? `${c.net_debt_to_ebitda.toFixed(2)}x` : DASH },
  { key: 'ytd_return_pct', label: 'Retorno YTD %', fmt: (c) => pct(c.ytd_return_pct, 1) },
]

function Rankings({ companies }: { companies: Company[] }) {
  const [rk, setRk] = useState<keyof Company>('production_kboed')
  const opt = RANKS.find((r) => r.key === rk)!
  const asc = rk === 'net_debt_to_ebitda'
  const rows = useMemo(() => {
    const withVal = companies.filter((c) => typeof c[rk] === 'number')
    withVal.sort((a, b) => (asc ? 1 : -1) * ((b[rk] as number) - (a[rk] as number)))
    return withVal.slice(0, 12).map((c) => ({ id: c.id, name: c.name, category: c.category, v: c[rk] as number, label: opt.fmt(c) }))
  }, [companies, rk, asc, opt])
  const max = Math.max(...rows.map((r) => Math.abs(r.v)), 1)

  return (
    <div style={card}>
      <div style={{ marginBottom: space.md }}>
        <select value={String(rk)} onChange={(e) => setRk(e.target.value as keyof Company)}
          style={{ background: colors.surfaceAlt, color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: radius.sm, padding: '5px 8px', fontSize: 13 }}>
          {RANKS.map((r) => <option key={String(r.key)} value={String(r.key)}>{r.label}</option>)}
        </select>
      </div>
      {rows.map((r) => (
        <div key={r.id} onClick={() => goToCompany(r.id)} style={{ display: 'flex', alignItems: 'center', gap: space.sm, marginBottom: 5, cursor: 'pointer' }}>
          <span style={{ width: 130, color: colors.textSecondary, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          <div style={{ flex: 1, background: colors.bg, borderRadius: 3, height: 16, position: 'relative' }}>
            <div style={{ width: `${Math.abs(r.v) / max * 100}%`, background: categoryColor(r.category), height: '100%', borderRadius: 3 }} />
          </div>
          <span style={{ width: 90, textAlign: 'right', color: colors.textPrimary, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{r.label}</span>
        </div>
      ))}
    </div>
  )
}

// --- Category aggregates ---
function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function Aggregates({ companies }: { companies: Company[] }) {
  const cats = useMemo(() => {
    const g = new Map<string, Company[]>()
    for (const c of companies) {
      const a = g.get(c.category) ?? []; a.push(c); g.set(c.category, a)
    }
    const med = (arr: Company[], k: keyof Company) => median(arr.map((c) => c[k]).filter((v): v is number => typeof v === 'number'))
    return Array.from(g.entries()).map(([cat, arr]) => ({
      cat, n: arr.length,
      ev_ebitda: med(arr, 'ev_ebitda'),
      lev: med(arr, 'net_debt_to_ebitda'),
      fcf: med(arr, 'fcf_yield_pct'),
      gas: med(arr, 'pct_gas'),
      rp: med(arr, 'rp_years'),
    })).sort((a, b) => b.n - a.n)
  }, [companies])

  const th: React.CSSProperties = { textAlign: 'right', padding: '8px 10px', color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', borderBottom: `1px solid ${colors.border}` }
  const td: React.CSSProperties = { textAlign: 'right', padding: '8px 10px', color: colors.textSecondary, fontSize: 13, borderBottom: `1px solid ${colors.border}`, fontVariantNumeric: 'tabular-nums' }
  return (
    <div style={{ overflowX: 'auto', ...card, padding: 0 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
        <thead><tr>
          <th style={{ ...th, textAlign: 'left' }}>Categoría (mediana)</th>
          <th style={th}>n</th><th style={th}>EV/EBITDA</th><th style={th}>DN/EBITDA</th>
          <th style={th}>FCF yield</th><th style={th}>% gas</th><th style={th}>R/P</th>
        </tr></thead>
        <tbody>
          {cats.map((c) => (
            <tr key={c.cat}>
              <td style={{ ...td, textAlign: 'left' }}><span style={badge(categoryColor(c.cat))}>{c.cat}</span></td>
              <td style={td}>{c.n}</td>
              <td style={td}>{c.ev_ebitda != null ? `${c.ev_ebitda.toFixed(1)}x` : DASH}</td>
              <td style={td}>{c.lev != null ? `${c.lev.toFixed(2)}x` : DASH}</td>
              <td style={td}>{pct(c.fcf, 1)}</td>
              <td style={td}>{pct(c.gas, 0)}</td>
              <td style={td}>{c.rp != null ? c.rp.toFixed(1) : DASH}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// --- Peer comparator ---
const PEER_METRICS: { key: keyof Company; label: string; fmt: (c: Company) => string }[] = [
  { key: 'market_cap_usd', label: 'Market cap', fmt: (c) => usd(c.market_cap_usd) },
  { key: 'production_kboed', label: 'Producción kboe/d', fmt: (c) => num(c.production_kboed, 0) },
  { key: 'pct_gas', label: '% gas', fmt: (c) => pct(c.pct_gas, 0) },
  { key: 'reserves_1p_mmboe', label: 'Reservas 1P', fmt: (c) => num(c.reserves_1p_mmboe, 0) },
  { key: 'rp_years', label: 'R/P años', fmt: (c) => num(c.rp_years, 1) },
  { key: 'ev_ebitda', label: 'EV/EBITDA', fmt: (c) => num(c.ev_ebitda, 1) },
  { key: 'ev_per_boed_usd', label: 'EV/prod', fmt: (c) => c.ev_per_boed_usd != null ? `${(c.ev_per_boed_usd / 1000).toFixed(0)}k` : DASH },
  { key: 'net_debt_to_ebitda', label: 'DN/EBITDA', fmt: (c) => c.net_debt_to_ebitda != null ? `${c.net_debt_to_ebitda.toFixed(2)}x` : DASH },
  { key: 'fcf_yield_pct', label: 'FCF yield', fmt: (c) => pct(c.fcf_yield_pct, 1) },
  { key: 'roace_pct', label: 'ROACE', fmt: (c) => pct(c.roace_pct, 1) },
]

function PeerCompare({ companies }: { companies: Company[] }) {
  const [ids, setIds] = useState<string[]>(() => companies.slice(0, 3).map((c) => c.id))
  const sorted = [...companies].sort((a, b) => a.name.localeCompare(b.name))
  const picked = ids.map((id) => companies.find((c) => c.id === id)).filter((c): c is Company => !!c)

  function toggle(id: string) {
    setIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 5 ? [...prev, id] : prev)
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { textAlign: 'right', padding: '8px 10px', color: colors.textSecondary, fontSize: 13, borderBottom: `1px solid ${colors.border}`, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
  return (
    <div style={card}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: space.md }}>
        {sorted.map((c) => {
          const on = ids.includes(c.id)
          return (
            <button key={c.id} onClick={() => toggle(c.id)} style={{
              cursor: 'pointer', fontSize: 11, padding: '3px 9px', borderRadius: radius.pill,
              border: `1px solid ${on ? categoryColor(c.category) : colors.border}`,
              background: on ? categoryColor(c.category) + '22' : 'transparent',
              color: on ? colors.textPrimary : colors.textDim,
            }}>{c.canonical_ticker ?? c.name}</button>
          )
        })}
      </div>
      <div style={{ color: colors.textDim, fontSize: 11, marginBottom: space.sm }}>Elegí hasta 5 empresas.</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr>
            <th style={th}>Métrica</th>
            {picked.map((c) => <th key={c.id} style={{ ...th, textAlign: 'right', color: colors.textPrimary, cursor: 'pointer' }} onClick={() => goToCompany(c.id)}>{c.canonical_ticker ?? c.name}</th>)}
          </tr></thead>
          <tbody>
            {PEER_METRICS.map((m) => (
              <tr key={String(m.key)}>
                <td style={{ ...td, textAlign: 'left', color: colors.textMuted }}>{m.label}</td>
                {picked.map((c) => <td key={c.id} style={td}>{m.fmt(c)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Analisis({ companies, commodities }: { companies: Company[]; commodities: Commodities | null }) {
  const block: React.CSSProperties = { marginBottom: space.xxl }
  return (
    <div>
      <CommodityStrip commodities={commodities} />

      <div style={block}>
        <div style={sectionTitle}>Dispersión de valuación</div>
        <Scatter2D companies={companies} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: space.lg, ...block }}>
        <div>
          <div style={sectionTitle}>Ranking</div>
          <Rankings companies={companies} />
        </div>
        <div>
          <div style={sectionTitle}>Comparador de pares</div>
          <PeerCompare companies={companies} />
        </div>
      </div>

      <div style={block}>
        <div style={sectionTitle}>Agregados por categoría</div>
        <Aggregates companies={companies} />
      </div>
    </div>
  )
}
