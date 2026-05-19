import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/snowflake';

export async function POST(request: NextRequest) {
  try {
    const { syncIds, viralDate } = await request.json();

    if (!syncIds?.length || !viralDate) {
      return NextResponse.json({ error: 'syncIds and viralDate required' }, { status: 400 });
    }

    const safeSyncIds = (syncIds as number[]).filter(id => Number.isInteger(id)).join(',');
    const safeDate = String(viralDate).replace(/[^0-9-]/g, '');

    // Daily demand T-14 to T+14 with users
    const demandSql = `
      SELECT d.CREATED_AT AS DAY,
        SUM(d.TOTAL_PRICE_WO_IVA) AS GMV,
        SUM(d.UNITS) AS UNITS,
        COUNT(DISTINCT o.APPLICATION_USER_ID) AS UNIQUE_USERS,
        COUNT(DISTINCT d.ORDER_ID) AS ORDERS
      FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d
      LEFT JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o ON o.ORDER_ID = d.ORDER_ID AND o.COUNTRY = 'MX'
        AND o.CREATED_AT >= DATEADD(day, -14, TO_DATE('${safeDate}')) AND o.CREATED_AT < DATEADD(day, 15, TO_DATE('${safeDate}'))
      WHERE d.SYNC_PRODUCT_ID IN (${safeSyncIds}) AND d.COUNTRY = 'MX' AND d.COUNT_TO_GMV = TRUE
        AND d.CREATED_AT BETWEEN DATEADD(day, -14, TO_DATE('${safeDate}')) AND DATEADD(day, 14, TO_DATE('${safeDate}'))
      GROUP BY d.CREATED_AT
      ORDER BY d.CREATED_AT
    `;

    const rows = await executeQuery(demandSql);

    const [vyear, vmonth, vday] = safeDate.split('-').map(Number);
    const viralTs = Date.UTC(vyear, vmonth - 1, vday);

    const data = (rows as Record<string, unknown>[]).map(row => {
      const rawDay = row.DAY;
      let dayTs: number;
      if (rawDay instanceof Date) { dayTs = rawDay.getTime(); }
      else { dayTs = new Date(String(rawDay).replace(/"/g, '') + 'T00:00:00Z').getTime(); }
      return {
        dayIndex: Math.round((dayTs - viralTs) / (1000 * 60 * 60 * 24)),
        gmv: Number(row.GMV) || 0,
        units: Number(row.UNITS) || 0,
        users: Number(row.UNIQUE_USERS) || 0,
        orders: Number(row.ORDERS) || 0,
      };
    });

    // Baselines
    const baselineDays = data.filter(d => d.dayIndex >= -14 && d.dayIndex <= -2);
    const baselineGmv = baselineDays.length > 0 ? baselineDays.reduce((s, d) => s + d.gmv, 0) / baselineDays.length : 0;
    const baselineUnits = baselineDays.length > 0 ? baselineDays.reduce((s, d) => s + d.units, 0) / baselineDays.length : 0;
    const baselineUsers = baselineDays.length > 0 ? baselineDays.reduce((s, d) => s + d.users, 0) / baselineDays.length : 0;

    const postDays = data.filter(d => d.dayIndex >= 1 && d.dayIndex <= 14);
    const postAvgGmv = postDays.length > 0 ? postDays.reduce((s, d) => s + d.gmv, 0) / postDays.length : 0;
    const postAvgUnits = postDays.length > 0 ? postDays.reduce((s, d) => s + d.units, 0) / postDays.length : 0;
    const postAvgUsers = postDays.length > 0 ? postDays.reduce((s, d) => s + d.users, 0) / postDays.length : 0;

    const viralDay = data.find(d => d.dayIndex === 0);
    const incrementalFromViral = (viralDay?.gmv || 0) - baselineGmv;
    const sustainedUplift = baselineGmv > 0 ? ((postAvgGmv - baselineGmv) / baselineGmv) * 100 : 0;
    const daysToNormalize = postDays.findIndex(d => d.gmv <= baselineGmv * 1.2);

    // Stockeo analysis: viral cohort orders 7d before vs 7d after (ALL products, not just viral)
    const stockeoSql = `
      WITH viral_users AS (
        SELECT DISTINCT o.APPLICATION_USER_ID
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d
        JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o ON o.ORDER_ID = d.ORDER_ID AND o.COUNTRY = 'MX'
          AND o.CREATED_AT >= TO_DATE('${safeDate}') AND o.CREATED_AT < DATEADD(day, 1, TO_DATE('${safeDate}'))
        WHERE d.SYNC_PRODUCT_ID IN (${safeSyncIds}) AND d.CREATED_AT = TO_DATE('${safeDate}') AND d.COUNTRY = 'MX' AND d.COUNT_TO_GMV = TRUE AND o.APPLICATION_USER_ID IS NOT NULL
      ),
      control_users AS (
        SELECT APPLICATION_USER_ID FROM RP_SILVER_DB_PROD.DES_PROD.ORDERS
        WHERE COUNTRY = 'MX' AND CREATED_AT >= DATEADD(day,-7,TO_DATE('${safeDate}')) AND CREATED_AT < TO_DATE('${safeDate}')
          AND APPLICATION_USER_ID NOT IN (SELECT APPLICATION_USER_ID FROM viral_users)
        GROUP BY 1 LIMIT 3000
      )
      SELECT 
        'VIRAL' AS COHORT,
        COUNT(DISTINCT CASE WHEN o.CREATED_AT >= DATEADD(day,-7,TO_DATE('${safeDate}')) AND o.CREATED_AT < TO_DATE('${safeDate}') THEN o.ORDER_ID END) AS ORDERS_7D_BEFORE,
        COUNT(DISTINCT CASE WHEN o.CREATED_AT > TO_DATE('${safeDate}') AND o.CREATED_AT < DATEADD(day, 8, TO_DATE('${safeDate}')) THEN o.ORDER_ID END) AS ORDERS_7D_AFTER
      FROM viral_users vu
      LEFT JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o ON o.APPLICATION_USER_ID = vu.APPLICATION_USER_ID AND o.COUNTRY = 'MX'
        AND o.CREATED_AT >= DATEADD(day,-7,TO_DATE('${safeDate}')) AND o.CREATED_AT < DATEADD(day, 8, TO_DATE('${safeDate}'))
        AND NOT (o.CREATED_AT >= TO_DATE('${safeDate}') AND o.CREATED_AT < DATEADD(day, 1, TO_DATE('${safeDate}')))
      UNION ALL
      SELECT 
        'CONTROL' AS COHORT,
        COUNT(DISTINCT CASE WHEN o.CREATED_AT >= DATEADD(day,-7,TO_DATE('${safeDate}')) AND o.CREATED_AT < TO_DATE('${safeDate}') THEN o.ORDER_ID END) AS ORDERS_7D_BEFORE,
        COUNT(DISTINCT CASE WHEN o.CREATED_AT > TO_DATE('${safeDate}') AND o.CREATED_AT < DATEADD(day, 8, TO_DATE('${safeDate}')) THEN o.ORDER_ID END) AS ORDERS_7D_AFTER
      FROM control_users cu
      LEFT JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o ON o.APPLICATION_USER_ID = cu.APPLICATION_USER_ID AND o.COUNTRY = 'MX'
        AND o.CREATED_AT >= DATEADD(day,-7,TO_DATE('${safeDate}')) AND o.CREATED_AT < DATEADD(day, 8, TO_DATE('${safeDate}'))
        AND NOT (o.CREATED_AT >= TO_DATE('${safeDate}') AND o.CREATED_AT < DATEADD(day, 1, TO_DATE('${safeDate}')))
    `;

    let stockeoAnalysis = { viralBefore: 0, viralAfter: 0, viralChange: 0, controlBefore: 0, controlAfter: 0, controlChange: 0, isStockeo: false };
    try {
      const stockeoRows = await executeQuery(stockeoSql);
      for (const row of stockeoRows as Record<string, unknown>[]) {
        const cohort = String(row.COHORT);
        const before = Number(row.ORDERS_7D_BEFORE) || 0;
        const after = Number(row.ORDERS_7D_AFTER) || 0;
        const change = before > 0 ? ((after - before) / before) * 100 : 0;
        if (cohort === 'VIRAL') { stockeoAnalysis.viralBefore = before; stockeoAnalysis.viralAfter = after; stockeoAnalysis.viralChange = change; }
        else { stockeoAnalysis.controlBefore = before; stockeoAnalysis.controlAfter = after; stockeoAnalysis.controlChange = change; }
      }
      // Stockeo = viral drops significantly more than control
      stockeoAnalysis.isStockeo = (stockeoAnalysis.viralChange - stockeoAnalysis.controlChange) < -10;
    } catch { /* stockeo analysis optional */ }

    return NextResponse.json({
      data,
      baseline: { gmv: baselineGmv, units: baselineUnits, users: baselineUsers },
      postViral: { avgGmv: postAvgGmv, avgUnits: postAvgUnits, avgUsers: postAvgUsers },
      incrementalFromViral,
      sustainedUplift,
      daysToNormalize: daysToNormalize >= 0 ? daysToNormalize + 1 : null,
      isJustAPeak: sustainedUplift < 5,
      stockeoAnalysis,
    });
  } catch (error) {
    console.error('Post-demand query error:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
