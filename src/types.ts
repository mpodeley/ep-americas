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

  // derived ratios (computed in the pipeline; no network)
  ev_per_boed_usd: number | null
  ev_per_1p_boe_usd: number | null
  net_debt_to_ebitda: number | null
  fcf_usd: number | null
  fcf_yield_pct: number | null
  capex_to_cfo_pct: number | null
  roace_pct: number | null
  cagr_revenue_3y_pct: number | null
  cagr_cfo_3y_pct: number | null

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

export interface FinancialsYear {
  revenue_usd: number | null
  ebitda_usd: number | null
  net_debt_usd: number | null
  cfo_usd: number | null
  capex_usd: number | null
  ebit_usd: number | null
  capital_employed_usd: number | null
}

export interface CompanyDetail {
  id: string
  name: string
  category: string
  country: string
  hq_city: string | null
  hq_coord: [number, number] | null
  row: Company
  financials_by_year: Record<string, FinancialsYear>
  cagr: { revenue_3y_pct: number | null; cfo_3y_pct: number | null }
  wikidata: {
    qid?: string; founded?: number; employees?: number
    website?: string; isin?: string; label?: string; wikipedia?: string
  }
  narrative_md: string | null
  links: {
    ir: string | null
    wikipedia: string | null
    latest_sec_filing: string | null
    latest_sec_filing_label: string | null
    sec_index: string | null
  }
  provenance: Company['src']
}

export type Family = 'market' | 'financials' | 'operational' | 'ratios'
