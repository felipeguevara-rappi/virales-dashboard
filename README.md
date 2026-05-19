# Virales Dashboard — Rappi Turbo MX

Dashboard de análisis de campañas promocionales virales para Rappi Turbo México.
Procesa datos de Snowflake y genera un dashboard estático con métricas de impacto, retención, canibalización y operaciones.

## Stack

- **Frontend**: Next.js 16 + React 19 + Tailwind 4 + Recharts
- **Pipeline**: Node.js script → Snowflake SDK (SSO/EXTERNALBROWSER)
- **Data**: JSON estático (`public/full-data.json`)
- **Warehouse**: `RP_PERSONALUSER_WH` (XS, read-only role)

## Uso Diario

```bash
# 1. Actualizar CSV con nuevas campañas o cambios de Status
#    → catalogo_skus.csv

# 2. Ejecutar pipeline (solo procesa campañas <90 días, skipea frozen)
npm run export

# 3. Levantar dashboard local
npm run dev
# → http://localhost:3000
```

### Re-exportar todo (force)

```bash
npm run export -- --force
```

Esto ignora el cache y re-procesa las 55+ campañas (~4-5 horas en XS warehouse).

## Estructura del Proyecto

```
virales/
├── catalogo_skus.csv          # Input: campañas a analizar
├── public/full-data.json      # Output: datos procesados (generado)
├── scripts/
│   └── batch-export.js        # Pipeline principal (Snowflake → JSON)
├── src/
│   ├── app/
│   │   ├── static/page.tsx    # Página principal del dashboard
│   │   └── api/               # 11 API routes (legacy, no se usan)
│   ├── components/
│   │   ├── ExecutiveReport.tsx # Resumen ejecutivo del programa
│   │   ├── KPICards.tsx        # KPIs con split Growth/Maker
│   │   ├── OperationsAnalysis.tsx  # Stockout, cobertura, unidades
│   │   ├── RetentionBySegment.tsx  # Retención 15/30/45/60d por tipo usuario
│   │   ├── RepeatPurchase.tsx      # Recompra a 60 días
│   │   ├── CannibalizationChart.tsx
│   │   ├── CrossBasketAnalysis.tsx
│   │   ├── DemandShiftAnalysis.tsx
│   │   ├── PostViralDemand.tsx
│   │   ├── ProductAnalysis.tsx
│   │   ├── CampaignSelector.tsx
│   │   ├── Playbook.tsx
│   │   └── UserMixDonut.tsx
│   └── lib/
│       ├── campaigns.ts       # Parser del CSV (8 columnas)
│       ├── types.ts           # CampaignWithMeta, KPIData
│       └── snowflake.ts       # Conexión legacy (no se usa)
└── package.json
```

## Formato del CSV

| Columna | Ejemplo | Descripción |
|---------|---------|-------------|
| Nombre | "Snickers Chocolate 48g" | Nombre del producto |
| Sync | 6035 | SYNC_PRODUCT_ID en Snowflake |
| Viral | "Snickers" | Nombre agrupador de la campaña |
| Ciudad | "CDMX" o "Nacional" | Filtro geográfico |
| Budget Maker (MXN) | "$20,000" | Presupuesto del maker |
| Budget Growth (MXN) | "$6,000" | Presupuesto de Growth (Rappi) |
| Fecha | 2026-03-15 | Fecha del viral |
| Status | "Ejecutado" / "Pendiente" | Estado (solo procesa fecha <= hoy) |

Campañas con el mismo `Viral + Fecha` se agrupan automáticamente (múltiples SKUs por viral).

## Pipeline: batch-export.js

### Lógica de cache

- **FROZEN** (>90 días + datos existentes): usa cache, no consulta Snowflake
- **UPDATE** (<90 días + datos existentes): re-consulta todo
- **NEW** (sin datos): consulta completa

### Queries (9 endpoints por campaña)

1. **Impact** — GMV, unidades, órdenes, descuento, split Growth/Maker
2. **Cannibalization** — Baseline pre-viral vs día viral, multiplicador
3. **Demand Shift** — Tendencia post-viral (7d), net units impact
4. **Retention** — Recompra Turbo a 15/30/45/60d por segmento usuario
5. **Post-Demand** — Curva diaria post-viral
6. **Cross-Basket** — Ticket promedio, categorías complementarias
7. **Stockout** — Cobertura, sell-through, agotados
8. **Product Analysis** — Mix de productos, WHs que vendieron
9. **Repeat Purchase** — Recompra del mismo producto a 60d

### Optimizaciones

- **Batch de 2**: óptimo para XS warehouse
- **Temp tables únicos**: `viral_base_{name8}_{date}` evita race conditions
- **Lookback 120d**: user classification (vs 3 años original)
- **GOD-first**: repeat purchase empieza por tabla particionada (GOD) y luego JOIN estrecho con ORDERS
- **City filter**: CTE con warehouse filter reduce scope

## Reglas Críticas de Datos

1. **SIEMPRE** usar `STORE_TYPE_STORE ILIKE '%turbo%'` al consultar `DES_PROD.ORDERS` para métricas Turbo.
   Sin este filtro se incluyen Food, Restaurants, etc. → métricas infladas.

2. **Clasificación de usuarios**:
   - NEW = sin compra Turbo en 120 días previos
   - REACTIVATED = compra Turbo en 120d pero NO en últimos 30d
   - EXISTING = compra Turbo en últimos 30d

3. **Funding**: `LIST_ALLIES ILIKE '%MOUSTACHE BEAMS%'` = Growth (Rappi paga), otro = Maker

4. **Join keys**: `MX_DISCOUNT_DETAILS.PRODUCT_ID = GOD.REFERENCE_ID`, `DISCOUNT_ORDER_ID = ORDER_ID`

## Snowflake

| Parámetro | Valor |
|-----------|-------|
| Account | RAPPIORG-HG51401 |
| Auth | EXTERNALBROWSER (SSO + token cache) |
| Warehouse | RP_PERSONALUSER_WH (XS) |
| Role | RP_READ_ACCESS_PU_ROLE (read-only) |
| Database | RP_SILVER_DB_PROD |
| Schema | TURBO_CORE |

### Tablas principales

| Tabla | Rows | Notas |
|-------|------|-------|
| `TURBO_CORE.GLOBAL_ORDER_DISCOUNTS` | 346M | Particionada por CREATED_AT (DATE) |
| `DES_PROD.ORDERS` | 2B | Sin clustering, tiene STORE_TYPE_STORE |
| `FIVETRAN.GLOBAL_FINANCES.MX_DISCOUNT_DETAILS` | 771M | DISCOUNT_AT (TIMESTAMP_TZ) |
| `TURBO_CORE.GLOBAL_INVENTORY_COST` | 1.45B | Historia de stock |
| `TURBO_CORE.GLOBAL_WAREHOUSE_NEW` | 2,895 | Metadata de warehouses |

## Scripts

```bash
npm run export       # Ejecuta pipeline incremental
npm run export -- --force  # Re-exporta todo
npm run dev          # Dev server (localhost:3000)
npm run build        # Build producción
```

## Troubleshooting

- **Export tarda mucho**: Normal ~4-5h para 55 campañas en XS. El bottleneck es `DES_PROD.ORDERS` (2B rows sin clustering).
- **SSO se vence**: Si falla la conexión, borra el token cache y re-autentica: se abrirá el browser.
- **Retención 100%**: Verificar que el filtro `ILIKE '%turbo%'` esté presente en `user_history` Y en la query de retención.
- **Operational coverage 0**: Revisar que se use `reduce(max)` sobre todos los productos, no solo `products[0]`.
