import type { Family } from '../types'
import { colors, categoryColor, radius, space, selectStyle } from '../theme'

const FAMILY_LABEL: Record<Family, string> = {
  market: 'Mercado',
  financials: 'Financieras',
  operational: 'Operativas',
}

interface Props {
  categories: string[]
  countries: string[]
  selectedCats: Set<string>
  onToggleCat: (c: string) => void
  country: string
  onCountry: (c: string) => void
  query: string
  onQuery: (q: string) => void
  families: Record<Family, boolean>
  onToggleFamily: (f: Family) => void
}

export default function Filters(p: Props) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.md, alignItems: 'center', marginBottom: space.lg }}>
      <input
        value={p.query}
        onChange={(e) => p.onQuery(e.target.value)}
        placeholder="Buscar empresa / ticker…"
        style={{ ...selectStyle, minWidth: 200 }}
      />

      <select value={p.country} onChange={(e) => p.onCountry(e.target.value)} style={selectStyle}>
        <option value="">Todos los países</option>
        {p.countries.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      {/* category chips (multi-select) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.xs }}>
        {p.categories.map((cat) => {
          const on = p.selectedCats.has(cat)
          const col = categoryColor(cat)
          return (
            <button
              key={cat}
              onClick={() => p.onToggleCat(cat)}
              style={{
                cursor: 'pointer', fontSize: 12, fontWeight: 600,
                padding: '5px 11px', borderRadius: radius.pill,
                border: `1px solid ${on ? col : colors.border}`,
                background: on ? col + '22' : 'transparent',
                color: on ? col : colors.textMuted,
              }}
            >
              {cat}
            </button>
          )
        })}
      </div>

      <div style={{ flex: 1 }} />

      {/* metric-family toggles */}
      <div style={{ display: 'flex', gap: space.xs, alignItems: 'center' }}>
        <span style={{ color: colors.textDim, fontSize: 12 }}>Columnas:</span>
        {(Object.keys(FAMILY_LABEL) as Family[]).map((f) => {
          const on = p.families[f]
          return (
            <button
              key={f}
              onClick={() => p.onToggleFamily(f)}
              style={{
                cursor: 'pointer', fontSize: 12, fontWeight: 600,
                padding: '5px 11px', borderRadius: radius.sm,
                border: `1px solid ${colors.border}`,
                background: on ? colors.surfaceAlt : 'transparent',
                color: on ? colors.textPrimary : colors.textDim,
                opacity: on ? 1 : 0.6,
              }}
            >
              {on ? '✓ ' : ''}{FAMILY_LABEL[f]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
