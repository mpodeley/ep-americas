// Single source of truth for metric definitions. Powers the "Fuentes" tab so the
// documentation can't drift from the pipeline. Labels mirror ScreenerTable columns.
import type { Family } from './types'

export interface MetricDef {
  key: string
  label: string
  family: Family
  unit: string
  definition: string
  formula?: string
  source: string
  cadence: string
}

export const FAMILY_LABEL: Record<Family, string> = {
  market: 'Mercado / valuación',
  financials: 'Financieras (SEC XBRL)',
  operational: 'Operativas (curadas)',
  ratios: 'Ratios derivados',
  returns: 'Retornos / precio',
}

export const SOURCE_ORDER = 'SEC < yfinance < Wikidata < caché < curado < overrides'

export const METRICS: MetricDef[] = [
  // --- Mercado ---
  { key: 'market_cap_usd', label: 'Market cap', family: 'market', unit: 'US$', source: 'yfinance', cadence: 'Semanal',
    definition: 'Capitalización bursátil. Para ADR/listings en USD es directa; para listings locales (CAD/BRL) se convierte a USD con FX del día.' },
  { key: 'enterprise_value_usd', label: 'Enterprise value', family: 'market', unit: 'US$', source: 'Derivado', cadence: 'Semanal',
    formula: 'market_cap + deuda neta (SEC)', definition: 'Valor de empresa. Se reconstruye como market cap + deuda neta (ambos en USD) para evitar el EV de yfinance, que mezcla monedas en ADR extranjeros. Null si no hay deuda neta USD.' },
  { key: 'ev_ebitda', label: 'EV/EBITDA', family: 'market', unit: 'x', source: 'yfinance / derivado', cadence: 'Semanal',
    definition: 'Múltiplo de valuación. Se toma de yfinance; si falta, se calcula EV/EBITDA con EBITDA de SEC.' },
  { key: 'pe_ttm', label: 'P/E', family: 'market', unit: 'x', source: 'yfinance', cadence: 'Semanal',
    definition: 'Precio/utilidad (trailing). Frecuentemente nulo para nombres LatAm.' },
  { key: 'price', label: 'Precio', family: 'market', unit: 'moneda listing', source: 'yfinance', cadence: 'Semanal',
    definition: 'Último precio en la moneda del listing (se muestra con su divisa; no se mezcla en tablas USD).' },
  { key: 'dividend_yield_pct', label: 'Div. yield', family: 'market', unit: '%', source: 'yfinance', cadence: 'Semanal',
    definition: 'Rendimiento de dividendo anualizado.' },
  { key: 'beta', label: 'Beta', family: 'market', unit: '', source: 'yfinance', cadence: 'Semanal',
    definition: 'Sensibilidad al mercado. Nulo para varios listings no-US.' },

  // --- Financieras ---
  { key: 'revenue_usd', label: 'Ingresos', family: 'financials', unit: 'US$', source: 'SEC EDGAR XBRL', cadence: 'Anual (FY)',
    definition: 'Ingresos del último año fiscal auditado. Solo para filers SEC que reportan en USD (us-gaap o ifrs-full).' },
  { key: 'ebitda_usd', label: 'EBITDA', family: 'financials', unit: 'US$', source: 'SEC EDGAR XBRL', cadence: 'Anual (FY)',
    formula: 'resultado operativo + D&A', definition: 'Aproximado como resultado operativo + depreciación/amortización (no es un tag GAAP directo).' },
  { key: 'net_debt_usd', label: 'Deuda neta', family: 'financials', unit: 'US$', source: 'SEC EDGAR XBRL', cadence: 'Anual (FY)',
    formula: 'deuda LP − caja', definition: 'Deuda de largo plazo menos caja y equivalentes. Negativa = posición de caja neta.' },
  { key: 'cfo_usd', label: 'CFO', family: 'financials', unit: 'US$', source: 'SEC EDGAR XBRL', cadence: 'Anual (FY)',
    definition: 'Flujo de caja operativo del último FY.' },
  { key: 'capex_usd', label: 'Capex', family: 'financials', unit: 'US$', source: 'SEC EDGAR XBRL', cadence: 'Anual (FY)',
    definition: 'Inversión en propiedad, planta y equipo (salida de caja, normalizada a positivo).' },

  // --- Operativas ---
  { key: 'production_kboed', label: 'Producción', family: 'operational', unit: 'kboe/d', source: 'Curado (IA + reportes)', cadence: 'Trimestral/anual',
    definition: 'Producción neta total. Investigada de reportes públicos (FY2025 salvo indicado); cada empresa lleva fuente y fecha.' },
  { key: 'pct_gas', label: '% gas', family: 'operational', unit: '%', source: 'Curado', cadence: 'Trimestral/anual',
    definition: 'Participación de gas natural en la producción (0-100). % líquidos = 100 − % gas.' },
  { key: 'reserves_1p_mmboe', label: 'Reservas 1P', family: 'operational', unit: 'MMboe', source: 'Curado', cadence: 'Anual',
    definition: 'Reservas probadas (1P) netas. La base de reporte (SEC vs SPE-PRMS) varía entre empresas.' },
  { key: 'rp_years', label: 'R/P', family: 'operational', unit: 'años', source: 'Curado / derivado', cadence: 'Anual',
    formula: 'reservas 1P / producción anual', definition: 'Vida de reservas. Se toma del reporte o se deriva como reservas 1P / producción anualizada.' },
  { key: 'net_acreage_k', label: 'Acreage', family: 'operational', unit: 'k acres', source: 'Curado', cadence: 'Anual',
    definition: 'Superficie neta (principalmente shale US/Argentina).' },
  { key: 'corp_breakeven_usd_bbl', label: 'Breakeven', family: 'operational', unit: 'US$/bbl', source: 'Curado', cadence: 'Anual',
    definition: 'Breakeven corporativo WTI/Brent declarado por la empresa (cuando existe).' },

  // --- Ratios derivados ---
  { key: 'ev_per_boed_usd', label: 'EV/prod', family: 'ratios', unit: 'US$ por boe/d', source: 'Derivado', cadence: 'Semanal',
    formula: 'EV / (producción × 1000)', definition: 'EV por barril fluyente — el múltiplo de valuación upstream más citado. Requiere producción curada.' },
  { key: 'ev_per_1p_boe_usd', label: 'EV/1P', family: 'ratios', unit: 'US$/boe', source: 'Derivado', cadence: 'Semanal',
    formula: 'EV / reservas 1P', definition: 'EV por barril de reservas probadas. Sensible a la base de reporte de reservas.' },
  { key: 'net_debt_to_ebitda', label: 'DN/EBITDA', family: 'ratios', unit: 'x', source: 'Derivado', cadence: 'Anual/Semanal',
    formula: 'deuda neta / EBITDA', definition: 'Apalancamiento. Valor negativo se muestra como "net cash". Nulo si EBITDA ≤ 0.' },
  { key: 'fcf_usd', label: 'FCF', family: 'ratios', unit: 'US$', source: 'Derivado', cadence: 'Anual',
    formula: 'CFO − capex', definition: 'Flujo de caja libre del último FY.' },
  { key: 'fcf_yield_pct', label: 'FCF yield', family: 'ratios', unit: '%', source: 'Derivado', cadence: 'Semanal',
    formula: '100 × FCF / market cap', definition: 'Rendimiento de FCF sobre capitalización (equity yield). Nulo para privadas.' },
  { key: 'capex_to_cfo_pct', label: 'Capex/CFO', family: 'ratios', unit: '%', source: 'Derivado', cadence: 'Anual',
    formula: '100 × capex / CFO', definition: 'Tasa de reinversión. >100% = invierte más que su caja operativa.' },
  { key: 'roace_pct', label: 'ROACE', family: 'ratios', unit: '%', source: 'Derivado (SEC)', cadence: 'Anual',
    formula: '100 × EBIT / capital empleado medio', definition: 'Retorno sobre capital empleado medio (EBIT / promedio de activos − pasivos corrientes de 2 años).' },
  { key: 'cagr_revenue_3y_pct', label: 'CAGR ingresos', family: 'ratios', unit: '%', source: 'Derivado (SEC)', cadence: 'Anual',
    formula: '(últ/prim)^(1/n) − 1', definition: 'Crecimiento anual compuesto de ingresos sobre la serie SEC disponible (~3-4 años). Null si la base es ≤ 0.' },

  // --- Retornos / precio ---
  { key: 'ytd_return_pct', label: 'Retorno YTD', family: 'returns', unit: '%', source: 'yfinance', cadence: 'Semanal',
    definition: 'Variación de precio desde el primer cierre del año calendario.' },
  { key: 'return_1y_pct', label: 'Retorno 1 año', family: 'returns', unit: '%', source: 'yfinance', cadence: 'Semanal',
    definition: 'Variación a 12 meses sobre precio ajustado (aproxima retorno total con dividendos/splits).' },
  { key: 'pct_off_52w_high', label: 'vs máx 52s', family: 'returns', unit: '%', source: 'Derivado', cadence: 'Semanal',
    formula: '100 × (precio/máx − 1)', definition: 'Distancia porcentual al máximo de 52 semanas (en la moneda del listing).' },
  { key: 'realized_vol_1y_pct', label: 'Volatilidad 1a', family: 'returns', unit: '%', source: 'Derivado', cadence: 'Semanal',
    formula: 'stdev(log-ret diario) × √252', definition: 'Volatilidad realizada anualizada del último año.' },
]

// Honest limitations, shown in the Fuentes tab.
export const LIMITATIONS: string[] = [
  'Los datos de mercado (yfinance) son best-effort: Yahoo limita/bloquea IPs de CI, por lo que a veces se sirve el último valor cacheado en vez del más reciente.',
  'Los filers canadienses 40-F (CNRL, Cenovus, Suncor, Baytex) reportan en CAD: SEC no expone financieras en USD, así que quedan sin financieras SEC (se curan aparte).',
  'Las empresas privadas (Pluspetrol, Tecpetrol, Pan American) no tienen market cap ni múltiplos de mercado: solo datos operativos curados.',
  'Las métricas operativas (producción, reservas, breakeven) son investigadas por IA y curadas a mano, con link a la fuente y fecha "as of" por empresa. Verificar contra el reporte oficial antes de decisiones.',
  'La historia XBRL de filers IFRS (LatAm 20-F) es más fina que la de us-gaap: algunos años/campos pueden faltar.',
  'El enterprise value se reconstruye (market cap + deuda neta) para evitar la mezcla de monedas del EV de yfinance en ADR extranjeros.',
]
