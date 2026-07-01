// Shapes mirror the pipeline output in public/data/.

export interface SrcMeta {
  source: string | null
  as_of: string | null
  fy?: number | null
  ref?: string | null
}

export interface Company {
  id: string
  name: string
  category: string
  country: string
  hq_city: string | null
  canonical_ticker: string | null
  exchange: string | null
  is_private: boolean
  hq_coord: [number, number] | null

  // market (USD)
  market_cap_usd: number | null
  enterprise_value_usd: number | null
  ev_ebitda: number | null
  pe_ttm: number | null
  price: number | null
  price_currency: string | null
  dividend_yield_pct: number | null
  beta: number | null

  // financials (USD, latest FY)
  revenue_usd: number | null
  ebitda_usd: number | null
  net_debt_usd: number | null
  cfo_usd: number | null
  capex_usd: number | null

  // operational (curated)
  production_kboed: number | null
  pct_gas: number | null
  pct_liquids: number | null
  reserves_1p_mmboe: number | null
  reserves_2p_mmboe: number | null
  rp_years: number | null
  net_acreage_k: number | null
  corp_breakeven_usd_bbl: number | null

  src: {
    market: SrcMeta
    financials: SrcMeta
    operational: SrcMeta
  }
}

export interface Envelope<T> {
  generated_at: string
  source: string
  source_date: string | null
  data: T
}

export interface Meta {
  source_date: string
  counts: {
    companies: number
    with_market: number
    with_financials: number
    with_operational: number
  }
  market_source_breakdown: Record<string, number>
  operational_oldest: { id: string; as_of: string }[]
  warnings: string[]
}

export type Family = 'market' | 'financials' | 'operational'
