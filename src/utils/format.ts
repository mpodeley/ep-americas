// Display formatting. UI is Spanish; values follow the pipeline's canonical units.

export const DASH = '—'

export function usd(v: number | null | undefined): string {
  if (v == null) return DASH
  const a = Math.abs(v)
  if (a >= 1e12) return `US$ ${(v / 1e12).toFixed(2)} T`
  if (a >= 1e9) return `US$ ${(v / 1e9).toFixed(1)} B`
  if (a >= 1e6) return `US$ ${(v / 1e6).toFixed(0)} M`
  return `US$ ${v.toFixed(0)}`
}

export function num(v: number | null | undefined, digits = 1): string {
  if (v == null) return DASH
  return v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: digits })
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v == null) return DASH
  return `${v.toFixed(digits)}%`
}

export function price(v: number | null | undefined, currency: string | null | undefined): string {
  if (v == null) return DASH
  return `${currency ?? ''} ${v.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`.trim()
}

// True if `asOf` is older than `days` before `ref` (both ISO-8601). Used to grey out
// stale operational figures.
export function isStale(asOf: string | null | undefined, ref: string | null | undefined, days = 180): boolean {
  if (!asOf || !ref) return false
  const d = Date.parse(asOf)
  const r = Date.parse(ref)
  if (isNaN(d) || isNaN(r)) return false
  return r - d > days * 86_400_000
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return DASH
  return iso.slice(0, 10)
}

// Net debt / EBITDA: negative means net cash, not a negative multiple.
export function leverage(v: number | null | undefined): string {
  if (v == null) return DASH
  if (v < 0) return 'net cash'
  return `${v.toFixed(2)}x`
}

// EV per flowing barrel: US$ per boe/d, shown in thousands.
export function evPerBoed(v: number | null | undefined): string {
  if (v == null) return DASH
  return `US$ ${(v / 1000).toFixed(0)}k`
}

// US$ per barrel (EV per 1P reserve boe, breakeven, etc.)
export function usdBbl(v: number | null | undefined): string {
  if (v == null) return DASH
  return `US$ ${v.toFixed(1)}`
}
