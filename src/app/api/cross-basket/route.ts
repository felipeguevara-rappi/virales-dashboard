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

    // Companion basket with honest desglose: habitual vs new category
    const sql = `
      WITH viral_orders AS (
        SELECT DISTINCT d.ORDER_ID, o.APPLICATION_USER_ID
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d
        JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o ON o.ORDER_ID = d.ORDER_ID AND o.COUNTRY = 'MX'
        WHERE d.SYNC_PRODUCT_ID IN (${safeSyncIds}) AND d.CREATED_AT = TO_DATE('${safeDate}') AND d.COUNTRY = 'MX' AND d.COUNT_TO_GMV = TRUE
          AND o.APPLICATION_USER_ID IS NOT NULL
      ),
      companion_items AS (
        SELECT vo.APPLICATION_USER_ID, d.CATEGORY_NAME, d.TOTAL_PRICE_WO_IVA AS GMV, d.UNITS
        FROM viral_orders vo
        JOIN RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d ON d.ORDER_ID = vo.ORDER_ID
        WHERE d.COUNTRY = 'MX' AND d.COUNT_TO_GMV = TRUE AND d.SYNC_PRODUCT_ID NOT IN (${safeSyncIds}) AND d.CATEGORY_NAME IS NOT NULL
      ),
      user_prev_categories AS (
        SELECT DISTINCT vo.APPLICATION_USER_ID, d_prev.CATEGORY_NAME
        FROM viral_orders vo
        JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o_prev ON o_prev.APPLICATION_USER_ID = vo.APPLICATION_USER_ID AND o_prev.COUNTRY = 'MX'
          AND o_prev.CREATED_AT::DATE BETWEEN DATEADD(day,-60,TO_DATE('${safeDate}')) AND DATEADD(day,-1,TO_DATE('${safeDate}'))
        JOIN RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d_prev ON d_prev.ORDER_ID = o_prev.ORDER_ID AND d_prev.COUNTRY = 'MX' AND d_prev.CATEGORY_NAME IS NOT NULL
      )
      SELECT 
        COUNT(DISTINCT ci.APPLICATION_USER_ID) AS USERS_WITH_COMPANION,
        (SELECT COUNT(DISTINCT APPLICATION_USER_ID) FROM viral_orders) AS TOTAL_VIRAL_USERS,
        SUM(ci.GMV) AS TOTAL_COMPANION_GMV,
        SUM(CASE WHEN upc.CATEGORY_NAME IS NOT NULL THEN ci.GMV ELSE 0 END) AS GMV_HABITUAL,
        SUM(CASE WHEN upc.CATEGORY_NAME IS NULL THEN ci.GMV ELSE 0 END) AS GMV_NEW_CATEGORY,
        COUNT(DISTINCT ci.CATEGORY_NAME) AS TOTAL_CATEGORIES,
        COUNT(DISTINCT CASE WHEN upc.CATEGORY_NAME IS NULL THEN ci.CATEGORY_NAME END) AS NEW_CATEGORIES
      FROM companion_items ci
      LEFT JOIN user_prev_categories upc ON upc.APPLICATION_USER_ID = ci.APPLICATION_USER_ID AND upc.CATEGORY_NAME = ci.CATEGORY_NAME
    `;

    const rows = await executeQuery(sql);
    const row = rows[0] as Record<string, number> || {};

    // Top categories in companion basket
    const catSql = `
      WITH viral_orders AS (
        SELECT DISTINCT ORDER_ID
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS
        WHERE SYNC_PRODUCT_ID IN (${safeSyncIds}) AND CREATED_AT = TO_DATE('${safeDate}') AND COUNTRY = 'MX' AND COUNT_TO_GMV = TRUE
      )
      SELECT d.CATEGORY_NAME, 
        COUNT(DISTINCT d.ORDER_ID) AS ORDERS,
        ROUND(SUM(d.TOTAL_PRICE_WO_IVA), 0) AS GMV,
        SUM(d.UNITS) AS UNITS
      FROM viral_orders vo
      JOIN RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d ON d.ORDER_ID = vo.ORDER_ID
      WHERE d.COUNTRY = 'MX' AND d.COUNT_TO_GMV = TRUE AND d.CATEGORY_NAME IS NOT NULL
        AND d.SYNC_PRODUCT_ID NOT IN (${safeSyncIds})
      GROUP BY 1
      ORDER BY GMV DESC
      LIMIT 8
    `;

    const catRows = await executeQuery(catSql);
    const topCategories = (catRows as Record<string, unknown>[]).map(r => ({
      category: String(r.CATEGORY_NAME || ''),
      orders: Number(r.ORDERS) || 0,
      gmv: Number(r.GMV) || 0,
    }));

    const totalCompanionGmv = row.TOTAL_COMPANION_GMV || 0;
    const gmvHabitual = row.GMV_HABITUAL || 0;
    const gmvNewCategory = row.GMV_NEW_CATEGORY || 0;
    const totalViralUsers = row.TOTAL_VIRAL_USERS || 0;
    const usersWithCompanion = row.USERS_WITH_COMPANION || 0;

    return NextResponse.json({
      totalViralUsers,
      usersWithCompanion,
      companionPenetration: totalViralUsers > 0 ? (usersWithCompanion / totalViralUsers) * 100 : 0,
      totalCompanionGmv,
      gmvHabitual,
      gmvNewCategory,
      trueCrossSellPct: totalCompanionGmv > 0 ? (gmvNewCategory / totalCompanionGmv) * 100 : 0,
      habitualPct: totalCompanionGmv > 0 ? (gmvHabitual / totalCompanionGmv) * 100 : 0,
      totalCategories: row.TOTAL_CATEGORIES || 0,
      newCategories: row.NEW_CATEGORIES || 0,
      topCategories,
    });
  } catch (error) {
    console.error('Cross-basket query error:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
