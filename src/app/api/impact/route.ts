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

    // Main impact + user classification
    const sql = `
      WITH viral_orders AS (
        SELECT d.ORDER_ID, 
               d.TOTAL_PRICE_WO_IVA AS GMV, 
               d.UNITS,
               COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_RAPPI,0) 
                 + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MAKERS,0)
                 + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_COMMERCIAL,0)
                 + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_PARTNERS,0)
                 + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_SHRINKAGE,0)
                 + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_BLACKBOX,0)
                 + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MONETIZATION,0) AS DISC_TOTAL,
               o.APPLICATION_USER_ID
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d
        LEFT JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o ON o.ORDER_ID = d.ORDER_ID AND o.COUNTRY = 'MX'
          AND o.CREATED_AT >= TO_DATE('${safeDate}') AND o.CREATED_AT < DATEADD(day, 1, TO_DATE('${safeDate}'))
        WHERE d.SYNC_PRODUCT_ID IN (${safeSyncIds}) AND d.CREATED_AT = TO_DATE('${safeDate}') AND d.COUNTRY = 'MX' AND d.COUNT_TO_GMV = TRUE
      ), user_history AS (
        SELECT vo.APPLICATION_USER_ID,
               MIN(oh.CREATED_AT)::DATE AS FIRST_TURBO,
               MAX(CASE WHEN oh.CREATED_AT < TO_DATE('${safeDate}') THEN oh.CREATED_AT END)::DATE AS LAST_TURBO_BEFORE
        FROM (SELECT DISTINCT APPLICATION_USER_ID FROM viral_orders WHERE APPLICATION_USER_ID IS NOT NULL) vo
        LEFT JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS oh ON oh.APPLICATION_USER_ID = vo.APPLICATION_USER_ID AND oh.COUNTRY = 'MX' AND oh.STORE_TYPE_STORE ILIKE '%turbo%'
          AND oh.CREATED_AT >= '2023-01-01'::TIMESTAMP_NTZ AND oh.CREATED_AT < DATEADD(day, 1, TO_DATE('${safeDate}'))
        GROUP BY 1
      )
      SELECT
        SUM(vo.GMV) AS GMV_TOTAL,
        SUM(vo.UNITS) AS UNITS_SOLD,
        SUM(vo.DISC_TOTAL) AS DISCOUNT_SPEND,
        COUNT(DISTINCT vo.APPLICATION_USER_ID) AS UNIQUE_USERS,
        COUNT(DISTINCT vo.ORDER_ID) AS TOTAL_ORDERS,
        COUNT(DISTINCT CASE WHEN uh.FIRST_TURBO IS NULL OR uh.FIRST_TURBO = TO_DATE('${safeDate}') THEN vo.APPLICATION_USER_ID END) AS NEW_USERS,
        COUNT(DISTINCT CASE WHEN uh.LAST_TURBO_BEFORE IS NOT NULL AND uh.LAST_TURBO_BEFORE >= DATEADD(day,-30,TO_DATE('${safeDate}')) THEN vo.APPLICATION_USER_ID END) AS RETAINED_USERS,
        COUNT(DISTINCT CASE WHEN uh.FIRST_TURBO IS NOT NULL AND uh.FIRST_TURBO != TO_DATE('${safeDate}') AND (uh.LAST_TURBO_BEFORE IS NULL OR uh.LAST_TURBO_BEFORE < DATEADD(day,-30,TO_DATE('${safeDate}'))) THEN vo.APPLICATION_USER_ID END) AS REACTIVATED_USERS
      FROM viral_orders vo
      LEFT JOIN user_history uh ON vo.APPLICATION_USER_ID = uh.APPLICATION_USER_ID
    `;

    const rows = await executeQuery(sql);
    const row = rows[0] as Record<string, number> || {};

    // Basket companion query: total GMV in orders that contained viral products
    const basketSql = `
      WITH viral_order_ids AS (
        SELECT DISTINCT ORDER_ID
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS
        WHERE SYNC_PRODUCT_ID IN (${safeSyncIds}) AND CREATED_AT = TO_DATE('${safeDate}') AND COUNTRY = 'MX' AND COUNT_TO_GMV = TRUE
      )
      SELECT 
        SUM(CASE WHEN d.SYNC_PRODUCT_ID NOT IN (${safeSyncIds}) THEN d.TOTAL_PRICE_WO_IVA ELSE 0 END) AS COMPANION_GMV,
        SUM(d.TOTAL_PRICE_WO_IVA) AS FULL_BASKET_GMV,
        COUNT(DISTINCT CASE WHEN d.SYNC_PRODUCT_ID NOT IN (${safeSyncIds}) THEN d.ORDER_ID END) AS ORDERS_WITH_COMPANION
      FROM viral_order_ids voi
      JOIN RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d ON d.ORDER_ID = voi.ORDER_ID
      WHERE d.COUNTRY = 'MX' AND d.COUNT_TO_GMV = TRUE
    `;

    let companionGmv = 0;
    let fullBasketGmv = 0;
    let ordersWithCompanion = 0;
    try {
      const basketRows = await executeQuery(basketSql);
      const bRow = basketRows[0] as Record<string, number> || {};
      companionGmv = bRow.COMPANION_GMV || 0;
      fullBasketGmv = bRow.FULL_BASKET_GMV || 0;
      ordersWithCompanion = bRow.ORDERS_WITH_COMPANION || 0;
    } catch { /* basket query optional */ }

    // Product-level user classification
    let newToProduct = 0, occasionalBuyer = 0, frequentBuyer = 0;
    try {
      const productUserSql = `
        WITH viral_buyers AS (
          SELECT DISTINCT o.APPLICATION_USER_ID
          FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d
          JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o ON o.ORDER_ID = d.ORDER_ID AND o.COUNTRY = 'MX'
            AND o.CREATED_AT >= TO_DATE('${safeDate}') AND o.CREATED_AT < DATEADD(day, 1, TO_DATE('${safeDate}'))
          WHERE d.SYNC_PRODUCT_ID IN (${safeSyncIds}) AND d.CREATED_AT = TO_DATE('${safeDate}') AND d.COUNTRY = 'MX' AND d.COUNT_TO_GMV = TRUE AND o.APPLICATION_USER_ID IS NOT NULL
        ),
        prev_product AS (
          SELECT vb.APPLICATION_USER_ID, COUNT(DISTINCT d_prev.ORDER_ID) AS PREV_ORDERS
          FROM viral_buyers vb
          JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o_prev ON o_prev.APPLICATION_USER_ID = vb.APPLICATION_USER_ID AND o_prev.COUNTRY = 'MX' AND o_prev.CREATED_AT < TO_DATE('${safeDate}')
          JOIN RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d_prev ON d_prev.ORDER_ID = o_prev.ORDER_ID AND d_prev.SYNC_PRODUCT_ID IN (${safeSyncIds}) AND d_prev.COUNTRY = 'MX'
          GROUP BY 1
        )
        SELECT 
          COUNT(CASE WHEN pp.APPLICATION_USER_ID IS NULL THEN 1 END) AS NEW_TO_PRODUCT,
          COUNT(CASE WHEN pp.PREV_ORDERS BETWEEN 1 AND 2 THEN 1 END) AS OCCASIONAL,
          COUNT(CASE WHEN pp.PREV_ORDERS >= 3 THEN 1 END) AS FREQUENT
        FROM viral_buyers vb
        LEFT JOIN prev_product pp ON pp.APPLICATION_USER_ID = vb.APPLICATION_USER_ID
      `;
      const puRows = await executeQuery(productUserSql);
      const puRow = puRows[0] as Record<string, number> || {};
      newToProduct = puRow.NEW_TO_PRODUCT || 0;
      occasionalBuyer = puRow.OCCASIONAL || 0;
      frequentBuyer = puRow.FREQUENT || 0;
    } catch { /* optional */ }

    const uniqueUsers = row.UNIQUE_USERS || 0;
    const discountSpend = row.DISCOUNT_SPEND || 0;
    const gmvTotal = row.GMV_TOTAL || 0;
    const totalOrders = row.TOTAL_ORDERS || 0;

    return NextResponse.json({
      gmvTotal,
      unitsSold: row.UNITS_SOLD || 0,
      discountSpend,
      uniqueUsers,
      totalOrders,
      newUsers: row.NEW_USERS || 0,
      retainedUsers: row.RETAINED_USERS || 0,
      reactivatedUsers: row.REACTIVATED_USERS || 0,
      cac: uniqueUsers > 0 ? discountSpend / uniqueUsers : 0,
      // Basket metrics
      companionGmv,
      fullBasketGmv,
      basketUpliftPct: gmvTotal > 0 ? (companionGmv / gmvTotal) * 100 : 0,
      ordersWithCompanion,
      companionPct: totalOrders > 0 ? (ordersWithCompanion / totalOrders) * 100 : 0,
      productOnlyRoi: discountSpend > 0 ? gmvTotal / discountSpend : 0,
      basketAdjustedRoi: discountSpend > 0 ? fullBasketGmv / discountSpend : 0,
      // Product-level user mix
      newToProduct,
      occasionalBuyer,
      frequentBuyer,
    });
  } catch (error) {
    console.error('Impact query error:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
