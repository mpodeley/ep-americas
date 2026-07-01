# Screener E&P Américas

Screening de empresas **E&P (upstream oil & gas) de América**: tabla comparable con métricas de mercado, financieras y operativas, mapa de casas matrices y perfiles por empresa. Sitio estático en **GitHub Pages**.

**Live:** https://mpodeley.github.io/ep-americas/ _(pendiente de primer deploy)_

## Qué hace

- **Tabla de screening** ordenable y filtrable (por categoría, país) con familias de métricas conmutables: mercado, financieras, operativas.
- **Frescura de datos**: cada grupo de métricas muestra su fecha (`as of`) y fuente; datos operativos viejos se marcan.
- **Mapa** de casas matrices (fase 3) y **perfiles narrativos** por empresa (fase 3).

## Arquitectura

GitHub Pages es hosting estático: el scraping **no** corre en Pages. Un pipeline Python corre afuera (local + GitHub Actions), genera JSON commiteado, y el front (React+TS+Vite) lo consume.

```
curated/      capa humana (el pipeline NUNCA la escribe; git = audit trail)
  seed.csv          universo: id, name, tickers, cik, sec_taxonomy, country, category, is_private
  operational.json  métricas operativas curadas por id
  overrides.json    correcciones manuales de cualquier campo scrapeado
  hq_coords.json    lat/lon de casa matriz por id
cache/        last-good scrapeado (commiteado → degradación elegante si CI falla)
scripts/      pipeline Python 3.12 (build_data.py + sources/)
public/data/  salida del pipeline consumida por el front (companies.json, meta.json)
src/          React + TS + Vite
```

### Fuentes de datos

| Familia | Fuente | Confiabilidad |
|---|---|---|
| Mercado / valuación | yfinance (Yahoo) | Best-effort; frágil, con caché de respaldo |
| Financieras auditadas | SEC EDGAR XBRL (`data.sec.gov`) | Confiable solo para filers SEC (10-K us-gaap, 20-F/40-F ifrs-full) |
| Operativas | Curación manual / asistida por IA | El diferenciador; sin fuente estructurada gratuita |

Precedencia de merge (menor→mayor): `sec < yfinance < cache-fallback < operational-curado < overrides`.

## Cómo correrlo

```bash
# Pipeline de datos (Python 3.12)
python -m pip install -r scripts/requirements.txt
python scripts/build_data.py            # genera public/data/companies.json + meta.json

# Frontend
npm install
npm run dev                             # http://localhost:5173
npm run build                           # dist/ (base: './')
```

El pipeline requiere un `User-Agent` para SEC EDGAR — configurable vía env `SEC_USER_AGENT` (default incluye contacto).

## Convenciones

- UI en **español**; código, variables y comentarios en **inglés**.
- Dinero en **USD absoluto**; producción **kboe/d**; reservas **MMboe**; `%` 0-100; fechas ISO-8601; `null` para faltante (nunca 0).
- Un solo `canonical_ticker` por empresa para valuación (evita doble conteo ADR vs listing local).

## Stack

React 19 + TypeScript + Vite (`base: './'`) · Python 3.12 (yfinance, requests) · deploy vía `peaceiris/actions-gh-pages`.
