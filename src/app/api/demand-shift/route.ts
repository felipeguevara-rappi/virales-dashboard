import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/snowflake';

export async function POST(request: NextRequest) {
  try {
    const { syncIds, viralDate } = await request.json();
    if (!syncIds?.length || !viralDate) return NextResponse.json({ error: 'syncIds and viralDate required' }, { status: 400 });

    const safeSyncIds = (syncIds as number[]).filter(id => Number.isInteger(id)).join(',');
    const safeDate = String(viralDate).replace(/[^0-9-]/g, '');

    // Get units and GMV for 3 periods: pre-30d, viral day, post-30d
    const sql = `
      SELECT 
        CASE 
          WHEN CREATED_AT BETWEEN DATEADD(day,-30,TO_DATE('${safeDate}')) AND DATEADD(day,-1,TO_DATE('${safeDate}')) THEN 'PRE'
          WHEN CREATED_AT = TO_DATE('${safeDate}') THEN 'VIRAL'
          WHEN CREATED_AT BETWEEN DATEADD(day,1,TO_DATE('${safeDate}')) AND DATEADD(day,30,TO_DATE('${safeDate}')) THEN 'POST'
        END AS PERIOD,
        SUM(UNITS) AS UNITS,
        SUM(TOTAL_PRICE_WO_IVA) AS GMV,
        COUNT(DISTINCT CREATED_AT) AS DAYS
      FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS
      WHERE SYNC_PRODUCT_ID IN (${safeSyncIds}) AND COUNTRY = 'MX' AND COUNT_TO_GMV = TRUE
        AND CREATED_AT BETWEEN DATEADD(day,-30,TO_DATE('${safeDate}')) AND DATEADD(day,30,TO_DATE('${safeDate}'))
      GROUP BY 1
    `;

    const rows = await executeQuery(sql);
    const periods: Record<string, { units: number; gmv: number; days: number }> = {};
    for (const row of rows as Record<string, unknown>[]) {
      const p = String(row.PERIOD);
      if (p && p !== 'null') periods[p] = { units: Number(row.UNITS) || 0, gmv: Number(row.GMV) || 0, days: Number(row.DAYS) || 1 };
    }

    const preUnits = periods.PRE?.units || 0;
    const preGmv = periods.PRE?.gmv || 0;
    const preDays = periods.PRE?.days || 30;
    const viralUnits = periods.VIRAL?.units || 0;
    const viralGmv = periods.VIRAL?.gmv || 0;
    const postUnits = periods.POST?.units || 0;
    const postGmv = periods.POST?.gmv || 0;
    const postDays = periods.POST?.days || 30;

    const dailyAvgUnitsPre = preUnits / preDays;
    const dailyAvgGmvPre = preGmv / preDays;
    const dailyAvgUnitsPost = postUnits / postDays;
    const dailyAvgGmvPost = postGmv / postDays;

    // Total period (61 days): what actually happened
    const totalDays = preDays + 1 + postDays;
    const totalActualUnits = preUnits + viralUnits + postUnits;
    const totalActualGmv = preGmv + viralGmv + postGmv;

    // Expected without viral: total days × pre-viral daily rate
    const expectedUnits = Math.round(dailyAvgUnitsPre * totalDays);
    const expectedGmv = Math.round(dailyAvgGmvPre * totalDays);

    // Net impact INCLUDING viral day
    const netUnitsImpact = totalActualUnits - expectedUnits;
    const netGmvImpact = totalActualGmv - expectedGmv;

    // Post-only decline
    const postDeclinePct = dailyAvgUnitsPre > 0 ? ((dailyAvgUnitsPost - dailyAvgUnitsPre) / dailyAvgUnitsPre) * 100 : 0;

    // Verdict
    let verdict: string;
    if (netUnitsImpact > expectedUnits * 0.05) {
      verdict = 'GENERATION'; // >5% more units than expected
    } else if (netUnitsImpact < -expectedUnits * 0.05) {
      verdict = 'DESTRUCTION'; // >5% fewer units
    } else {
      verdict = 'NEUTRAL'; // within ±5% = just demand shift
    }

    return NextResponse.json({
      pre: { units: preUnits, gmv: preGmv, days: preDays, dailyAvgUnits: dailyAvgUnitsPre, dailyAvgGmv: dailyAvgGmvPre },
      viral: { units: viralUnits, gmv: viralGmv },
      post: { units: postUnits, gmv: postGmv, days: postDays, dailyAvgUnits: dailyAvgUnitsPost, dailyAvgGmv: dailyAvgGmvPost },
      total: { actualUnits: totalActualUnits, actualGmv: totalActualGmv, expectedUnits, expectedGmv, days: totalDays },
      netUnitsImpact,
      netGmvImpact,
      netUnitsPct: expectedUnits > 0 ? (netUnitsImpact / expectedUnits) * 100 : 0,
      netGmvPct: expectedGmv > 0 ? (netGmvImpact / expectedGmv) * 100 : 0,
      postDeclinePct,
      verdict,
    });
  } catch (error) {
    console.error('Demand shift error:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
