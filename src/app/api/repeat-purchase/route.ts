import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/snowflake';

export async function POST(request: NextRequest) {
  try {
    const { syncIds, viralDate } = await request.json();
    if (!syncIds?.length || !viralDate) return NextResponse.json({ error: 'syncIds and viralDate required' }, { status: 400 });

    const safeSyncIds = (syncIds as number[]).filter(id => Number.isInteger(id)).join(',');
    const safeDate = String(viralDate).replace(/[^0-9-]/g, '');

    const sql = `
      WITH viral_buyers AS (
        SELECT DISTINCT o.APPLICATION_USER_ID
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d
        JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o ON o.ORDER_ID = d.ORDER_ID AND o.COUNTRY = 'MX'
        WHERE d.SYNC_PRODUCT_ID IN (${safeSyncIds}) AND d.CREATED_AT = TO_DATE('${safeDate}') AND d.COUNTRY = 'MX' AND d.COUNT_TO_GMV = TRUE AND o.APPLICATION_USER_ID IS NOT NULL
      ),
      repeat_data AS (
        SELECT d2.ORDER_ID, d2.TOTAL_PRICE_WO_IVA AS GMV, o2.APPLICATION_USER_ID,
          CASE WHEN COALESCE(d2.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_RAPPI,0) + COALESCE(d2.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MAKERS,0) + COALESCE(d2.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_COMMERCIAL,0) + COALESCE(d2.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_PARTNERS,0) + COALESCE(d2.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_SHRINKAGE,0) + COALESCE(d2.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_BLACKBOX,0) + COALESCE(d2.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MONETIZATION,0) > 0 THEN 'DISCOUNTED' ELSE 'FULL_PRICE' END AS PRICE_TYPE
        FROM viral_buyers vb
        JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o2 ON o2.APPLICATION_USER_ID = vb.APPLICATION_USER_ID AND o2.COUNTRY = 'MX'
        JOIN RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d2 ON d2.ORDER_ID = o2.ORDER_ID
        WHERE d2.SYNC_PRODUCT_ID IN (${safeSyncIds}) AND d2.COUNTRY = 'MX' AND d2.COUNT_TO_GMV = TRUE
          AND d2.CREATED_AT BETWEEN DATEADD(day,1,TO_DATE('${safeDate}')) AND DATEADD(day,60,TO_DATE('${safeDate}'))
      )
      SELECT 
        (SELECT COUNT(*) FROM viral_buyers) AS TOTAL_VIRAL_BUYERS,
        COUNT(DISTINCT APPLICATION_USER_ID) AS REPEAT_BUYERS,
        COUNT(DISTINCT ORDER_ID) AS TOTAL_REPEAT_ORDERS,
        SUM(GMV) AS TOTAL_REPEAT_GMV,
        COUNT(DISTINCT CASE WHEN PRICE_TYPE = 'FULL_PRICE' THEN ORDER_ID END) AS FULL_PRICE_ORDERS,
        COUNT(DISTINCT CASE WHEN PRICE_TYPE = 'DISCOUNTED' THEN ORDER_ID END) AS DISCOUNTED_ORDERS,
        SUM(CASE WHEN PRICE_TYPE = 'FULL_PRICE' THEN GMV ELSE 0 END) AS FULL_PRICE_GMV,
        SUM(CASE WHEN PRICE_TYPE = 'DISCOUNTED' THEN GMV ELSE 0 END) AS DISCOUNTED_GMV
      FROM repeat_data
    `;

    const rows = await executeQuery(sql);
    const row = rows[0] as Record<string, number> || {};

    const totalBuyers = row.TOTAL_VIRAL_BUYERS || 0;
    const repeatBuyers = row.REPEAT_BUYERS || 0;
    const totalRepeatOrders = row.TOTAL_REPEAT_ORDERS || 0;
    const fullPriceOrders = row.FULL_PRICE_ORDERS || 0;

    return NextResponse.json({
      totalViralBuyers: totalBuyers,
      repeatBuyers,
      repeatRate: totalBuyers > 0 ? (repeatBuyers / totalBuyers) * 100 : 0,
      totalRepeatOrders,
      totalRepeatGmv: row.TOTAL_REPEAT_GMV || 0,
      fullPriceOrders,
      discountedOrders: row.DISCOUNTED_ORDERS || 0,
      fullPricePct: totalRepeatOrders > 0 ? (fullPriceOrders / totalRepeatOrders) * 100 : 0,
      fullPriceGmv: row.FULL_PRICE_GMV || 0,
      discountedGmv: row.DISCOUNTED_GMV || 0,
    });
  } catch (error) {
    console.error('Repeat purchase error:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
