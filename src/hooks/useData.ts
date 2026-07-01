import { useEffect, useState } from 'react'
import type { Company, Envelope, Meta } from '../types'

interface DataState {
  companies: Company[]
  meta: Meta | null
  generatedAt: string | null
  loading: boolean
  error: string | null
}

const base = import.meta.env.BASE_URL

export function useData(): DataState {
  const [state, setState] = useState<DataState>({
    companies: [], meta: null, generatedAt: null, loading: true, error: null,
  })

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch(`${base}data/companies.json`).then((r) => {
        if (!r.ok) throw new Error(`companies.json ${r.status}`)
        return r.json() as Promise<Envelope<Company[]>>
      }),
      fetch(`${base}data/meta.json`).then((r) => (r.ok ? (r.json() as Promise<Meta>) : null)).catch(() => null),
    ])
      .then(([env, meta]) => {
        if (!alive) return
        setState({
          companies: env.data,
          meta,
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
