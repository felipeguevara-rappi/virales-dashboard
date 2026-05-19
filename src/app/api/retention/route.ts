import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/snowflake';

export async function POST(request: NextRequest) {
  try {
    const { syncIds, viralDate } = await request.json();
    if (!syncIds?.length || !viralDate) return NextResponse.json({ error: 'syncIds and viralDate required' }, { status: 400 });

    const safeSyncIds = (syncIds as number[]).filter(id => Number.isInteger(id)).join(',');
    const safeDate = String(viralDate).replace(/[^0-9-]/g, '');

    // TURBO-ONLY retention: classify by Turbo history, measure Turbo return
    const sql = `
      WITH viral_users AS (
        SELECT DISTINCT o.APPLICATION_USER_ID
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d
        JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o ON o.ORDER_ID = d.ORDER_ID AND o.COUNTRY = 'MX'
        WHERE d.SYNC_PRODUCT_ID IN (${safeSyncIds}) AND d.CREATED_AT = TO_DATE('${safeDate}') AND d.COUNTRY = 'MX' AND d.COUNT_TO_GMV = TRUE AND o.APPLICATION_USER_ID IS NOT NULL
      ),
      turbo_history AS (
        SELECT vu.APPLICATION_USER_ID, MIN(o.CREATED_AT)::DATE AS FIRST_TURBO,
          MAX(CASE WHEN o.CREATED_AT < TO_DATE('${safeDate}') THEN o.CREATED_AT END)::DATE AS LAST_TURBO_BEFORE
        FROM viral_users vu
        LEFT JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o ON o.APPLICATION_USER_ID = vu.APPLICATION_USER_ID AND o.COUNTRY = 'MX' AND o.STORE_TYPE_STORE ILIKE '%turbo%'
          AND o.CREATED_AT >= '2023-01-01'::TIMESTAMP_NTZ AND o.CREATED_AT < DATEADD(day, 1, TO_DATE('${safeDate}'))
        GROUP BY 1
      ),
      classified AS (
        SELECT APPLICATION_USER_ID,
          CASE 
            WHEN FIRST_TURBO IS NULL OR FIRST_TURBO = TO_DATE('${safeDate}') THEN 'NEW_TO_TURBO'
            WHEN LAST_TURBO_BEFORE IS NULL OR LAST_TURBO_BEFORE < DATEADD(day,-30,TO_DATE('${safeDate}')) THEN 'REACTIVATED_TURBO'
            ELSE 'EXISTING_TURBO'
          END AS USER_TYPE
        FROM turbo_history
      ),
      post_orders AS (
        SELECT c.APPLICATION_USER_ID, c.USER_TYPE,
          MAX(CASE WHEN o2.CREATED_AT < DATEADD(day, 16, TO_DATE('${safeDate}')) THEN 1 ELSE 0 END) AS HAD_ORDER_15D,
          MAX(CASE WHEN o2.CREATED_AT < DATEADD(day, 31, TO_DATE('${safeDate}')) THEN 1 ELSE 0 END) AS HAD_ORDER_30D,
          MAX(CASE WHEN o2.CREATED_AT < DATEADD(day, 46, TO_DATE('${safeDate}')) THEN 1 ELSE 0 END) AS HAD_ORDER_45D,
          MAX(CASE WHEN o2.CREATED_AT < DATEADD(day, 61, TO_DATE('${safeDate}')) THEN 1 ELSE 0 END) AS HAD_ORDER_60D,
          COUNT(DISTINCT o2.ORDER_ID) AS TOTAL_ORDERS_POST
        FROM classified c
        LEFT JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o2 
          ON o2.APPLICATION_USER_ID = c.APPLICATION_USER_ID AND o2.COUNTRY = 'MX' AND o2.STORE_TYPE_STORE ILIKE '%turbo%'
          AND o2.CREATED_AT > TO_DATE('${safeDate}') AND o2.CREATED_AT < DATEADD(day, 61, TO_DATE('${safeDate}'))
        GROUP BY 1, 2
      )
      SELECT USER_TYPE,
        COUNT(*) AS COHORT_SIZE,
        SUM(HAD_ORDER_15D) AS RET_15D,
        SUM(HAD_ORDER_30D) AS RET_30D,
        SUM(HAD_ORDER_45D) AS RET_45D,
        SUM(HAD_ORDER_60D) AS RET_60D,
        ROUND(AVG(TOTAL_ORDERS_POST), 1) AS AVG_ORDERS_60D
      FROM post_orders
      GROUP BY 1
      ORDER BY 1
    `;

    const rows = await executeQuery(sql);

    const today = new Date();
    const viralDateObj = new Date(safeDate);
    const daysSinceViral = Math.floor((today.getTime() - viralDateObj.getTime()) / (1000 * 60 * 60 * 24));

    const segments = (rows as Record<string, unknown>[]).map(row => {
      const cohortSize = Number(row.COHORT_SIZE) || 0;
      return {
        userType: String(row.USER_TYPE),
        cohortSize,
        ret15d: Number(row.RET_15D) || 0,
        ret30d: Number(row.RET_30D) || 0,
        ret45d: Number(row.RET_45D) || 0,
        ret60d: Number(row.RET_60D) || 0,
        ret15dPct: cohortSize > 0 ? (Number(row.RET_15D) || 0) / cohortSize * 100 : 0,
        ret30dPct: cohortSize > 0 ? (Number(row.RET_30D) || 0) / cohortSize * 100 : 0,
        ret45dPct: cohortSize > 0 ? (Number(row.RET_45D) || 0) / cohortSize * 100 : 0,
        ret60dPct: cohortSize > 0 ? (Number(row.RET_60D) || 0) / cohortSize * 100 : 0,
        avgOrders60d: Number(row.AVG_ORDERS_60D) || 0,
        avgLtv60d: 0,
      };
    });

    const totalCohort = segments.reduce((s, seg) => s + seg.cohortSize, 0);
    const newToTurbo = segments.find(s => s.userType === 'NEW_TO_TURBO');
    const existingTurbo = segments.find(s => s.userType === 'EXISTING_TURBO');

    // Turbo benchmark: ~20% ret 30d for new users (from team's data)
    const benchmarkRet15d = 12;
    const benchmarkRet30d = 20;

    return NextResponse.json({
      segments,
      totalCohort,
      trulyNewCount: newToTurbo?.cohortSize || 0,
      existingActivePct: totalCohort > 0 ? ((existingTurbo?.cohortSize || 0) / totalCohort * 100) : 0,
      benchmark: { ret15d: benchmarkRet15d, ret30d: benchmarkRet30d },
      qualityGap: (newToTurbo?.ret30dPct || 0) - benchmarkRet30d,
      daysSinceViral,
      maturity15: daysSinceViral >= 15,
      maturity30: daysSinceViral >= 30,
      maturity45: daysSinceViral >= 45,
      maturity60: daysSinceViral >= 60,
    });
  } catch (error) {
    console.error('Retention query error:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
