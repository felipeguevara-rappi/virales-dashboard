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

    // Main stockout summary
    const sql = `
      WITH active_wh AS (
        SELECT DISTINCT WAREHOUSE_ID, WAREHOUSE_NAME
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_WAREHOUSE_NEW
        WHERE COUNTRY = 'MX' AND IS_CEDI = FALSE AND WAREHOUSE_NAME NOT LIKE '%INACTIVE%'
      ),
      wh_orders_180d AS (
        SELECT WAREHOUSE_ID, COUNT(DISTINCT ORDER_ID) AS ORDERS_180D
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS
        WHERE COUNTRY = 'MX' AND COUNT_TO_GMV = TRUE
          AND CREATED_AT BETWEEN DATEADD(day, -180, TO_DATE('${safeDate}')) AND DATEADD(day,-1,TO_DATE('${safeDate}'))
        GROUP BY 1
      ),
      total_orders AS (SELECT SUM(ORDERS_180D) AS TOTAL FROM wh_orders_180d),
      stock_detail AS (
        SELECT ic.WAREHOUSE_ID, ic.SYNC_PRODUCT_ID,
          MAX(CASE WHEN ic.CREATED_AT = DATEADD(day,-1,TO_DATE('${safeDate}')) THEN ic.SUM_UNITS_CUMULADO END) AS OPENING,
          MAX(CASE WHEN ic.CREATED_AT = TO_DATE('${safeDate}') THEN ic.SUM_UNITS_CUMULADO END) AS CLOSING
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_INVENTORY_COST ic
        JOIN active_wh aw ON ic.WAREHOUSE_ID = aw.WAREHOUSE_ID
        WHERE ic.SYNC_PRODUCT_ID IN (${safeSyncIds})
          AND ic.COUNTRY = 'MX' 
          AND ic.CREATED_AT BETWEEN DATEADD(day,-1,TO_DATE('${safeDate}')) AND TO_DATE('${safeDate}')
        GROUP BY 1,2
      ),
      wh_summary AS (
        SELECT WAREHOUSE_ID,
          COUNT(*) AS TOTAL_PRODUCTS,
          SUM(CASE WHEN COALESCE(OPENING,0) > 0 THEN 1 ELSE 0 END) AS PRODUCTS_WITH_STOCK,
          SUM(CASE WHEN COALESCE(OPENING,0) > 0 AND COALESCE(CLOSING,0) <= 0 THEN 1 ELSE 0 END) AS PRODUCTS_SOLD_OUT,
          SUM(COALESCE(OPENING,0)) AS WH_OPENING,
          SUM(COALESCE(CLOSING,0)) AS WH_CLOSING
        FROM stock_detail
        GROUP BY 1
      )
      SELECT 
        COUNT(ws.WAREHOUSE_ID) AS TOTAL_WH,
        SUM(CASE WHEN ws.PRODUCTS_SOLD_OUT > 0 THEN 1 ELSE 0 END) AS WH_WITH_STOCKOUT,
        SUM(ws.PRODUCTS_WITH_STOCK) AS TOTAL_PRODUCT_WH_WITH_STOCK,
        SUM(ws.PRODUCTS_SOLD_OUT) AS TOTAL_PRODUCTS_SOLD_OUT,
        ROUND(SUM(CASE WHEN ws.PRODUCTS_SOLD_OUT > 0 THEN wo.ORDERS_180D ELSE 0 END)::FLOAT / NULLIF(t.TOTAL,0) * 100, 2) AS MIX_AFFECTED_PCT,
        ROUND(SUM(CASE WHEN ws.PRODUCTS_SOLD_OUT = 0 THEN wo.ORDERS_180D ELSE 0 END)::FLOAT / NULLIF(t.TOTAL,0) * 100, 2) AS MIX_FULL_COVERAGE_PCT,
        SUM(ws.WH_OPENING) AS TOTAL_OPENING,
        SUM(ws.WH_CLOSING) AS TOTAL_CLOSING
      FROM wh_summary ws
      LEFT JOIN wh_orders_180d wo ON wo.WAREHOUSE_ID = ws.WAREHOUSE_ID
      CROSS JOIN total_orders t
      GROUP BY t.TOTAL
    `;

    const rows = await executeQuery(sql);
    const row = rows[0] as Record<string, number> || {};

    // Get units actually sold from orders (correct metric)
    const unitsSql = `
      SELECT SUM(UNITS) AS UNITS_SOLD
      FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS
      WHERE SYNC_PRODUCT_ID IN (${safeSyncIds}) AND CREATED_AT = TO_DATE('${safeDate}') AND COUNTRY = 'MX' AND COUNT_TO_GMV = TRUE
    `;
    const unitsRows = await executeQuery(unitsSql);
    const unitsSold = Number((unitsRows[0] as Record<string, number>)?.UNITS_SOLD) || 0;

    // City breakdown
    const citySql = `
      SELECT w.CITY,
        COUNT(DISTINCT ic.WAREHOUSE_ID) AS WH_COUNT,
        SUM(CASE WHEN ic.CREATED_AT = DATEADD(day,-1,TO_DATE('${safeDate}')) THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS STOCK_BEFORE,
        SUM(CASE WHEN ic.CREATED_AT = TO_DATE('${safeDate}') THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS STOCK_AFTER,
        SUM(CASE WHEN ic.CREATED_AT = DATEADD(day,1,TO_DATE('${safeDate}')) THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS STOCK_DAY_AFTER
      FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_INVENTORY_COST ic
      JOIN RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_WAREHOUSE_NEW w ON ic.WAREHOUSE_ID = w.WAREHOUSE_ID AND w.COUNTRY = 'MX' AND w.IS_CEDI = FALSE AND w.WAREHOUSE_NAME NOT LIKE '%INACTIVE%'
      WHERE ic.SYNC_PRODUCT_ID IN (${safeSyncIds})
        AND ic.COUNTRY = 'MX' 
        AND ic.CREATED_AT BETWEEN DATEADD(day,-1,TO_DATE('${safeDate}')) AND DATEADD(day,1,TO_DATE('${safeDate}'))
      GROUP BY w.CITY
      HAVING SUM(CASE WHEN ic.CREATED_AT = DATEADD(day,-1,TO_DATE('${safeDate}')) THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) > 0
      ORDER BY SUM(CASE WHEN ic.CREATED_AT = DATEADD(day,-1,TO_DATE('${safeDate}')) THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) DESC
      LIMIT 10
    `;
    const cityRows = await executeQuery(citySql);
    const cityBreakdown = (cityRows as Record<string, unknown>[]).map(r => ({
      city: String(r.CITY || ''),
      whCount: Number(r.WH_COUNT) || 0,
      stockBefore: Number(r.STOCK_BEFORE) || 0,
      stockAfter: Number(r.STOCK_AFTER) || 0,
      stockDayAfter: Number(r.STOCK_DAY_AFTER) || 0,
    }));

    // Stock opportunity: warehouses that could have sold but had no/low stock
    const opportunitySql = `
      WITH active_wh AS (
        SELECT DISTINCT w.WAREHOUSE_ID, w.WAREHOUSE_NAME
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_WAREHOUSE_NEW w
        WHERE w.COUNTRY = 'MX' AND w.IS_CEDI = FALSE AND w.WAREHOUSE_NAME NOT LIKE '%INACTIVE%'
      ),
      wh_capacity AS (
        SELECT WAREHOUSE_ID, COUNT(DISTINCT ORDER_ID) AS ORDERS_30D
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS
        WHERE COUNTRY = 'MX' AND COUNT_TO_GMV = TRUE AND CREATED_AT BETWEEN DATEADD(day,-30,TO_DATE('${safeDate}')) AND DATEADD(day,-1,TO_DATE('${safeDate}'))
        GROUP BY 1
      ),
      wh_viral_stock AS (
        SELECT ic.WAREHOUSE_ID, COUNT(DISTINCT ic.SYNC_PRODUCT_ID) AS PRODUCTS_STOCKED
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_INVENTORY_COST ic
        JOIN active_wh aw ON ic.WAREHOUSE_ID = aw.WAREHOUSE_ID
        WHERE ic.SYNC_PRODUCT_ID IN (${safeSyncIds}) AND ic.COUNTRY = 'MX' AND ic.CREATED_AT = DATEADD(day,-1,TO_DATE('${safeDate}')) AND ic.SUM_UNITS_CUMULADO > 0
        GROUP BY 1
      ),
      wh_viral_sales AS (
        SELECT WAREHOUSE_ID, SUM(TOTAL_PRICE_WO_IVA) AS GMV, COUNT(DISTINCT ORDER_ID) AS VIRAL_ORDERS
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS
        WHERE SYNC_PRODUCT_ID IN (${safeSyncIds}) AND COUNTRY = 'MX' AND CREATED_AT = TO_DATE('${safeDate}') AND COUNT_TO_GMV = TRUE
        GROUP BY 1
      )
      SELECT 
        COUNT(DISTINCT wc.WAREHOUSE_ID) AS TOTAL_ACTIVE_WH,
        COUNT(DISTINCT wvst.WAREHOUSE_ID) AS WH_WITH_STOCK,
        COUNT(DISTINCT CASE WHEN wvst.WAREHOUSE_ID IS NULL THEN wc.WAREHOUSE_ID END) AS WH_NO_STOCK,
        SUM(CASE WHEN wvst.WAREHOUSE_ID IS NOT NULL THEN wc.ORDERS_30D ELSE 0 END) AS STOCKED_WH_CAPACITY,
        SUM(CASE WHEN wvst.WAREHOUSE_ID IS NULL THEN wc.ORDERS_30D ELSE 0 END) AS UNSTOCKED_WH_CAPACITY,
        SUM(COALESCE(wvs.GMV, 0)) AS TOTAL_VIRAL_GMV,
        SUM(COALESCE(wvs.VIRAL_ORDERS, 0)) AS TOTAL_VIRAL_ORDERS
      FROM wh_capacity wc
      JOIN active_wh aw ON aw.WAREHOUSE_ID = wc.WAREHOUSE_ID
      LEFT JOIN wh_viral_stock wvst ON wvst.WAREHOUSE_ID = wc.WAREHOUSE_ID
      LEFT JOIN wh_viral_sales wvs ON wvs.WAREHOUSE_ID = wc.WAREHOUSE_ID
    `;

    let opportunity = { totalActiveWh: 0, whWithStock: 0, whNoStock: 0, stockedCapacity: 0, unstockedCapacity: 0, estimatedLostGmv: 0, conversionRate: 0 };
    try {
      const oppRows = await executeQuery(opportunitySql);
      const oRow = oppRows[0] as Record<string, number> || {};
      const stockedCapacity = oRow.STOCKED_WH_CAPACITY || 1;
      const viralOrders = oRow.TOTAL_VIRAL_ORDERS || 0;
      const viralGmv = oRow.TOTAL_VIRAL_GMV || 0;
      const unstockedCapacity = oRow.UNSTOCKED_WH_CAPACITY || 0;
      
      // Use ACTUAL conversion rate from this viral: viral orders / stocked capacity
      const convRate = stockedCapacity > 0 ? viralOrders / stockedCapacity : 0;
      const avgOrderValue = viralOrders > 0 ? viralGmv / viralOrders : 0;
      // Lost GMV = unstocked capacity × conversion rate × avg order value
      const estimatedLost = unstockedCapacity * convRate * avgOrderValue;
      
      opportunity = {
        totalActiveWh: oRow.TOTAL_ACTIVE_WH || 0,
        whWithStock: oRow.WH_WITH_STOCK || 0,
        whNoStock: oRow.WH_NO_STOCK || 0,
        stockedCapacity,
        unstockedCapacity,
        conversionRate: convRate * 100,
        estimatedLostGmv: estimatedLost,
      };
    } catch { /* optional */ }

    return NextResponse.json({
      totalWarehouses: row.TOTAL_WH || 0,
      whWithStockout: row.WH_WITH_STOCKOUT || 0,
      totalProductsWithStock: row.TOTAL_PRODUCT_WH_WITH_STOCK || 0,
      totalProductsSoldOut: row.TOTAL_PRODUCTS_SOLD_OUT || 0,
      mixAffectedPct: row.MIX_AFFECTED_PCT || 0,
      mixFullCoveragePct: row.MIX_FULL_COVERAGE_PCT || 0,
      totalOpening: row.TOTAL_OPENING || 0,
      totalClosing: row.TOTAL_CLOSING || 0,
      unitsSold,
      cityBreakdown,
      opportunity,
    });
  } catch (error) {
    console.error('Stockout query error:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
