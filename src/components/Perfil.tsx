import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import type { CompanyDetail } from '../types'
import { colors, categoryColor, radius, space, card, badge } from '../theme'
import { usd, num, pct, price, leverage, evPerBoed, usdBbl, shortDate, DASH } from '../utils/format'
import { goHome } from '../hooks/useHashRoute'

const base = import.meta.env.BASE_URL

// Minimal markdown: paragraphs, bullet lists, **bold**, autolinked URLs.
function renderInline(text: string, key: number) {
  const parts = text.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g)
  return (
    <span key={key}>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
          return <strong key={i} style={{ color: colors.textPrimary }}>{p.slice(2, -2)}</strong>
        }
        if (/^https?:\/\//.test(p)) {
          const short = p.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
          return <a key={i} href={p} target="_blank" rel="noreferrer" style={{ color: colors.accent.blue }}>{short.length > 42 ? short.slice(0, 42) + '…' : short}</a>
        }
        return <span key={i}>{p}</span>
      })}
    </span>
  )
}
function Markdown({ md }: { md: string }) {
  const blocks = md.split(/\n\s*\n/)
  return (
    <div style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            <ul key={i} style={{ margin: `0 0 ${space.md}px`, paddingLeft: space.lg }}>
              {lines.map((l, j) => <li key={j} style={{ marginBottom: 4 }}>{renderInline(l.replace(/^\s*[-*]\s+/, ''), j)}</li>)}
            </ul>
          )
        }
        return <p key={i} style={{ margin: `0 0 ${space.md}px` }}>{renderInline(b, i)}</p>
      })}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...card, padding: space.md }}>
      <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 700, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

export default function Perfil({ id }: { id: string }) {
  const [d, setD] = useState<CompanyDetail | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    setD(null); setErr(false)
    fetch(`${base}data/companies/${id}.json`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then(setD)
      .catch(() => setErr(true))
  }, [id])

  const chartData = useMemo(() => {
    if (!d) return []
    const fy = d.financials_by_year
    return Object.keys(fy).sort().map((y) => ({
      year: y,
      Ingresos: fy[y].revenue_usd != null ? +(fy[y].revenue_usd! / 1e9).toFixed(2) : null,
      CFO: fy[y].cfo_usd != null ? +(fy[y].cfo_usd! / 1e9).toFixed(2) : null,
      Capex: fy[y].capex_usd != null ? +(fy[y].capex_usd! / 1e9).toFixed(2) : null,
    }))
  }, [d])

  const backBtn = (
    <button onClick={goHome} style={{
      cursor: 'pointer', background: 'transparent', color: colors.accent.blue,
      border: `1px solid ${colors.border}`, borderRadius: radius.sm, padding: '6px 12px',
      fontSize: 13, marginBottom: space.lg,
    }}>← Volver</button>
  )

  if (err) return <div>{backBtn}<p style={{ color: colors.textMuted }}>No hay perfil para "{id}".</p></div>
  if (!d) return <div>{backBtn}<p style={{ color: colors.textMuted }}>Cargando perfil…</p></div>

  const r = d.row
  const link = (href: string | null, label: string) =>
    href ? <a href={href} target="_blank" rel="noreferrer" style={{ color: colors.accent.blue, fontSize: 13, marginRight: space.md }}>{label} ↗</a> : null

  return (
    <div style={{ maxWidth: 1000 }}>
      {backBtn}

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: space.md, marginBottom: space.lg }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 26 }}>{d.name}</h1>
            <span style={badge(categoryColor(d.category))}>{d.category}</span>
            {r.is_private && <span style={badge(colors.accent.gray)}>privada</span>}
          </div>
          <div style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>
            {r.canonical_ticker ? `${r.canonical_ticker}·${r.exchange} · ` : ''}{d.hq_city}, {d.country}
            {d.wikidata.founded ? ` · fundada ${d.wikidata.founded}` : ''}
            {d.wikidata.employees ? ` · ${num(d.wikidata.employees, 0)} empleados` : ''}
            {d.wikidata.isin ? ` · ISIN ${d.wikidata.isin}` : ''}
          </div>
        </div>
      </header>

      <div style={{ marginBottom: space.lg }}>
        {link(d.links.ir, 'Investor Relations')}
        {link(d.links.wikipedia, 'Wikipedia')}
        {link(d.links.latest_sec_filing, d.links.latest_sec_filing_label ?? 'Último filing SEC')}
        {link(d.links.sec_index, 'SEC EDGAR')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: space.md, marginBottom: space.xxl }}>
        <Metric label="Market cap" value={usd(r.market_cap_usd)} />
        <Metric label="Enterprise value" value={usd(r.enterprise_value_usd)} />
        <Metric label="EV/prod" value={evPerBoed(r.ev_per_boed_usd)} />
        <Metric label="EV/1P" value={usdBbl(r.ev_per_1p_boe_usd)} />
        <Metric label="DN/EBITDA" value={leverage(r.net_debt_to_ebitda)} />
        <Metric label="FCF yield" value={pct(r.fcf_yield_pct, 1)} />
        <Metric label="ROACE" value={pct(r.roace_pct, 1)} />
        <Metric label="CAGR ingresos" value={pct(d.cagr.revenue_3y_pct, 1)} />
        <Metric label="Producción" value={r.production_kboed != null ? `${num(r.production_kboed, 0)} kboe/d` : DASH} />
        <Metric label="% gas" value={pct(r.pct_gas, 0)} />
        <Metric label="Reservas 1P" value={r.reserves_1p_mmboe != null ? `${num(r.reserves_1p_mmboe, 0)} MMboe` : DASH} />
        <Metric label="R/P" value={r.rp_years != null ? `${num(r.rp_years, 1)} años` : DASH} />
      </div>

      {d.narrative_md && (
        <section style={{ marginBottom: space.xxl }}>
          <h2 style={{ fontSize: 15, color: colors.textPrimary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: space.md }}>Perfil</h2>
          <Markdown md={d.narrative_md} />
        </section>
      )}

      {chartData.length > 1 && (
        <section style={{ marginBottom: space.xxl }}>
          <h2 style={{ fontSize: 15, color: colors.textPrimary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: space.md }}>Financieras por año (US$ B, SEC)</h2>
          <div style={{ ...card, height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                <XAxis dataKey="year" stroke={colors.textMuted} fontSize={12} />
                <YAxis stroke={colors.textMuted} fontSize={12} />
                <Tooltip contentStyle={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.textPrimary }} />
                <Legend />
                <Bar dataKey="Ingresos" fill={colors.accent.blue} isAnimationActive={false} />
                <Bar dataKey="CFO" fill={colors.oil} isAnimationActive={false} />
                <Bar dataKey="Capex" fill={colors.accent.orange} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <footer style={{ color: colors.textDim, fontSize: 12, borderTop: `1px solid ${colors.border}`, paddingTop: space.md }}>
        Fuentes — Mercado: {d.provenance.market.source ?? '—'} ({shortDate(d.provenance.market.as_of)}) ·
        Financieras: {d.provenance.financials.source ?? '—'}{d.provenance.financials.fy ? ` FY${d.provenance.financials.fy}` : ''} ·
        Operativas: {d.provenance.operational.source ?? '—'}
        {d.provenance.operational.ref ? <> · <a href={d.provenance.operational.ref} target="_blank" rel="noreferrer" style={{ color: colors.accent.blue }}>ref ↗</a></> : null}
      </footer>
    </div>
  )
}
