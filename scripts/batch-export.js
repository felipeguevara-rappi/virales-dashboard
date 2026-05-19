/**
 * Virales Full Data Export — Single Source of Truth
 * 
 * Generates public/full-data.json with the EXACT same schema as all 9 API routes.
 * Implements cache intelligence:
 *   - FROZEN (>90 days old + data exists): skip Snowflake
 *   - UPDATE (<90 days): re-query all endpoints
 *   - NEW (no data): full query set
 * 
 * Usage: node scripts/batch-export.js
 */
const snowflake = require('snowflake-sdk');
const fs = require('fs');
const path = require('path');

snowflake.configure({ logLevel: 'ERROR' });

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parses a budget string (e.g. "$50,000") into an integer.
 * Returns 0 for empty/invalid values.
 */
function parseBudget(raw) {
  if (!raw) return 0;
  return parseInt(String(raw).replace(/[$,]/g, ''), 10) || 0;
}

// ─── CSV Parser ─────────────────────────────────────────────────────────────
function loadCampaigns() {
  const csvPath = path.join(__dirname, '..', 'catalogo_skus.csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.trim().split('\n');
  const today = new Date().toISOString().slice(0, 10);

  const groups = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = []; let current = '', inQuotes = false;
    for (const ch of line) { if (ch === '"') { inQuotes = !inQuotes; continue; } if (ch === ',' && !inQuotes) { parts.push(current.trim()); current = ''; continue; } current += ch; }
    parts.push(current.trim());
    if (parts.length < 5) continue;
    // Support both formats: old (Nombre,Sync,Viral,Fecha,Status) and new (Nombre,Sync,Viral,Ciudad,BudgetMaker,BudgetGrowth,Fecha,Status)
    let producto, syncRaw, viral, fecha, status, ciudad = '', budgetMaker = 0, budgetGrowth = 0;
    if (parts.length >= 8) {
      ciudad = parts[3] || '';
      budgetMaker = parseBudget(parts[4]);
      budgetGrowth = parseBudget(parts[5]);
      [producto, syncRaw, viral, , , , fecha, status] = parts;
    } else {
      [producto, syncRaw, viral, fecha, status] = parts;
    }
    const syncId = parseInt(syncRaw, 10);
    if (isNaN(syncId) || !viral || !fecha) continue;
    const key = `${viral}|${fecha}`;
    if (!groups.has(key)) groups.set(key, { name: viral, date: fecha, ids: [], productos: [], ciudad: '', budgetMaker: 0, budgetGrowth: 0 });
    const g = groups.get(key);
    if (!g.ids.includes(syncId)) g.ids.push(syncId);
    if (producto && !g.productos.includes(producto)) g.productos.push(producto);
    // Use first non-empty ciudad; accumulate budgets via MAX
    if (!g.ciudad && ciudad) g.ciudad = ciudad;
    if (budgetMaker > g.budgetMaker) g.budgetMaker = budgetMaker;
    if (budgetGrowth > g.budgetGrowth) g.budgetGrowth = budgetGrowth;
  }

  const campaigns = [];
  for (const g of groups.values()) {
    if (g.date <= today) {
      campaigns.push({ name: g.name, date: g.date, ids: g.ids, productos: g.productos, ciudad: g.ciudad, budgetMaker: g.budgetMaker, budgetGrowth: g.budgetGrowth });
    }
  }
  campaigns.sort((a, b) => a.date.localeCompare(b.date));
  return campaigns;
}

// ─── Snowflake Connection ───────────────────────────────────────────────────
let conn = null;
function connect() {
  return new Promise((resolve, reject) => {
    const c = snowflake.createConnection({
      account: 'RAPPIORG-HG51401', username: 'FELIPE.GUEVARA@RAPPI.COM',
      authenticator: 'EXTERNALBROWSER', warehouse: 'RP_PERSONALUSER_WH',
      database: 'RP_SILVER_DB_PROD', schema: 'TURBO_CORE',
      role: 'RP_READ_ACCESS_PU_ROLE', clientStoreTemporaryCredential: true,
    });
    c.connect((err, connection) => { if (err) reject(err); else { conn = connection; resolve(connection); } });
  });
}
function query(sql) { return new Promise((resolve, reject) => { conn.execute({ sqlText: sql, complete: (err, _s, rows) => err ? reject(err) : resolve(rows || []) }); }); }

// ─── Helper: Parse dates from Snowflake ─────────────────────────────────────
function parseDate(raw, viralTs) {
  let ts;
  if (raw instanceof Date) ts = raw.getTime();
  else ts = new Date(String(raw).replace(/"/g, '') + 'T00:00:00Z').getTime();
  return { ts, dayIndex: Math.round((ts - viralTs) / 86400000) };
}

// ─── City Filter ─────────────────────────────────────────────────────────────

/**
 * Maps CSV city abbreviations/names to exact Snowflake DB city values.
 * City names MUST match exactly including accents.
 */
const CITY_MAP = {
  'cdmx': 'Ciudad de México', 'ciudad de mexico': 'Ciudad de México', 'ciudad de méxico': 'Ciudad de México', 'cmx': 'Ciudad de México', 'mexico': 'Ciudad de México',
  'gdl': 'Guadalajara', 'guadalajara': 'Guadalajara',
  'mty': 'Monterrey', 'monterrey': 'Monterrey',
  'pue': 'Puebla', 'puebla': 'Puebla',
  'qro': 'Querétaro', 'queretaro': 'Querétaro', 'querétaro': 'Querétaro',
  'merida': 'Mérida', 'mérida': 'Mérida',
  'cuernavaca': 'Cuernavaca',
  'tijuana': 'Tijuana',
  'saltillo': 'Saltillo',
  'cancun': 'Cancún', 'cancún': 'Cancún',
  'hermosillo': 'Hermosillo',
  'culiacan': 'Culiacán', 'culiacán': 'Culiacán',
  'playa del carmen': 'Playa del Carmen',
  'reynosa': 'Reynosa',
  'san luis potosi': 'San Luis Potosí', 'san luis potosí': 'San Luis Potosí',
  'torreon': 'Torreón', 'torreón': 'Torreón',
  'veracruz': 'Veracruz',
};

/**
 * Parses a CSV ciudad string into an array of Snowflake DB city names.
 * Returns null for "Nacional" or empty (meaning no filter).
 * Handles separators: comma, middle dot (·), slash (/).
 * Strips annotations like "Solo Pro Users".
 */
function buildCityFilter(ciudadCSV) {
  if (!ciudadCSV || ciudadCSV.toLowerCase().includes('nacional')) return null;
  const parts = ciudadCSV.split(/[,·\/]/).map(s => s.replace(/solo pro users/gi, '').trim().toLowerCase()).filter(Boolean);
  const resolved = [...new Set(parts.map(p => CITY_MAP[p]).filter(Boolean))];
  return resolved.length > 0 ? resolved : null;
}

/**
 * Generates a warehouse CTE with optional city filter.
 * Uses GLOBAL_WAREHOUSE_NEW (194 WHs) with QUALIFY dedup for consistency.
 */
function buildWarehouseCTE(ciudadFilter) {
  const cityClause = ciudadFilter ? `AND CITY IN (${ciudadFilter.map(c => `'${c}'`).join(',')})` : '';
  return `WITH wh AS (
    SELECT WAREHOUSE_ID, WAREHOUSE_NAME, CITY
    FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_WAREHOUSE_NEW
    WHERE COUNTRY = 'MX' AND IS_CEDI = FALSE AND WAREHOUSE_NAME NOT LIKE '%INACTIVE%' ${cityClause}
    QUALIFY ROW_NUMBER() OVER (PARTITION BY WAREHOUSE_ID ORDER BY AIRFLOW_SYNCED DESC NULLS LAST) = 1
  )`;
}

// ─── Full Campaign Fetch (mirrors all 9 API routes) ─────────────────────────
async function fetchCampaignFull(camp) {
  const ids = camp.ids.join(','), dt = camp.date;
  const viralTs = new Date(dt + 'T00:00:00Z').getTime();
  const ciudadFilter = buildCityFilter(camp.ciudad);
  // Unique suffix for temp tables to avoid race conditions in parallel execution
  const sfx = camp.name.replace(/\W/g, '').slice(0, 8).toLowerCase() + '_' + dt.replace(/-/g, '');
  const TB = `viral_base_${sfx}`, TH = `viral_hist_${sfx}`;
  const result = { impact: null, cannibalization: null, demandShift: null, retention: null, postDemand: null, crossBasket: null, stockout: null, productAnalysis: null, repeatPurchase: null };

  // ═══ TEMP TABLE: ${TB} — all viral-day line items + user IDs ═══
  await query(`CREATE OR REPLACE TEMPORARY TABLE ${TB} AS
    SELECT d.ORDER_ID, d.SYNC_PRODUCT_ID, d.REFERENCE_ID, d.WAREHOUSE_ID,
      d.TOTAL_PRICE_WO_IVA AS GMV, d.UNITS, d.NAME, d.BRAND_NAME, d.CATEGORY_NAME,
      (COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_RAPPI,0)
      +COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MAKERS,0)
      +COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_COMMERCIAL,0)
      +COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_PARTNERS,0)
      +COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_SHRINKAGE,0)
      +COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_BLACKBOX,0)
      +COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MONETIZATION,0)) AS DISC,
      o.APPLICATION_USER_ID
    FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d
    LEFT JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o
      ON o.ORDER_ID = d.ORDER_ID AND o.COUNTRY = 'MX'
      AND o.CREATED_AT >= TO_DATE('${dt}')
      AND o.CREATED_AT < DATEADD(day, 1, TO_DATE('${dt}'))
    WHERE d.COUNTRY = 'MX' AND d.CREATED_AT = TO_DATE('${dt}')
      AND d.COUNT_TO_GMV = TRUE AND d.SYNC_PRODUCT_ID IN (${ids})`);

  // ═══ TEMP TABLE: ${TH} — 120d lookback for user classification (Turbo only) ═══
  // NEW = no Turbo purchase in 120d before promo. REACTIVATED = at least 1 but not in last 30d. EXISTING = purchased Turbo in last 30d.
  await query(`CREATE OR REPLACE TEMPORARY TABLE ${TH} AS
    SELECT vu.APPLICATION_USER_ID,
      MIN(o.CREATED_AT)::DATE AS FT,
      MAX(o.CREATED_AT)::DATE AS LT
    FROM (SELECT DISTINCT APPLICATION_USER_ID FROM ${TB} WHERE APPLICATION_USER_ID IS NOT NULL) vu
    LEFT JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o
      ON o.APPLICATION_USER_ID = vu.APPLICATION_USER_ID
      AND o.COUNTRY = 'MX'
      AND o.STORE_TYPE_STORE ILIKE '%turbo%'
      AND o.CREATED_AT >= DATEADD(day, -120, TO_DATE('${dt}'))
      AND o.CREATED_AT < TO_DATE('${dt}')
    GROUP BY 1`);

  // ═══ Q1: IMPACT — core KPIs using temp tables ═══
  try {
    const impRows = await query(`
      SELECT SUM(vb.GMV) AS GMV_TOTAL, SUM(vb.UNITS) AS UNITS_SOLD, SUM(vb.DISC) AS DISCOUNT_SPEND,
        COUNT(DISTINCT vb.APPLICATION_USER_ID) AS UNIQUE_USERS, COUNT(DISTINCT vb.ORDER_ID) AS TOTAL_ORDERS,
        COUNT(DISTINCT CASE WHEN uh.FT IS NULL THEN vb.APPLICATION_USER_ID END) AS NEW_USERS,
        COUNT(DISTINCT CASE WHEN uh.LT IS NOT NULL AND uh.LT >= DATEADD(day,-30,TO_DATE('${dt}')) THEN vb.APPLICATION_USER_ID END) AS RETAINED_USERS,
        COUNT(DISTINCT CASE WHEN uh.FT IS NOT NULL AND (uh.LT IS NULL OR uh.LT < DATEADD(day,-30,TO_DATE('${dt}'))) THEN vb.APPLICATION_USER_ID END) AS REACTIVATED_USERS
      FROM ${TB} vb
      LEFT JOIN ${TH} uh ON uh.APPLICATION_USER_ID = vb.APPLICATION_USER_ID`);
    const r = impRows[0] || {};
    const gmv = +r.GMV_TOTAL || 0, disc = +r.DISCOUNT_SPEND || 0, users = +r.UNIQUE_USERS || 0, orders = +r.TOTAL_ORDERS || 0;

    // Funding split: Growth vs Maker from MX_DISCOUNT_DETAILS (sargable range)
    let growthSpend = 0, makerSpend = 0;
    try {
      const fundRows = await query(`SELECT
        SUM(CASE WHEN m.LIST_ALLIES ILIKE '%MOUSTACHE BEAMS%' THEN m.DISCOUNT_VALUE ELSE 0 END) AS GROWTH_SPEND,
        SUM(CASE WHEN m.LIST_ALLIES IS NOT NULL AND m.LIST_ALLIES NOT ILIKE '%MOUSTACHE BEAMS%' THEN m.DISCOUNT_VALUE ELSE 0 END) AS MAKER_SPEND
        FROM ${TB} vb
        JOIN FIVETRAN.GLOBAL_FINANCES.MX_DISCOUNT_DETAILS m
          ON m.DISCOUNT_ORDER_ID = vb.ORDER_ID AND m.PRODUCT_ID = vb.REFERENCE_ID
        WHERE m.DISCOUNT_AT >= TO_TIMESTAMP_TZ(TO_DATE('${dt}'))
          AND m.DISCOUNT_AT < TO_TIMESTAMP_TZ(DATEADD(day, 1, TO_DATE('${dt}')))`);
      growthSpend = +fundRows[0]?.GROWTH_SPEND || 0;
      makerSpend = +fundRows[0]?.MAKER_SPEND || 0;
    } catch {}

    // Basket companion
    let companionGmv = 0, fullBasketGmv = 0, ordersWithCompanion = 0;
    try {
      const bRows = await query(`
        SELECT SUM(CASE WHEN d.SYNC_PRODUCT_ID NOT IN (${ids}) THEN d.TOTAL_PRICE_WO_IVA ELSE 0 END) AS CG,
          SUM(d.TOTAL_PRICE_WO_IVA) AS FBG,
          COUNT(DISTINCT CASE WHEN d.SYNC_PRODUCT_ID NOT IN (${ids}) THEN d.ORDER_ID END) AS OWC
        FROM (SELECT DISTINCT ORDER_ID FROM ${TB}) voi
        JOIN RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d ON d.ORDER_ID = voi.ORDER_ID
        WHERE d.COUNTRY = 'MX' AND d.COUNT_TO_GMV = TRUE AND d.CREATED_AT = TO_DATE('${dt}')`);
      companionGmv = +bRows[0]?.CG || 0; fullBasketGmv = +bRows[0]?.FBG || 0; ordersWithCompanion = +bRows[0]?.OWC || 0;
    } catch {}

    // Product-level user classification (new to product / occasional / frequent) — 120d lookback
    let newToProduct = 0, occasionalBuyer = 0, frequentBuyer = 0;
    try {
      const puRows = await query(`
        WITH vb AS (SELECT DISTINCT APPLICATION_USER_ID FROM ${TB} WHERE APPLICATION_USER_ID IS NOT NULL),
        pp AS (
          SELECT vb.APPLICATION_USER_ID, COUNT(DISTINCT d2.ORDER_ID) AS PO
          FROM vb
          JOIN RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d2
            ON d2.SYNC_PRODUCT_ID IN (${ids}) AND d2.COUNTRY = 'MX' AND d2.COUNT_TO_GMV = TRUE
            AND d2.CREATED_AT >= DATEADD(day,-120,TO_DATE('${dt}')) AND d2.CREATED_AT < TO_DATE('${dt}')
          JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS op ON op.ORDER_ID = d2.ORDER_ID
            AND op.APPLICATION_USER_ID = vb.APPLICATION_USER_ID AND op.COUNTRY = 'MX'
            AND op.CREATED_AT >= DATEADD(day,-120,TO_DATE('${dt}')) AND op.CREATED_AT < TO_DATE('${dt}')
          GROUP BY 1
        )
        SELECT COUNT(CASE WHEN pp.APPLICATION_USER_ID IS NULL THEN 1 END) AS NTP,
          COUNT(CASE WHEN pp.PO BETWEEN 1 AND 2 THEN 1 END) AS OC,
          COUNT(CASE WHEN pp.PO >= 3 THEN 1 END) AS FR
        FROM vb LEFT JOIN pp ON pp.APPLICATION_USER_ID = vb.APPLICATION_USER_ID`);
      newToProduct = +puRows[0]?.NTP || 0; occasionalBuyer = +puRows[0]?.OC || 0; frequentBuyer = +puRows[0]?.FR || 0;
    } catch {}

    result.impact = {
      gmvTotal: gmv, unitsSold: +r.UNITS_SOLD || 0, discountSpend: disc, uniqueUsers: users, totalOrders: orders,
      growthSpend, makerSpend,
      newUsers: +r.NEW_USERS || 0, retainedUsers: +r.RETAINED_USERS || 0, reactivatedUsers: +r.REACTIVATED_USERS || 0,
      cac: users > 0 ? disc / users : 0, companionGmv, fullBasketGmv,
      basketUpliftPct: gmv > 0 ? (companionGmv / gmv) * 100 : 0,
      ordersWithCompanion, companionPct: orders > 0 ? (ordersWithCompanion / orders) * 100 : 0,
      productOnlyRoi: disc > 0 ? gmv / disc : 0, basketAdjustedRoi: disc > 0 ? fullBasketGmv / disc : 0,
      newToProduct, occasionalBuyer, frequentBuyer,
    };
  } catch (e) { console.error(`    Impact error: ${e.message?.slice(0,80)}`); }

  // ═══ Q2: TIMELINE T-30 to T+30 — derives cannibalization + demandShift + postDemand ═══
  try {
    const tlRows = await query(`
      SELECT d.CREATED_AT AS DAY, SUM(d.TOTAL_PRICE_WO_IVA) AS GMV, SUM(d.UNITS) AS UNITS, COUNT(DISTINCT d.ORDER_ID) AS ORDERS
      FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d
      WHERE d.COUNTRY = 'MX' AND d.COUNT_TO_GMV = TRUE
        AND d.CREATED_AT BETWEEN DATEADD(day,-30,TO_DATE('${dt}')) AND DATEADD(day,30,TO_DATE('${dt}'))
        AND d.SYNC_PRODUCT_ID IN (${ids})
      GROUP BY 1 ORDER BY 1`);
    const allData = tlRows.map(r => { const { dayIndex } = parseDate(r.DAY, viralTs); return { day: new Date(parseDate(r.DAY, viralTs).ts).toISOString().slice(0, 10), dayIndex, gmv: +r.GMV || 0, units: +r.UNITS || 0, orders: +r.ORDERS || 0 }; });

    // Cannibalization (T-28 to T+6)
    {
      const data = allData.filter(d => d.dayIndex >= -28 && d.dayIndex <= 6);
      const baselineDays = data.filter(d => d.dayIndex >= -28 && d.dayIndex <= -8);
      const avgGmv = baselineDays.length > 0 ? baselineDays.reduce((s, d) => s + d.gmv, 0) / baselineDays.length : 0;
      const avgUnits = baselineDays.length > 0 ? baselineDays.reduce((s, d) => s + d.units, 0) / baselineDays.length : 0;
      const viralDay = data.find(d => d.dayIndex === 0);
      const postDays = data.filter(d => d.dayIndex >= 1 && d.dayIndex <= 6);
      const postAvgGmv = postDays.length > 0 ? postDays.reduce((s, d) => s + d.gmv, 0) / postDays.length : 0;
      result.cannibalization = { data, baseline: { avgUnits, avgGmv }, incrementalGmv: (viralDay?.gmv || 0) - avgGmv, viralMultiplier: avgGmv > 0 ? (viralDay?.gmv || 0) / avgGmv : 0, postViralVsBaseline: avgGmv > 0 ? ((postAvgGmv - avgGmv) / avgGmv) * 100 : 0 };
    }

    // Demand Shift (T-30 to T+30)
    {
      const pre = allData.filter(d => d.dayIndex >= -30 && d.dayIndex <= -1);
      const viral = allData.find(d => d.dayIndex === 0) || { units: 0, gmv: 0 };
      const post = allData.filter(d => d.dayIndex >= 1 && d.dayIndex <= 30);
      const preDays = pre.length || 30, postDays2 = post.length || 30;
      const preU = pre.reduce((s, d) => s + d.units, 0), preG = pre.reduce((s, d) => s + d.gmv, 0);
      const postU = post.reduce((s, d) => s + d.units, 0), postG = post.reduce((s, d) => s + d.gmv, 0);
      const preAvgU = preU / preDays, preAvgG = preG / preDays;
      const postAvgU = postU / postDays2, postAvgG = postG / postDays2;
      const totalDays = preDays + 1 + postDays2;
      const actualU = preU + viral.units + postU, actualG = preG + viral.gmv + postG;
      const expectedU = Math.round(preAvgU * totalDays), expectedG = Math.round(preAvgG * totalDays);
      const netU = actualU - expectedU, netG = actualG - expectedG;
      const postDecPct = preAvgU > 0 ? ((postAvgU - preAvgU) / preAvgU) * 100 : 0;
      const verdict = netU > expectedU * 0.05 ? 'GENERATION' : netU < -expectedU * 0.05 ? 'DESTRUCTION' : 'NEUTRAL';
      result.demandShift = { pre: { units: preU, gmv: preG, days: preDays, dailyAvgUnits: preAvgU, dailyAvgGmv: preAvgG }, viral: { units: viral.units, gmv: viral.gmv }, post: { units: postU, gmv: postG, days: postDays2, dailyAvgUnits: postAvgU, dailyAvgGmv: postAvgG }, total: { actualUnits: actualU, actualGmv: actualG, expectedUnits: expectedU, expectedGmv: expectedG, days: totalDays }, netUnitsImpact: netU, netGmvImpact: netG, netUnitsPct: expectedU > 0 ? (netU / expectedU) * 100 : 0, netGmvPct: expectedG > 0 ? (netG / expectedG) * 100 : 0, postDeclinePct: postDecPct, verdict };
    }

    // Post-Demand (T-14 to T+14)
    {
      const data = allData.filter(d => d.dayIndex >= -14 && d.dayIndex <= 14).map(d => ({ dayIndex: d.dayIndex, gmv: d.gmv, units: d.units, users: 0, orders: d.orders }));
      const bl = data.filter(d => d.dayIndex >= -14 && d.dayIndex <= -2);
      const blGmv = bl.length > 0 ? bl.reduce((s, d) => s + d.gmv, 0) / bl.length : 0;
      const blUnits = bl.length > 0 ? bl.reduce((s, d) => s + d.units, 0) / bl.length : 0;
      const pd = data.filter(d => d.dayIndex >= 1 && d.dayIndex <= 14);
      const pAvgG = pd.length > 0 ? pd.reduce((s, d) => s + d.gmv, 0) / pd.length : 0;
      const pAvgU = pd.length > 0 ? pd.reduce((s, d) => s + d.units, 0) / pd.length : 0;
      const vDay = data.find(d => d.dayIndex === 0);
      const inc = (vDay?.gmv || 0) - blGmv;
      const uplift = blGmv > 0 ? ((pAvgG - blGmv) / blGmv) * 100 : 0;
      const dtn = pd.findIndex(d => d.gmv <= blGmv * 1.2);
      result.postDemand = { data, baseline: { gmv: blGmv, units: blUnits, users: 0 }, postViral: { avgGmv: pAvgG, avgUnits: pAvgU, avgUsers: 0 }, incrementalFromViral: inc, sustainedUplift: uplift, daysToNormalize: dtn >= 0 ? dtn + 1 : null, isJustAPeak: uplift < 5, stockeoAnalysis: { viralBefore: 0, viralAfter: 0, viralChange: 0, controlBefore: 0, controlAfter: 0, controlChange: 0, isStockeo: false } };
    }
  } catch (e) { console.error(`    Timeline error: ${e.message?.slice(0,80)}`); }

  // ═══ Q3: RETENTION — uses ${TH} + 60d post-viral window ═══
  try {
    const retRows = await query(`
      WITH cl AS (
        SELECT APPLICATION_USER_ID,
          CASE WHEN FT IS NULL THEN 'NEW_TO_TURBO'
               WHEN LT IS NULL OR LT < DATEADD(day,-30,TO_DATE('${dt}')) THEN 'REACTIVATED_TURBO'
               ELSE 'EXISTING_TURBO' END AS USER_TYPE
        FROM ${TH}
      ),
      po AS (
        SELECT c.APPLICATION_USER_ID, c.USER_TYPE,
          MAX(CASE WHEN o2.CREATED_AT < DATEADD(day,16,TO_DATE('${dt}')) THEN 1 ELSE 0 END) AS R15,
          MAX(CASE WHEN o2.CREATED_AT < DATEADD(day,31,TO_DATE('${dt}')) THEN 1 ELSE 0 END) AS R30,
          MAX(CASE WHEN o2.CREATED_AT < DATEADD(day,46,TO_DATE('${dt}')) THEN 1 ELSE 0 END) AS R45,
          MAX(CASE WHEN o2.CREATED_AT < DATEADD(day,61,TO_DATE('${dt}')) THEN 1 ELSE 0 END) AS R60,
          COUNT(DISTINCT o2.ORDER_ID) AS ORD
        FROM cl c
        LEFT JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o2
          ON o2.APPLICATION_USER_ID = c.APPLICATION_USER_ID AND o2.COUNTRY = 'MX'
          AND o2.STORE_TYPE_STORE ILIKE '%turbo%'
          AND o2.CREATED_AT > TO_DATE('${dt}')
          AND o2.CREATED_AT < DATEADD(day, 61, TO_DATE('${dt}'))
        GROUP BY 1, 2
      )
      SELECT USER_TYPE, COUNT(*) AS CS, SUM(R15) AS R15, SUM(R30) AS R30, SUM(R45) AS R45, SUM(R60) AS R60, ROUND(AVG(ORD),1) AS AO
      FROM po GROUP BY 1 ORDER BY 1`);
    const daysSinceViral = Math.floor((Date.now() - viralTs) / 86400000);
    const segments = retRows.map(r => {
      const cs = +r.CS || 0;
      return { userType: r.USER_TYPE, cohortSize: cs, ret15d: +r.R15 || 0, ret30d: +r.R30 || 0, ret45d: +r.R45 || 0, ret60d: +r.R60 || 0,
        ret15dPct: cs > 0 ? (+r.R15 || 0) / cs * 100 : 0, ret30dPct: cs > 0 ? (+r.R30 || 0) / cs * 100 : 0, ret45dPct: cs > 0 ? (+r.R45 || 0) / cs * 100 : 0, ret60dPct: cs > 0 ? (+r.R60 || 0) / cs * 100 : 0,
        avgOrders60d: +r.AO || 0, avgLtv60d: 0 };
    });
    const totalCohort = segments.reduce((s, seg) => s + seg.cohortSize, 0);
    const newSeg = segments.find(s => s.userType === 'NEW_TO_TURBO');
    const existSeg = segments.find(s => s.userType === 'EXISTING_TURBO');
    result.retention = { segments, totalCohort, trulyNewCount: newSeg?.cohortSize || 0, existingActivePct: totalCohort > 0 ? ((existSeg?.cohortSize || 0) / totalCohort * 100) : 0, benchmark: { ret15d: 12, ret30d: 20 }, qualityGap: (newSeg?.ret30dPct || 0) - 20, daysSinceViral, maturity15: daysSinceViral >= 15, maturity30: daysSinceViral >= 30, maturity45: daysSinceViral >= 45, maturity60: daysSinceViral >= 60 };
  } catch (e) { console.error(`    Retention error: ${e.message?.slice(0,80)}`); }

  // ═══ Q4: REPEAT PURCHASE — 60d rebuy, optimized: start from GOD (partitioned) then match users ═══
  try {
    const rpRows = await query(`
      WITH vb AS (SELECT DISTINCT APPLICATION_USER_ID FROM ${TB} WHERE APPLICATION_USER_ID IS NOT NULL),
      future_orders AS (
        SELECT d2.ORDER_ID, d2.TOTAL_PRICE_WO_IVA AS GMV,
          CASE WHEN (COALESCE(d2.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_RAPPI,0)+COALESCE(d2.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MAKERS,0)+COALESCE(d2.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_COMMERCIAL,0)+COALESCE(d2.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_PARTNERS,0)+COALESCE(d2.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_SHRINKAGE,0)+COALESCE(d2.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_BLACKBOX,0)+COALESCE(d2.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MONETIZATION,0)) > 0 THEN 'D' ELSE 'F' END AS PT
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d2
        WHERE d2.SYNC_PRODUCT_ID IN (${ids}) AND d2.COUNTRY = 'MX' AND d2.COUNT_TO_GMV = TRUE
          AND d2.CREATED_AT > TO_DATE('${dt}') AND d2.CREATED_AT <= DATEADD(day,60,TO_DATE('${dt}'))
      ),
      rd AS (
        SELECT fo.ORDER_ID, fo.GMV, fo.PT, o2.APPLICATION_USER_ID
        FROM future_orders fo
        JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o2 ON o2.ORDER_ID = fo.ORDER_ID AND o2.COUNTRY = 'MX'
          AND o2.CREATED_AT > TO_DATE('${dt}') AND o2.CREATED_AT < DATEADD(day, 61, TO_DATE('${dt}'))
        WHERE o2.APPLICATION_USER_ID IN (SELECT APPLICATION_USER_ID FROM vb)
      )
      SELECT (SELECT COUNT(*) FROM vb) AS TVB, COUNT(DISTINCT APPLICATION_USER_ID) AS RB,
        COUNT(DISTINCT ORDER_ID) AS TRO, SUM(GMV) AS TRG,
        COUNT(DISTINCT CASE WHEN PT='F' THEN ORDER_ID END) AS FPO,
        COUNT(DISTINCT CASE WHEN PT='D' THEN ORDER_ID END) AS DO2,
        SUM(CASE WHEN PT='F' THEN GMV ELSE 0 END) AS FPG,
        SUM(CASE WHEN PT='D' THEN GMV ELSE 0 END) AS DG FROM rd`);
    const r = rpRows[0] || {};
    const tvb = +r.TVB || 0, rb = +r.RB || 0, tro = +r.TRO || 0, fpo = +r.FPO || 0;
    result.repeatPurchase = { totalViralBuyers: tvb, repeatBuyers: rb, repeatRate: tvb > 0 ? (rb / tvb) * 100 : 0, totalRepeatOrders: tro, totalRepeatGmv: +r.TRG || 0, fullPriceOrders: fpo, discountedOrders: +r.DO2 || 0, fullPricePct: tro > 0 ? (fpo / tro) * 100 : 0, fullPriceGmv: +r.FPG || 0, discountedGmv: +r.DG || 0 };
  } catch (e) { console.error(`    RepeatPurchase error: ${e.message?.slice(0,80)}`); }

  // ═══ Q5: CROSS-BASKET — companion categories (anti-fanout with GROUP BY) ═══
  try {
    const cbRows = await query(`
      WITH vo AS (SELECT DISTINCT ORDER_ID, APPLICATION_USER_ID FROM ${TB} WHERE APPLICATION_USER_ID IS NOT NULL),
      ci AS (
        SELECT vo.APPLICATION_USER_ID, d.CATEGORY_NAME, SUM(d.TOTAL_PRICE_WO_IVA) AS GMV
        FROM vo JOIN RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d ON d.ORDER_ID = vo.ORDER_ID
        WHERE d.COUNTRY = 'MX' AND d.COUNT_TO_GMV = TRUE AND d.CREATED_AT = TO_DATE('${dt}')
          AND d.CATEGORY_NAME IS NOT NULL AND d.SYNC_PRODUCT_ID NOT IN (${ids})
        GROUP BY 1, 2
      ),
      upc AS (
        SELECT DISTINCT vo.APPLICATION_USER_ID, dp.CATEGORY_NAME
        FROM vo
        JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS op ON op.APPLICATION_USER_ID = vo.APPLICATION_USER_ID AND op.COUNTRY = 'MX'
          AND op.CREATED_AT >= DATEADD(day,-60, TO_DATE('${dt}')) AND op.CREATED_AT < TO_DATE('${dt}')
        JOIN RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS dp ON dp.ORDER_ID = op.ORDER_ID AND dp.COUNTRY = 'MX'
          AND dp.CREATED_AT BETWEEN DATEADD(day,-60,TO_DATE('${dt}')) AND DATEADD(day,-1,TO_DATE('${dt}'))
          AND dp.CATEGORY_NAME IS NOT NULL
      )
      SELECT COUNT(DISTINCT ci.APPLICATION_USER_ID) AS UWC,
        (SELECT COUNT(DISTINCT APPLICATION_USER_ID) FROM vo) AS TVU,
        SUM(ci.GMV) AS TCG,
        SUM(CASE WHEN upc.CATEGORY_NAME IS NOT NULL THEN ci.GMV ELSE 0 END) AS GH,
        SUM(CASE WHEN upc.CATEGORY_NAME IS NULL THEN ci.GMV ELSE 0 END) AS GN,
        COUNT(DISTINCT ci.CATEGORY_NAME) AS TC,
        COUNT(DISTINCT CASE WHEN upc.CATEGORY_NAME IS NULL THEN ci.CATEGORY_NAME END) AS NC
      FROM ci LEFT JOIN upc ON upc.APPLICATION_USER_ID = ci.APPLICATION_USER_ID AND upc.CATEGORY_NAME = ci.CATEGORY_NAME`);
    const r = cbRows[0] || {};
    const tcg = +r.TCG || 0, tvu = +r.TVU || 0, uwc = +r.UWC || 0, gn = +r.GN || 0, gh = +r.GH || 0;
    // Top categories
    let topCats = [];
    try {
      const catRows = await query(`
        SELECT d.CATEGORY_NAME, COUNT(DISTINCT d.ORDER_ID) AS ORDERS, ROUND(SUM(d.TOTAL_PRICE_WO_IVA),0) AS GMV
        FROM (SELECT DISTINCT ORDER_ID FROM ${TB}) voi
        JOIN RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d ON d.ORDER_ID = voi.ORDER_ID
        WHERE d.COUNTRY = 'MX' AND d.COUNT_TO_GMV = TRUE AND d.CREATED_AT = TO_DATE('${dt}')
          AND d.CATEGORY_NAME IS NOT NULL AND d.SYNC_PRODUCT_ID NOT IN (${ids})
        GROUP BY 1 ORDER BY GMV DESC LIMIT 8`);
      topCats = catRows.map(r => ({ category: String(r.CATEGORY_NAME || ''), orders: +r.ORDERS || 0, gmv: +r.GMV || 0 }));
    } catch {}
    result.crossBasket = { totalViralUsers: tvu, usersWithCompanion: uwc, companionPenetration: tvu > 0 ? (uwc / tvu) * 100 : 0, totalCompanionGmv: tcg, gmvHabitual: gh, gmvNewCategory: gn, trueCrossSellPct: tcg > 0 ? (gn / tcg) * 100 : 0, habitualPct: tcg > 0 ? (gh / tcg) * 100 : 0, totalCategories: +r.TC || 0, newCategories: +r.NC || 0, topCategories: topCats };
  } catch (e) { console.error(`    CrossBasket error: ${e.message?.slice(0,80)}`); }

  // ═══ Q6: PRODUCT ANALYSIS — direct from ${TB} ═══
  try {
    const paRows = await query(`SELECT SYNC_PRODUCT_ID, MAX(NAME) AS PN, MAX(BRAND_NAME) AS BR, MAX(CATEGORY_NAME) AS CAT,
      SUM(GMV) AS GMV, SUM(UNITS) AS UNITS, COUNT(DISTINCT ORDER_ID) AS ORDERS, SUM(DISC) AS DISC,
      ROUND(SUM(GMV)/NULLIF(SUM(UNITS),0),2) AS AP, COUNT(DISTINCT WAREHOUSE_ID) AS WS
      FROM ${TB} GROUP BY 1 ORDER BY GMV DESC`);

    // Per-product stock from inventory (with city filter when applicable)
    const stockMap = {};
    try {
      let stockQuery;
      if (ciudadFilter) {
        stockQuery = `${buildWarehouseCTE(ciudadFilter)}
          SELECT ic.SYNC_PRODUCT_ID, SUM(CASE WHEN ic.CREATED_AT=DATEADD(day,-1,TO_DATE('${dt}')) THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS OP, SUM(CASE WHEN ic.CREATED_AT=TO_DATE('${dt}') THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS CL, COUNT(DISTINCT CASE WHEN ic.CREATED_AT=DATEADD(day,-1,TO_DATE('${dt}')) AND ic.SUM_UNITS_CUMULADO>0 THEN ic.WAREHOUSE_ID END) AS WS FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_INVENTORY_COST ic JOIN wh ON ic.WAREHOUSE_ID=wh.WAREHOUSE_ID WHERE ic.SYNC_PRODUCT_ID IN (${ids}) AND ic.COUNTRY='MX' AND ic.CREATED_AT BETWEEN DATEADD(day,-1,TO_DATE('${dt}')) AND TO_DATE('${dt}') GROUP BY 1`;
      } else {
        stockQuery = `SELECT ic.SYNC_PRODUCT_ID, SUM(CASE WHEN ic.CREATED_AT=DATEADD(day,-1,TO_DATE('${dt}')) THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS OP, SUM(CASE WHEN ic.CREATED_AT=TO_DATE('${dt}') THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS CL, COUNT(DISTINCT CASE WHEN ic.CREATED_AT=DATEADD(day,-1,TO_DATE('${dt}')) AND ic.SUM_UNITS_CUMULADO>0 THEN ic.WAREHOUSE_ID END) AS WS FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_INVENTORY_COST ic JOIN RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_WAREHOUSE_NEW w ON ic.WAREHOUSE_ID=w.WAREHOUSE_ID AND w.COUNTRY='MX' AND w.IS_CEDI=FALSE AND w.WAREHOUSE_NAME NOT LIKE '%INACTIVE%' WHERE ic.SYNC_PRODUCT_ID IN (${ids}) AND ic.COUNTRY='MX' AND ic.CREATED_AT BETWEEN DATEADD(day,-1,TO_DATE('${dt}')) AND TO_DATE('${dt}') GROUP BY 1`;
      }
      const stProdRows = await query(stockQuery);
      stProdRows.forEach(r => { stockMap[+r.SYNC_PRODUCT_ID] = { op: +r.OP || 0, cl: +r.CL || 0, ws: +r.WS || 0 }; });
    } catch {}

    result.productAnalysis = { products: paRows.map(r => {
      const syncId = +r.SYNC_PRODUCT_ID, units = +r.UNITS || 0, gmv = +r.GMV || 0, disc = +r.DISC || 0;
      const stk = stockMap[syncId] || { op: 0, cl: 0, ws: 0 };
      return { syncProductId: syncId, name: String(r.PN || ''), brand: String(r.BR || ''), category: String(r.CAT || ''), gmv, units, orders: +r.ORDERS || 0, discount: disc, avgPrice: +r.AP || 0, discountPct: gmv > 0 ? (disc / gmv) * 100 : 0, warehousesSold: +r.WS || 0, openingStock: stk.op, closingStock: stk.cl, whWithStock: stk.ws, sellThroughPct: stk.op > 0 ? (units / stk.op) * 100 : (units > 0 ? 100 : 0) };
    }) };
  } catch (e) { console.error(`    ProductAnalysis error: ${e.message?.slice(0,80)}`); }

  // ═══ Q7: STOCKOUT + OPS — inventory depletion, city breakdown, live stock ═══
  try {
    const unitsSold = result.impact?.unitsSold || 0;

    // A. Starting/Ending stock from GLOBAL_INVENTORY_COST + city breakdown
    let stockMainQuery;
    if (ciudadFilter) {
      stockMainQuery = `${buildWarehouseCTE(ciudadFilter)}, sd AS (SELECT ic.WAREHOUSE_ID, ic.SYNC_PRODUCT_ID,
        SUM(CASE WHEN ic.CREATED_AT=DATEADD(day,-1,TO_DATE('${dt}')) THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS OP,
        SUM(CASE WHEN ic.CREATED_AT=TO_DATE('${dt}') THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS CL,
        SUM(CASE WHEN ic.CREATED_AT=DATEADD(day,1,TO_DATE('${dt}')) THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS POST1
      FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_INVENTORY_COST ic
      JOIN wh ON ic.WAREHOUSE_ID=wh.WAREHOUSE_ID
      WHERE ic.SYNC_PRODUCT_ID IN (${ids}) AND ic.COUNTRY='MX' AND ic.CREATED_AT BETWEEN DATEADD(day,-1,TO_DATE('${dt}')) AND DATEADD(day,1,TO_DATE('${dt}')) GROUP BY 1,2)
      SELECT COUNT(DISTINCT WAREHOUSE_ID) AS TWH,
        SUM(CASE WHEN CL<=0 AND OP>0 THEN 1 ELSE 0 END) AS WH_STOCKOUT,
        SUM(OP) AS TOTAL_OPENING, SUM(CL) AS TOTAL_CLOSING,
        COUNT(DISTINCT CASE WHEN OP>0 THEN WAREHOUSE_ID END) AS WH_WITH_STOCK,
        COUNT(DISTINCT SYNC_PRODUCT_ID) AS TOTAL_PRODUCTS,
        SUM(CASE WHEN OP>0 THEN 1 ELSE 0 END) AS PRODUCTS_WITH_STOCK,
        SUM(CASE WHEN OP>0 AND CL<=0 THEN 1 ELSE 0 END) AS PRODUCTS_SOLD_OUT,
        COUNT(DISTINCT CASE WHEN POST1<=0 AND OP>0 THEN SYNC_PRODUCT_ID END) AS SOLDOUT_SKUS_24H
      FROM sd`;
    } else {
      stockMainQuery = `WITH sd AS (SELECT ic.WAREHOUSE_ID, ic.SYNC_PRODUCT_ID,
        SUM(CASE WHEN ic.CREATED_AT=DATEADD(day,-1,TO_DATE('${dt}')) THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS OP,
        SUM(CASE WHEN ic.CREATED_AT=TO_DATE('${dt}') THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS CL,
        SUM(CASE WHEN ic.CREATED_AT=DATEADD(day,1,TO_DATE('${dt}')) THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS POST1
      FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_INVENTORY_COST ic
      JOIN RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_WAREHOUSE_NEW w ON ic.WAREHOUSE_ID=w.WAREHOUSE_ID AND w.COUNTRY='MX' AND w.IS_CEDI=FALSE AND w.WAREHOUSE_NAME NOT LIKE '%INACTIVE%'
      WHERE ic.SYNC_PRODUCT_ID IN (${ids}) AND ic.COUNTRY='MX' AND ic.CREATED_AT BETWEEN DATEADD(day,-1,TO_DATE('${dt}')) AND DATEADD(day,1,TO_DATE('${dt}')) GROUP BY 1,2)
      SELECT COUNT(DISTINCT WAREHOUSE_ID) AS TWH,
        SUM(CASE WHEN CL<=0 AND OP>0 THEN 1 ELSE 0 END) AS WH_STOCKOUT,
        SUM(OP) AS TOTAL_OPENING, SUM(CL) AS TOTAL_CLOSING,
        COUNT(DISTINCT CASE WHEN OP>0 THEN WAREHOUSE_ID END) AS WH_WITH_STOCK,
        COUNT(DISTINCT SYNC_PRODUCT_ID) AS TOTAL_PRODUCTS,
        SUM(CASE WHEN OP>0 THEN 1 ELSE 0 END) AS PRODUCTS_WITH_STOCK,
        SUM(CASE WHEN OP>0 AND CL<=0 THEN 1 ELSE 0 END) AS PRODUCTS_SOLD_OUT,
        COUNT(DISTINCT CASE WHEN POST1<=0 AND OP>0 THEN SYNC_PRODUCT_ID END) AS SOLDOUT_SKUS_24H
      FROM sd`;
    }
    const stRows = await query(stockMainQuery);
    const sr = stRows[0] || {};
    const totalOpening = +sr.TOTAL_OPENING || 0;
    const soldoutProducts = +sr.SOLDOUT_SKUS_24H || 0;

    // B. Live Stock from LOT table (current real-time)
    let liveStock = 0;
    try {
      const lotRows = await query(`SELECT SUM(COALESCE(l.STOCK,0) - COALESCE(l.RESERVED,0)) AS LS
        FROM FIVETRAN.MX_AMYSQL_TURBO_EMERGENCY_ORDER_TURBO_INVENTORY_SAVVY_MS.LOT l
        WHERE COALESCE(l._FIVETRAN_DELETED, FALSE) = FALSE
          AND (l.EXPIRATION_AT IS NULL OR l.EXPIRATION_AT > CURRENT_TIMESTAMP())
          AND l.PRODUCT_ID IN (${ids})`);
      liveStock = +lotRows[0]?.LS || 0;
    } catch {}

    // C. Sell-Through: unitsSold / startingStock
    const sellThroughPct = totalOpening > 0 ? (unitsSold / totalOpening) * 100 : 0;

    // D. 180d Historical Share (disabled — too expensive)
    const share180dPct = 0;

    // E. City Breakdown (with city filter when applicable)
    let cityBreakdown = [];
    try {
      let cityQuery;
      if (ciudadFilter) {
        cityQuery = `${buildWarehouseCTE(ciudadFilter)}
          SELECT wh.CITY, COUNT(DISTINCT ic.WAREHOUSE_ID) AS WH_COUNT,
            SUM(CASE WHEN ic.CREATED_AT=DATEADD(day,-1,TO_DATE('${dt}')) THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS STOCK_BEFORE,
            SUM(CASE WHEN ic.CREATED_AT=TO_DATE('${dt}') THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS STOCK_AFTER,
            SUM(CASE WHEN ic.CREATED_AT=DATEADD(day,1,TO_DATE('${dt}')) THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS STOCK_DAY_AFTER
          FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_INVENTORY_COST ic
          JOIN wh ON ic.WAREHOUSE_ID=wh.WAREHOUSE_ID
          WHERE ic.SYNC_PRODUCT_ID IN (${ids}) AND ic.COUNTRY='MX' AND ic.CREATED_AT BETWEEN DATEADD(day,-1,TO_DATE('${dt}')) AND DATEADD(day,1,TO_DATE('${dt}'))
          GROUP BY wh.CITY HAVING SUM(CASE WHEN ic.CREATED_AT=DATEADD(day,-1,TO_DATE('${dt}')) THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) > 0
          ORDER BY 3 DESC LIMIT 10`;
      } else {
        cityQuery = `SELECT w.CITY, COUNT(DISTINCT ic.WAREHOUSE_ID) AS WH_COUNT,
            SUM(CASE WHEN ic.CREATED_AT=DATEADD(day,-1,TO_DATE('${dt}')) THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS STOCK_BEFORE,
            SUM(CASE WHEN ic.CREATED_AT=TO_DATE('${dt}') THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS STOCK_AFTER,
            SUM(CASE WHEN ic.CREATED_AT=DATEADD(day,1,TO_DATE('${dt}')) THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS STOCK_DAY_AFTER
          FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_INVENTORY_COST ic
          JOIN RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_WAREHOUSE_NEW w ON ic.WAREHOUSE_ID=w.WAREHOUSE_ID AND w.COUNTRY='MX' AND w.IS_CEDI=FALSE AND w.WAREHOUSE_NAME NOT LIKE '%INACTIVE%'
          WHERE ic.SYNC_PRODUCT_ID IN (${ids}) AND ic.COUNTRY='MX' AND ic.CREATED_AT BETWEEN DATEADD(day,-1,TO_DATE('${dt}')) AND DATEADD(day,1,TO_DATE('${dt}'))
          GROUP BY w.CITY HAVING SUM(CASE WHEN ic.CREATED_AT=DATEADD(day,-1,TO_DATE('${dt}')) THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) > 0
          ORDER BY 3 DESC LIMIT 10`;
      }
      const cityRows = await query(cityQuery);
      cityBreakdown = cityRows.map(r => ({ city: String(r.CITY || ''), whCount: +r.WH_COUNT || 0, stockBefore: +r.STOCK_BEFORE || 0, stockAfter: +r.STOCK_AFTER || 0, stockDayAfter: +r.STOCK_DAY_AFTER || 0 }));
    } catch {}

    // F. Discount breakdown by type
    let discountDetail = { rappi: 0, makers: 0, commercial: 0, partners: 0, shrinkage: 0, blackbox: 0, monetization: 0 };
    try {
      const dRows = await query(`SELECT
        SUM(COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_RAPPI,0)) AS R,
        SUM(COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MAKERS,0)) AS M,
        SUM(COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_COMMERCIAL,0)) AS C,
        SUM(COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_PARTNERS,0)) AS P,
        SUM(COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_SHRINKAGE,0)) AS S,
        SUM(COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_BLACKBOX,0)) AS B,
        SUM(COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MONETIZATION,0)) AS MO
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS
        WHERE SYNC_PRODUCT_ID IN (${ids}) AND CREATED_AT=TO_DATE('${dt}') AND COUNTRY='MX' AND COUNT_TO_GMV=TRUE`);
      const dr = dRows[0] || {};
      discountDetail = { rappi: +dr.R || 0, makers: +dr.M || 0, commercial: +dr.C || 0, partners: +dr.P || 0, shrinkage: +dr.S || 0, blackbox: +dr.B || 0, monetization: +dr.MO || 0 };
    } catch {}

    // G. Operational coverage: % of WHs with stock that actually served orders (all products)
    const whWithStock = +sr.WH_WITH_STOCK || 0;
    const whServedOrders = result.productAnalysis?.products?.reduce((max, p) => Math.max(max, p.warehousesSold || 0), 0) || 0;
    const operationalCoverage = whWithStock > 0 ? (whServedOrders / whWithStock) * 100 : 0;

    result.stockout = {
      totalWarehouses: +sr.TWH || 0, whWithStockout: +sr.WH_STOCKOUT || 0,
      totalProductsWithStock: +sr.PRODUCTS_WITH_STOCK || 0, totalProductsSoldOut: +sr.PRODUCTS_SOLD_OUT || 0,
      mixAffectedPct: 0, mixFullCoveragePct: 0,
      totalOpening, totalClosing: +sr.TOTAL_CLOSING || 0, unitsSold,
      cityBreakdown,
      liveStock, sellThroughPct, soldoutProducts, share180dPct,
      discountDetail, operationalCoverage,
    };
  } catch (e) { console.error(`    Stockout error: ${e.message?.slice(0,80)}`); }

  // Cleanup temp tables to free session memory
  try { await query(`DROP TABLE IF EXISTS ${TB}`); await query(`DROP TABLE IF EXISTS ${TH}`); } catch {}

  return result;
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const CAMPAIGNS = loadCampaigns();
  console.log(`\n📋 Loaded ${CAMPAIGNS.length} campaigns from CSV\n`);

  // Load existing cache
  const outputPath = path.join(__dirname, '..', 'public', 'full-data.json');
  let existingData = { campaigns: [], campaignData: {}, executive: null };
  try { existingData = JSON.parse(fs.readFileSync(outputPath, 'utf8')); } catch {}

  const today = new Date();
  const FREEZE_DAYS = 90;
  const FORCE_ALL = process.argv.includes('--force');

  // Classify campaigns
  const toProcess = [];
  const frozen = [];
  for (const camp of CAMPAIGNS) {
    const id = `${camp.name}_${camp.date}`;
    const age = Math.floor((today - new Date(camp.date + 'T00:00:00Z')) / 86400000);
    const hasData = existingData.campaignData?.[id]?.impact != null;

    if (!FORCE_ALL && hasData && age > FREEZE_DAYS) {
      frozen.push({ ...camp, id, age });
    } else {
      toProcess.push({ ...camp, id, age, status: hasData ? 'UPDATE' : 'NEW' });
    }
  }

  console.log(`  ❄️  FROZEN (>90d, cached): ${frozen.length}`);
  console.log(`  🔄 UPDATE (<90d): ${toProcess.filter(c => c.status === 'UPDATE').length}`);
  console.log(`  🆕 NEW: ${toProcess.filter(c => c.status === 'NEW').length}\n`);

  // Keep frozen data
  const campaignData = {};
  for (const f of frozen) {
    console.log(`  [FROZEN] ${f.name} (${f.date}) — ${f.age}d old`);
    campaignData[f.id] = existingData.campaignData[f.id];
  }

  // Connect to Snowflake if there's work to do
  if (toProcess.length > 0) {
    console.log('\n🔌 Connecting to Snowflake (SSO with token cache)...');
    await connect();
    await query('USE WAREHOUSE RP_PERSONALUSER_WH');
    await query('USE DATABASE RP_SILVER_DB_PROD');
    await query('USE SCHEMA TURBO_CORE');
    console.log('✓ Connected\n');

    // Process in batches of 2 (XS warehouse, queries serialize on single connection)
    for (let i = 0; i < toProcess.length; i += 2) {
      const batch = toProcess.slice(i, i + 2);
      const batchResults = await Promise.allSettled(batch.map(async (camp) => {
        const tag = camp.status === 'NEW' ? '🆕 NEW' : '🔄 UPDATE';
        console.log(`  [${i + batch.indexOf(camp) + 1}/${toProcess.length}] [${tag}] ${camp.name} (${camp.date})...`);
        const data = await fetchCampaignFull(camp);
        const ok = Object.values(data).filter(v => v !== null).length;
        console.log(`    ✓ ${ok}/9 endpoints OK | GMV: $${((data.impact?.gmvTotal || 0) / 1000).toFixed(0)}K`);
        return { id: camp.id, data };
      }));
      for (const r of batchResults) {
        if (r.status === 'fulfilled') campaignData[r.value.id] = r.value.data;
        else console.log(`    ✗ FAILED: ${r.reason?.message?.slice(0, 50)}`);
      }
    }
  }

  // Build output (includes ciudad and budgets from CSV)
  const allCampaigns = CAMPAIGNS.map(c => ({ id: `${c.name}_${c.date}`, nombre: c.name, fecha: c.date, syncIds: c.ids, status: 'Ejecutado', productos: c.productos, ciudad: c.ciudad, budgetMaker: c.budgetMaker, budgetGrowth: c.budgetGrowth }));

  // Build executive from campaignData
  const execCampaigns = allCampaigns.map(c => {
    const cd = campaignData[c.id] || {};
    const imp = cd.impact || {};
    const can = cd.cannibalization || {};
    const ds = cd.demandShift || {};
    return {
      name: c.nombre, date: c.fecha, viralGmv: imp.gmvTotal || 0, discount: imp.discountSpend || 0,
      roi: imp.productOnlyRoi || 0, incrementalGmv: can.incrementalGmv || 0,
      postDip: ds.postDeclinePct < 0 ? Math.abs(ds.postDeclinePct || 0) / 100 * (can.baseline?.avgGmv || 0) * 7 : 0,
      netIncremental: ds.netGmvImpact || 0, isNetPositive: (ds.netUnitsImpact || 0) > 0,
      multiplier: can.viralMultiplier || 0, baselineAvgGmv: can.baseline?.avgGmv || 0,
      postAvgGmv: ds.post?.dailyAvgGmv || 0, postDeclinePct: ds.postDeclinePct || 0,
      dsNetUnits: ds.netUnitsImpact || 0, dsNetUnitsPct: ds.netUnitsPct || 0,
      dsNetGmv: ds.netGmvImpact || 0, dsVerdict: ds.verdict || 'NEUTRAL',
    };
  });

  const tGmv = execCampaigns.reduce((s, c) => s + c.viralGmv, 0);
  const tDisc = execCampaigns.reduce((s, c) => s + c.discount, 0);
  const tNetInc = execCampaigns.reduce((s, c) => s + c.netIncremental, 0);
  const months = [...new Set(execCampaigns.map(c => c.date.slice(0, 7)))].sort();

  const executive = {
    programKpis: {
      totalCampaigns: execCampaigns.length, totalGmv: tGmv, totalDiscount: tDisc,
      avgRoi: tDisc > 0 ? tGmv / tDisc : 0, totalNetIncremental: tNetInc,
      netPositiveCount: execCampaigns.filter(c => c.isNetPositive).length,
      netPositivePct: execCampaigns.length > 0 ? execCampaigns.filter(c => c.isNetPositive).length / execCampaigns.length * 100 : 0,
      avgMultiplier: execCampaigns.length > 0 ? execCampaigns.reduce((s, c) => s + c.multiplier, 0) / execCampaigns.length : 0,
      totalDsNetUnits: execCampaigns.reduce((s, c) => s + c.dsNetUnits, 0), totalDsNetGmv: execCampaigns.reduce((s, c) => s + c.dsNetGmv, 0),
      dsGenerationCount: execCampaigns.filter(c => c.dsVerdict === 'GENERATION').length,
      dsNeutralCount: execCampaigns.filter(c => c.dsVerdict === 'NEUTRAL').length,
      dsDestructionCount: execCampaigns.filter(c => c.dsVerdict === 'DESTRUCTION').length,
      totalLostGmv: execCampaigns.reduce((s, c) => s + c.postDip, 0), lostGmvPct: tGmv > 0 ? execCampaigns.reduce((s, c) => s + c.postDip, 0) / tGmv * 100 : 0,
      // Operational metrics
      totalSellThrough: (() => { const vals = allCampaigns.map(c => campaignData[c.id]?.stockout?.sellThroughPct || 0).filter(v => v > 0); return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0; })(),
      totalOperationalCoverage: (() => { const vals = allCampaigns.map(c => campaignData[c.id]?.stockout?.operationalCoverage || 0).filter(v => v > 0); return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0; })(),
      avgSoldoutPct: (() => { const vals = allCampaigns.map(c => { const st = campaignData[c.id]?.stockout; return st && st.totalProductsWithStock > 0 ? (st.soldoutProducts / st.totalProductsWithStock) * 100 : 0; }).filter(v => v > 0); return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0; })(),
      // Growth vs Maker spend totals
      totalGrowthSpend: allCampaigns.reduce((s, c) => s + (campaignData[c.id]?.impact?.growthSpend || 0), 0),
      totalMakerSpend: allCampaigns.reduce((s, c) => s + (campaignData[c.id]?.impact?.makerSpend || 0), 0),
    },
    campaigns: execCampaigns,
    monthlyData: months.map(m => { const mc = execCampaigns.filter(c => c.date.startsWith(m)); return { month: m, campaigns: mc.length, totalGmv: mc.reduce((s, c) => s + c.viralGmv, 0), totalDiscount: mc.reduce((s, c) => s + c.discount, 0), totalNetIncremental: mc.reduce((s, c) => s + c.netIncremental, 0), avgRoi: mc.reduce((s, c) => s + c.discount, 0) > 0 ? mc.reduce((s, c) => s + c.viralGmv, 0) / mc.reduce((s, c) => s + c.discount, 0) : 0, netPositivePct: mc.length > 0 ? mc.filter(c => c.isNetPositive).length / mc.length * 100 : 0 }; }),
    aiVerdict: '',
    doiProgram: { avgDoiPre: 0, avgDoiPost: 0, doiDelta: 0, campaignsWithDoiRisk: 0 },
    discountBreakdown: (() => { const agg = { rappi: 0, makers: 0, commercial: 0, partners: 0, shrinkage: 0, blackbox: 0, monetization: 0 }; allCampaigns.forEach(c => { const dd = campaignData[c.id]?.stockout?.discountDetail; if (dd) { agg.rappi += dd.rappi; agg.makers += dd.makers; agg.commercial += dd.commercial; agg.partners += dd.partners; agg.shrinkage += dd.shrinkage; agg.blackbox += dd.blackbox; agg.monetization += dd.monetization; } }); return agg; })(),
    userMetrics: { totalNewTurbo: execCampaigns.reduce((s, c) => { const cd = campaignData[c.name + '_' + c.date]; return s + (cd?.retention?.trulyNewCount || cd?.impact?.newUsers || 0); }, 0), totalReactivated: execCampaigns.reduce((s, c) => { const cd = campaignData[c.name + '_' + c.date]; return s + (cd?.impact?.reactivatedUsers || 0); }, 0), totalExisting: execCampaigns.reduce((s, c) => { const cd = campaignData[c.name + '_' + c.date]; return s + (cd?.impact?.retainedUsers || 0); }, 0), newThatReturned30d: 0, avgNewRetPct: 0, benchmarkRet30d: 20 },
  };

  const output = { generatedAt: new Date().toISOString(), campaigns: allCampaigns, campaignData, executive };
  fs.writeFileSync(outputPath, JSON.stringify(output));

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`✅ Done! ${allCampaigns.length} campaigns`);
  console.log(`   Frozen: ${frozen.length} | Processed: ${toProcess.length}`);
  console.log(`   GMV: $${(tGmv / 1e6).toFixed(2)}M | ROI: ${tDisc > 0 ? (tGmv / tDisc).toFixed(1) : 0}x`);
  console.log(`   Net Incremental: $${(tNetInc / 1e6).toFixed(2)}M`);
  console.log(`═══════════════════════════════════════════\n`);
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
