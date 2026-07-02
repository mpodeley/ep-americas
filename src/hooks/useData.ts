import { useEffect, useState } from 'react'
import type { Company, Commodities, Envelope, Meta } from '../types'

interface DataState {
  companies: Company[]
  meta: Meta | null
  commodities: Commodities | null
  generatedAt: string | null
  loading: boolean
  error: string | null
}

const base = import.meta.env.BASE_URL

export function useData(): DataState {
  const [state, setState] = useState<DataState>({
    companies: [], meta: null, commodities: null, generatedAt: null, loading: true, error: null,
  })

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch(`${base}data/companies.json`).then((r) => {
        if (!r.ok) throw new Error(`companies.json ${r.status}`)
        return r.json() as Promise<Envelope<Company[]>>
      }),
      fetch(`${base}data/meta.json`).then((r) => (r.ok ? (r.json() as Promise<Meta>) : null)).catch(() => null),
      fetch(`${base}data/commodities.json`).then((r) => (r.ok ? (r.json() as Promise<Envelope<Commodities>>) : null)).catch(() => null),
    ])
      .then(([env, meta, commo]) => {
        if (!alive) return
        setState({
          companies: env.data,
          meta,
          commodities: commo?.data ?? null,
          generatedAt: env.generated_at,
          loading: false,
          error: null,
        })
      })
      .catch((e: unknown) => {
        if (!alive) return
        setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }))
      })
    return () => { alive = false }
  }, [])

  return state
}
