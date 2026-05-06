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

    // Product-level metrics
    const sql = `
      SELECT d.SYNC_PRODUCT_ID, 
        MAX(d.NAME) AS PRODUCT_NAME, 
        MAX(d.BRAND_NAME) AS BRAND,
        MAX(d.CATEGORY_NAME) AS CATEGORY,
        SUM(d.TOTAL_PRICE_WO_IVA) AS GMV,
        SUM(d.UNITS) AS UNITS,
        COUNT(DISTINCT d.ORDER_ID) AS ORDERS,
        SUM(COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_RAPPI,0)
          + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MAKERS,0)
          + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_COMMERCIAL,0)
          + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_PARTNERS,0)
          + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_SHRINKAGE,0)
          + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_BLACKBOX,0)
          + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MONETIZATION,0)) AS DISCOUNT,
        ROUND(SUM(d.TOTAL_PRICE_WO_IVA) / NULLIF(SUM(d.UNITS), 0), 2) AS AVG_PRICE,
        ROUND(SUM(COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_RAPPI,0)
          + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MAKERS,0)
          + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_COMMERCIAL,0)
          + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_PARTNERS,0)
          + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_SHRINKAGE,0)
          + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_BLACKBOX,0)
          + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MONETIZATION,0)) 
          / NULLIF(SUM(CASE WHEN COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_RAPPI,0) + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MAKERS,0) + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_COMMERCIAL,0) + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_PARTNERS,0) + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_SHRINKAGE,0) + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_BLACKBOX,0) + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MONETIZATION,0) > 0 THEN d.TOTAL_PRICE_WO_IVA END), 0) * 100, 1) AS DISCOUNT_PCT,
        COUNT(DISTINCT CASE WHEN COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_RAPPI,0) + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MAKERS,0) + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_COMMERCIAL,0) + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_PARTNERS,0) + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_SHRINKAGE,0) + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_BLACKBOX,0) + COALESCE(d.DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MONETIZATION,0) > 0 THEN d.ORDER_ID END) AS ORDERS_WITH_DISCOUNT,
        COUNT(DISTINCT d.WAREHOUSE_ID) AS WAREHOUSES_SOLD
      FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d
      WHERE d.SYNC_PRODUCT_ID IN (${safeSyncIds}) AND d.COUNTRY = 'MX' AND d.CREATED_AT = TO_DATE('${safeDate}') AND d.COUNT_TO_GMV = TRUE
      GROUP BY d.SYNC_PRODUCT_ID
      ORDER BY GMV DESC
    `;

    const rows = await executeQuery(sql);

    // Stock data per product
    const stockSql = `
      SELECT ic.SYNC_PRODUCT_ID,
        SUM(CASE WHEN ic.CREATED_AT = DATEADD(day,-1,TO_DATE('${safeDate}')) THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS OPENING_STOCK,
        SUM(CASE WHEN ic.CREATED_AT = TO_DATE('${safeDate}') THEN ic.SUM_UNITS_CUMULADO ELSE 0 END) AS CLOSING_STOCK,
        COUNT(DISTINCT CASE WHEN ic.CREATED_AT = DATEADD(day,-1,TO_DATE('${safeDate}')) AND ic.SUM_UNITS_CUMULADO > 0 THEN ic.WAREHOUSE_ID END) AS WH_WITH_STOCK
      FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_INVENTORY_COST ic
      JOIN RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_WAREHOUSE_NEW w ON ic.WAREHOUSE_ID = w.WAREHOUSE_ID AND w.COUNTRY = 'MX' AND w.IS_CEDI = FALSE AND w.WAREHOUSE_NAME NOT LIKE '%INACTIVE%'
      WHERE ic.SYNC_PRODUCT_ID IN (${safeSyncIds}) AND ic.COUNTRY = 'MX'
        AND ic.CREATED_AT BETWEEN DATEADD(day,-1,TO_DATE('${safeDate}')) AND TO_DATE('${safeDate}')
      GROUP BY ic.SYNC_PRODUCT_ID
    `;

    const stockRows = await executeQuery(stockSql);
    const stockMap: Record<number, { opening: number; closing: number; whWithStock: number }> = {};
    for (const sr of stockRows as Record<string, unknown>[]) {
      stockMap[Number(sr.SYNC_PRODUCT_ID)] = {
        opening: Number(sr.OPENING_STOCK) || 0,
        closing: Number(sr.CLOSING_STOCK) || 0,
        whWithStock: Number(sr.WH_WITH_STOCK) || 0,
      };
    }

    const products = (rows as Record<string, unknown>[]).map(row => {
      const syncId = Number(row.SYNC_PRODUCT_ID);
      const stock = stockMap[syncId] || { opening: 0, closing: 0, whWithStock: 0 };
      const units = Number(row.UNITS) || 0;
      return {
        syncProductId: syncId,
        name: String(row.PRODUCT_NAME || ''),
        brand: String(row.BRAND || ''),
        category: String(row.CATEGORY || ''),
        gmv: Number(row.GMV) || 0,
        units,
        orders: Number(row.ORDERS) || 0,
        discount: Number(row.DISCOUNT) || 0,
        avgPrice: Number(row.AVG_PRICE) || 0,
        discountPct: Number(row.DISCOUNT_PCT) || 0,
        ordersWithDiscount: Number(row.ORDERS_WITH_DISCOUNT) || 0,
        warehousesSold: Number(row.WAREHOUSES_SOLD) || 0,
        openingStock: stock.opening,
        closingStock: stock.closing,
        whWithStock: stock.whWithStock,
        sellThroughPct: stock.opening > 0 ? (units / stock.opening) * 100 : 0,
      };
    });

    return NextResponse.json({ products });
  } catch (error) {
    console.error('Product analysis error:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
