import { useEffect, useMemo, useState } from 'react'
import type { Company } from '../types'
import { colors, categoryColor, radius, space } from '../theme'
import { usd } from '../utils/format'

// Equirectangular (plate carrée) window over the Americas. Mid-lat ≈ equator so
// lon/lat distortion is mild; we keep equal pixels-per-degree on both axes.
const LON0 = -128, LON1 = -32, LAT0 = -56, LAT1 = 62
const W = 460
const K = W / (LON1 - LON0)
const H = (LAT1 - LAT0) * K

function projX(lon: number) { return (lon - LON0) * K }
function projY(lat: number) { return (LAT1 - lat) * K }

type Ring = number[][]
function ringPath(ring: Ring): string {
  return ring.map(([lon, lat], i) => `${i ? 'L' : 'M'}${projX(lon).toFixed(1)},${projY(lat).toFixed(1)}`).join('') + 'Z'
}
function geomPath(geom: { type: string; coordinates: unknown }): string {
  if (geom.type === 'Polygon') return (geom.coordinates as Ring[]).map(ringPath).join('')
  if (geom.type === 'MultiPolygon') return (geom.coordinates as Ring[][]).flat().map(ringPath).join('')
  return ''
}

interface BaseFeature { properties: { name: string }; geometry: { type: string; coordinates: unknown } }

const base = import.meta.env.BASE_URL

export default function MapaAmericas({ companies }: { companies: Company[] }) {
  const [features, setFeatures] = useState<BaseFeature[]>([])
  const [hover, setHover] = useState<Company | null>(null)

  useEffect(() => {
    fetch(`${base}data/geo/americas.json`)
      .then((r) => r.json())
      .then((gj) => setFeatures(gj.features))
      .catch(() => setFeatures([]))
  }, [])

  // Companies with coords, with pixel offsets so those sharing a city don't overlap.
  const markers = useMemo(() => {
    const withCoord = companies.filter((c) => c.hq_coord)
    const groups = new Map<string, Company[]>()
    for (const c of withCoord) {
      const key = c.hq_coord!.join(',')
      const g = groups.get(key) ?? []
      g.push(c)
      groups.set(key, g)
    }
    const out: { c: Company; x: number; y: number; r: number }[] = []
    for (const g of groups.values()) {
      g.forEach((c, i) => {
        const [lat, lon] = c.hq_coord!
        let x = projX(lon), y = projY(lat)
        if (g.length > 1) {
          const ang = (i / g.length) * Math.PI * 2
          const spread = 7
          x += Math.cos(ang) * spread
          y += Math.sin(ang) * spread
        }
        const mc = c.market_cap_usd ?? 0
        const r = Math.max(3.5, Math.min(11, 3.5 + Math.sqrt(mc / 1e9)))
        out.push({ c, x, y, r })
      })
    }
    return out
  }, [companies])

  const categories = Array.from(new Set(companies.map((c) => c.category))).sort()

  return (
    <div style={{ display: 'flex', gap: space.lg, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ position: 'relative', border: `1px solid ${colors.border}`, borderRadius: radius.lg, background: colors.surface, padding: space.sm }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 'min(460px, 90vw)', height: 'auto', display: 'block' }}>
          {features.map((f) => (
            <path key={f.properties.name} d={geomPath(f.geometry)}
              fill={colors.surfaceAlt} stroke={colors.border} strokeWidth={0.5} />
          ))}
          {markers.map(({ c, x, y, r }) => (
            <circle key={c.id} cx={x} cy={y} r={r}
              fill={categoryColor(c.category)} fillOpacity={0.85}
              stroke={hover?.id === c.id ? colors.textPrimary : colors.bg} strokeWidth={hover?.id === c.id ? 1.5 : 0.6}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover((h) => (h?.id === c.id ? null : h))}>
              <title>{c.name}</title>
            </circle>
          ))}
        </svg>
        {hover && (
          <div style={{
            position: 'absolute', top: space.sm, left: space.sm, background: colors.bg,
            border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: '6px 10px',
            fontSize: 12, pointerEvents: 'none', maxWidth: 220,
          }}>
            <strong style={{ color: colors.textPrimary }}>{hover.name}</strong>
            <div style={{ color: colors.textMuted }}>{hover.hq_city} · {hover.category}</div>
            <div style={{ color: colors.textSecondary }}>
              {hover.market_cap_usd ? usd(hover.market_cap_usd) : 'privada / s/d'}
              {hover.production_kboed ? ` · ${hover.production_kboed} kboe/d` : ''}
            </div>
          </div>
        )}
      </div>

      <div>
        <div style={{ color: colors.textMuted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: space.sm }}>
          Categoría · tamaño ∝ market cap
        </div>
        {categories.map((cat) => (
          <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: space.sm, marginBottom: 4 }}>
            <span style={{ width: 12, height: 12, borderRadius: 6, background: categoryColor(cat), display: 'inline-block' }} />
            <span style={{ color: colors.textSecondary, fontSize: 13 }}>{cat}</span>
          </div>
        ))}
        <div style={{ color: colors.textDim, fontSize: 11, marginTop: space.md, maxWidth: 220 }}>
          Casas matrices; empresas de una misma ciudad se dispersan levemente.
        </div>
      </div>
    </div>
  )
}
