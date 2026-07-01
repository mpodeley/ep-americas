import { useMemo, useState } from 'react'
import type { Family } from './types'
import { useData } from './hooks/useData'
import { colors, space, radius } from './theme'
import { shortDate } from './utils/format'
import Filters from './components/Filters'
import ScreenerTable from './components/ScreenerTable'
import MapaAmericas from './components/MapaAmericas'

export default function App() {
  const { companies, meta, generatedAt, loading, error } = useData()

  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set())
  const [country, setCountry] = useState('')
  const [query, setQuery] = useState('')
  const [families, setFamilies] = useState<Record<Family, boolean>>({
    market: true, financials: true, operational: true,
  })
  const [view, setView] = useState<'tabla' | 'mapa'>('tabla')

  const categories = useMemo(
    () => Array.from(new Set(companies.map((c) => c.category))).sort(),
    [companies],
  )
  const countries = useMemo(
    () => Array.from(new Set(companies.map((c) => c.country))).sort(),
    [companies],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return companies.filter((c) =>
      (selectedCats.size === 0 || selectedCats.has(c.category)) &&
      (!country || c.country === country) &&
      (!q || c.name.toLowerCase().includes(q) || (c.canonical_ticker ?? '').toLowerCase().includes(q)),
    )
  }, [companies, selectedCats, country, query])

  const sourceDate = meta?.source_date ?? (generatedAt ? generatedAt.slice(0, 10) : null)

  function toggleCat(c: string) {
    setSelectedCats((prev) => {
      const next = new Set(prev)
      next.has(c) ? next.delete(c) : next.add(c)
      return next
    })
  }
  function toggleFamily(f: Family) {
    setFamilies((prev) => ({ ...prev, [f]: !prev[f] }))
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.bg, color: colors.textPrimary,
      padding: space.xxl, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <header style={{ marginBottom: space.lg, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.lg, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Screener E&P Américas</h1>
          <p style={{ margin: `${space.xs}px 0 0`, color: colors.textMuted, fontSize: 14 }}>
            Empresas E&P (upstream) de América — mercado, financieras y operativas.
          </p>
        </div>
        <div style={{ display: 'flex', gap: space.xs }}>
          {(['tabla', 'mapa'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} style={{
              cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '7px 14px',
              borderRadius: radius.sm, border: `1px solid ${colors.border}`,
              background: view === v ? colors.accent.blue + '22' : 'transparent',
              color: view === v ? colors.accent.blue : colors.textMuted, textTransform: 'capitalize',
            }}>{v}</button>
          ))}
        </div>
      </header>

      {loading && <p style={{ color: colors.textMuted }}>Cargando datos…</p>}
      {error && (
        <div style={{ background: colors.accent.red + '22', color: colors.accent.red,
          padding: space.md, borderRadius: radius.md }}>
          Error cargando datos: {error}. ¿Corriste <code>python scripts/build_data.py</code>?
        </div>
      )}

      {!loading && !error && (
        <>
          <Filters
            categories={categories}
            countries={countries}
            selectedCats={selectedCats}
            onToggleCat={toggleCat}
            country={country}
            onCountry={setCountry}
            query={query}
            onQuery={setQuery}
            families={families}
            onToggleFamily={toggleFamily}
          />

          {view === 'tabla'
            ? <ScreenerTable companies={filtered} families={families} sourceDate={sourceDate} />
            : <MapaAmericas companies={filtered} />}

          <footer style={{ marginTop: space.lg, color: colors.textDim, fontSize: 12,
            display: 'flex', gap: space.lg, flexWrap: 'wrap' }}>
            <span>{filtered.length} de {companies.length} empresas</span>
            <span>Actualizado: {shortDate(generatedAt)}</span>
            {meta && (
              <span>
                Mercado: {meta.counts.with_market} · Financieras: {meta.counts.with_financials} · Operativas: {meta.counts.with_operational}
              </span>
            )}
            <span style={{ color: colors.textDim }}>
              Mercado: yfinance · Financieras: SEC EDGAR · Operativas: curadas
            </span>
          </footer>
        </>
      )}
    </div>
  )
}
