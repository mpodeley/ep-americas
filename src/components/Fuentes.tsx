import type { Family, Meta } from '../types'
import { colors, radius, space, card, badge } from '../theme'
import { METRICS, FAMILY_LABEL, LIMITATIONS, SOURCE_ORDER, type MetricDef } from '../metrics'
import { shortDate } from '../utils/format'

const FAMILIES: Family[] = ['market', 'financials', 'operational', 'ratios']

function Flow() {
  const steps = [
    'Fuentes: SEC EDGAR · yfinance · Wikidata · FRED · Curado',
    'Merge por precedencia',
    'Validación (rangos)',
    'JSON público',
  ]
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
      {steps.map((s, i) => (
        <span key={s} style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
          <span style={{
            background: colors.surfaceAlt, border: `1px solid ${colors.border}`,
            borderRadius: radius.md, padding: '6px 12px', fontSize: 12, color: colors.textSecondary,
          }}>{s}</span>
          {i < steps.length - 1 && <span style={{ color: colors.textDim }}>→</span>}
        </span>
      ))}
    </div>
  )
}

function Freshness({ meta, generatedAt }: { meta: Meta | null; generatedAt: string | null }) {
  if (!meta) return null
  const b = meta.market_source_breakdown ?? {}
  const cells: [string, string][] = [
    ['Última actualización', shortDate(generatedAt ?? meta.source_date)],
    ['Empresas', String(meta.counts.companies)],
    ['Con mercado', String(meta.counts.with_market)],
    ['Con financieras', String(meta.counts.with_financials)],
    ['Con operativas', String(meta.counts.with_operational)],
    ['Mercado en vivo / caché', `${b.yfinance ?? 0} / ${(b.cache ?? 0) + (b.none ?? 0)}`],
  ]
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.md }}>
      {cells.map(([k, v]) => (
        <div key={k} style={{ ...card, padding: space.md, minWidth: 150 }}>
          <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}</div>
          <div style={{ color: colors.textPrimary, fontSize: 20, fontWeight: 700, marginTop: 4 }}>{v}</div>
        </div>
      ))}
      {meta.operational_oldest?.length > 0 && (
        <div style={{ ...card, padding: space.md, minWidth: 220 }}>
          <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Operativas más antiguas</div>
          <div style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
            {meta.operational_oldest.slice(0, 4).map((o) => `${o.id} (${o.as_of})`).join(' · ')}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricsTable() {
  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: `1px solid ${colors.border}` }
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13, color: colors.textSecondary, borderBottom: `1px solid ${colors.border}`, verticalAlign: 'top' }
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${colors.border}`, borderRadius: radius.lg }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
        <thead>
          <tr>
            {['Métrica', 'Definición', 'Fórmula', 'Unidad', 'Fuente', 'Cadencia'].map((h) => (
              <th key={h} style={{ ...th, position: 'sticky', top: 0, background: colors.surfaceAlt }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FAMILIES.map((fam) => (
            <FamilyRows key={fam} fam={fam} td={td} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FamilyRows({ fam, td }: { fam: Family; td: React.CSSProperties }) {
  const rows = METRICS.filter((m: MetricDef) => m.family === fam)
  return (
    <>
      <tr>
        <td colSpan={6} style={{ padding: '10px 12px', background: colors.bg }}>
          <span style={badge(colors.accent.cyan)}>{FAMILY_LABEL[fam]}</span>
        </td>
      </tr>
      {rows.map((m) => (
        <tr key={m.key}>
          <td style={{ ...td, color: colors.textPrimary, fontWeight: 600, whiteSpace: 'nowrap' }}>{m.label}</td>
          <td style={{ ...td, maxWidth: 360 }}>{m.definition}</td>
          <td style={{ ...td, color: colors.textDim, whiteSpace: 'nowrap' }}>{m.formula ?? '—'}</td>
          <td style={{ ...td, whiteSpace: 'nowrap' }}>{m.unit || '—'}</td>
          <td style={{ ...td, whiteSpace: 'nowrap' }}>{m.source}</td>
          <td style={{ ...td, whiteSpace: 'nowrap' }}>{m.cadence}</td>
        </tr>
      ))}
    </>
  )
}

export default function Fuentes({ meta, generatedAt }: { meta: Meta | null; generatedAt: string | null }) {
  const section: React.CSSProperties = { marginBottom: space.xxl }
  const h2: React.CSSProperties = { fontSize: 15, color: colors.textPrimary, margin: `0 0 ${space.md}px`, textTransform: 'uppercase', letterSpacing: 1 }
  return (
    <div style={{ maxWidth: 1000 }}>
      <p style={{ color: colors.textMuted, fontSize: 14, marginTop: 0 }}>
        De dónde sale cada número. El pipeline combina fuentes públicas por orden de precedencia
        (<code style={{ color: colors.textSecondary }}>{SOURCE_ORDER}</code>): lo curado y verificado siempre gana sobre lo scrapeado.
      </p>

      <div style={section}>
        <h2 style={h2}>Frescura de datos</h2>
        <Freshness meta={meta} generatedAt={generatedAt} />
      </div>

      <div style={section}>
        <h2 style={h2}>Pipeline</h2>
        <Flow />
      </div>

      <div style={section}>
        <h2 style={h2}>Métricas: definición y fuente</h2>
        <MetricsTable />
      </div>

      <div style={section}>
        <h2 style={h2}>Limitaciones (leer)</h2>
        <ul style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 1.6, paddingLeft: space.lg, margin: 0 }}>
          {LIMITATIONS.map((l, i) => <li key={i} style={{ marginBottom: 6 }}>{l}</li>)}
        </ul>
      </div>
    </div>
  )
}
