import { useMemo, useState } from 'react'
import type { Company, Family } from '../types'
import { colors, categoryColor, radius, space, badge } from '../theme'
import { usd, num, pct, price, isStale, DASH } from '../utils/format'

interface Col {
  key: keyof Company
  label: string
  family: 'id' | Family
  numeric: boolean
  fmt: (c: Company) => string
  title?: string
}

const FAMILY_COLOR: Record<Family, string> = {
  market: colors.accent.blue,
  financials: colors.accent.purple,
  operational: colors.oil,
}

const COLS: Col[] = [
  { key: 'name', label: 'Empresa', family: 'id', numeric: false, fmt: (c) => c.name },
  { key: 'category', label: 'Categoría', family: 'id', numeric: false, fmt: (c) => c.category },
  { key: 'country', label: 'País', family: 'id', numeric: false, fmt: (c) => c.country },
  // market
  { key: 'market_cap_usd', label: 'Market cap', family: 'market', numeric: true, fmt: (c) => usd(c.market_cap_usd) },
  { key: 'ev_ebitda', label: 'EV/EBITDA', family: 'market', numeric: true, fmt: (c) => num(c.ev_ebitda, 1) },
  { key: 'pe_ttm', label: 'P/E', family: 'market', numeric: true, fmt: (c) => num(c.pe_ttm, 1) },
  { key: 'price', label: 'Precio', family: 'market', numeric: true, fmt: (c) => price(c.price, c.price_currency) },
  { key: 'dividend_yield_pct', label: 'Div. %', family: 'market', numeric: true, fmt: (c) => pct(c.dividend_yield_pct, 1) },
  { key: 'beta', label: 'Beta', family: 'market', numeric: true, fmt: (c) => num(c.beta, 2) },
  // financials
  { key: 'revenue_usd', label: 'Ingresos', family: 'financials', numeric: true, fmt: (c) => usd(c.revenue_usd), title: 'Último año fiscal (SEC XBRL)' },
  { key: 'ebitda_usd', label: 'EBITDA', family: 'financials', numeric: true, fmt: (c) => usd(c.ebitda_usd), title: 'Op. income + DD&A' },
  { key: 'net_debt_usd', label: 'Deuda neta', family: 'financials', numeric: true, fmt: (c) => usd(c.net_debt_usd) },
  { key: 'cfo_usd', label: 'CFO', family: 'financials', numeric: true, fmt: (c) => usd(c.cfo_usd), title: 'Flujo de caja operativo' },
  { key: 'capex_usd', label: 'Capex', family: 'financials', numeric: true, fmt: (c) => usd(c.capex_usd) },
  // operational
  { key: 'production_kboed', label: 'Prod. kboe/d', family: 'operational', numeric: true, fmt: (c) => num(c.production_kboed, 0) },
  { key: 'pct_gas', label: '% gas', family: 'operational', numeric: true, fmt: (c) => pct(c.pct_gas, 0) },
  { key: 'reserves_1p_mmboe', label: 'Reservas 1P', family: 'operational', numeric: true, fmt: (c) => num(c.reserves_1p_mmboe, 0), title: 'MMboe' },
  { key: 'rp_years', label: 'R/P (a)', family: 'operational', numeric: true, fmt: (c) => num(c.rp_years, 1) },
  { key: 'corp_breakeven_usd_bbl', label: 'Breakeven', family: 'operational', numeric: true, fmt: (c) => num(c.corp_breakeven_usd_bbl, 0), title: 'US$/bbl' },
]

function cmp(a: unknown, b: unknown, dir: 1 | -1): number {
  const an = a == null, bn = b == null
  if (an && bn) return 0
  if (an) return 1 // nulls always last
  if (bn) return -1
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir
  return String(a).localeCompare(String(b)) * dir
}

interface Props {
  companies: Company[]
  families: Record<Family, boolean>
  sourceDate: string | null
}

export default function ScreenerTable({ companies, families, sourceDate }: Props) {
  const [sortKey, setSortKey] = useState<keyof Company>('market_cap_usd')
  const [dir, setDir] = useState<1 | -1>(-1)

  const cols = COLS.filter((c) => c.family === 'id' || families[c.family])

  const sorted = useMemo(() => {
    return [...companies].sort((x, y) => cmp(x[sortKey], y[sortKey], dir))
  }, [companies, sortKey, dir])

  function onSort(key: keyof Company) {
    if (key === sortKey) setDir((d) => (d === 1 ? -1 : 1))
    else { setSortKey(key); setDir(-1) }
  }

  const th: React.CSSProperties = {
    position: 'sticky', top: 0, background: colors.surfaceAlt, color: colors.textMuted,
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    padding: '10px 12px', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
    borderBottom: `1px solid ${colors.border}`,
  }

  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${colors.border}`, borderRadius: radius.lg }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            {cols.map((c) => {
              const active = c.key === sortKey
              const accent = c.family === 'id' ? colors.border : FAMILY_COLOR[c.family]
              return (
                <th
                  key={c.key}
                  onClick={() => onSort(c.key)}
                  title={c.title}
                  style={{
                    ...th,
                    textAlign: c.numeric ? 'right' : 'left',
                    color: active ? colors.textPrimary : colors.textMuted,
                    borderTop: `2px solid ${accent}`,
                  }}
                >
                  {c.label}{active ? (dir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((c, i) => (
            <tr key={c.id} style={{ background: i % 2 ? colors.bg : colors.surface }}>
              {cols.map((col) => {
                const stale = col.family === 'operational' && isStale(c.src.operational.as_of, sourceDate)
                const isName = col.key === 'name'
                const isCat = col.key === 'category'
                return (
                  <td
                    key={col.key}
                    style={{
                      padding: '9px 12px', whiteSpace: 'nowrap',
                      textAlign: col.numeric ? 'right' : 'left',
                      fontVariantNumeric: 'tabular-nums',
                      color: stale ? colors.textDim : colors.textSecondary,
                      borderBottom: `1px solid ${colors.border}`,
                    }}
                    title={stale ? `Dato operativo al ${c.src.operational.as_of} (posiblemente desactualizado)` : undefined}
                  >
                    {isName ? (
                      <span>
                        <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{c.name}</span>
                        {c.canonical_ticker && (
                          <span style={{ color: colors.textDim, marginLeft: 6, fontSize: 11 }}>
                            {c.canonical_ticker}{c.exchange ? `·${c.exchange}` : ''}
                          </span>
                        )}
                        {c.is_private && (
                          <span style={{ ...badge(colors.accent.gray), marginLeft: 6 }}>privada</span>
                        )}
                      </span>
                    ) : isCat ? (
                      <span style={badge(categoryColor(c.category))}>{c.category}</span>
                    ) : (
                      col.fmt(c) || DASH
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={cols.length} style={{ padding: space.xxl, textAlign: 'center', color: colors.textMuted }}>
                Sin resultados para los filtros actuales.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
