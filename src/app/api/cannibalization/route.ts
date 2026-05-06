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

    const sql = `
      SELECT CREATED_AT AS DAY, 
        SUM(TOTAL_PRICE_WO_IVA) AS GMV, 
        SUM(UNITS) AS UNITS, 
        COUNT(DISTINCT ORDER_ID) AS ORDERS
      FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS
      WHERE SYNC_PRODUCT_ID IN (${safeSyncIds}) AND COUNTRY = 'MX' AND COUNT_TO_GMV = TRUE
        AND CREATED_AT BETWEEN DATEADD(day, -28, TO_DATE('${safeDate}')) AND DATEADD(day, 6, TO_DATE('${safeDate}'))
      GROUP BY CREATED_AT
      ORDER BY CREATED_AT
    `;

    const rows = await executeQuery(sql);

    // Parse viral date as UTC midnight
    const [vyear, vmonth, vday] = safeDate.split('-').map(Number);
    const viralTs = Date.UTC(vyear, vmonth - 1, vday);

    const data = (rows as Record<string, unknown>[]).map(row => {
      const rawDay = row.DAY;
      let dayTs: number;
      if (rawDay instanceof Date) {
        dayTs = rawDay.getTime();
      } else {
        const str = String(rawDay).replace(/"/g, '');
        const parsed = new Date(str + 'T00:00:00Z');
        dayTs = parsed.getTime();
      }
      const dayIndex = Math.round((dayTs - viralTs) / (1000 * 60 * 60 * 24));
      const dayStr = new Date(dayTs).toISOString().slice(0, 10);

      return {
        day: dayStr,
        units: Number(row.UNITS) || 0,
        gmv: Number(row.GMV) || 0,
        orders: Number(row.ORDERS) || 0,
        dayIndex,
      };
    });

    // Baseline: average of T-28 to T-8
    const baselineDays = data.filter(d => d.dayIndex >= -28 && d.dayIndex <= -8);
    const baselineAvgGmv = baselineDays.length > 0
      ? baselineDays.reduce((s, d) => s + d.gmv, 0) / baselineDays.length
      : 0;
    const baselineAvgUnits = baselineDays.length > 0
      ? baselineDays.reduce((s, d) => s + d.units, 0) / baselineDays.length
      : 0;

    // Viral day metrics
    const viralDay = data.find(d => d.dayIndex === 0);
    const viralGmv = viralDay?.gmv || 0;
    const incrementalGmv = viralGmv - baselineAvgGmv;

    // Post-viral average (T+1 to T+6)
    const postViralDays = data.filter(d => d.dayIndex >= 1 && d.dayIndex <= 6);
    const postViralAvgGmv = postViralDays.length > 0
      ? postViralDays.reduce((s, d) => s + d.gmv, 0) / postViralDays.length
      : 0;
    const postViralVsBaseline = baselineAvgGmv > 0 ? ((postViralAvgGmv - baselineAvgGmv) / baselineAvgGmv) * 100 : 0;

    return NextResponse.json({
      data,
      baseline: { avgUnits: baselineAvgUnits, avgGmv: baselineAvgGmv },
      incrementalGmv,
      viralMultiplier: baselineAvgGmv > 0 ? viralGmv / baselineAvgGmv : 0,
      postViralVsBaseline, // positive = no cannibalization, negative = cannibalization
    });
  } catch (error) {
    console.error('Cannibalization query error:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
