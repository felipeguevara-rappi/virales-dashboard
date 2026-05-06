import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/snowflake';
import { parseCampaigns } from '@/lib/campaigns';

export async function GET() {
  try {
    const campaigns = parseCampaigns();
    const portfolioData: { campaignName: string; date: string; gmv: number; discountInvestment: number; roi: number; orders: number; units: number }[] = [];

    for (const campaign of campaigns) {
      const safeSyncIds = campaign.syncIds.filter(id => Number.isInteger(id)).join(',');
      const safeDate = campaign.fechaInicio.replace(/[^0-9-]/g, '');

      const sql = `
        SELECT
          SUM(TOTAL_PRICE_WO_IVA) AS GMV,
          SUM(UNITS) AS UNITS,
          SUM(COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_RAPPI,0)
            + COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MAKERS,0)
            + COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_COMMERCIAL,0)
            + COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_PARTNERS,0)
            + COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_SHRINKAGE,0)
            + COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_BLACKBOX,0)
            + COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MONETIZATION,0)) AS DISCOUNT_SPEND,
          COUNT(DISTINCT ORDER_ID) AS ORDERS
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS
        WHERE SYNC_PRODUCT_ID IN (${safeSyncIds}) AND CREATED_AT = TO_DATE('${safeDate}') AND COUNTRY = 'MX' AND COUNT_TO_GMV = TRUE
      `;

      const rows = await executeQuery(sql);
      const row = rows[0] as Record<string, number> || {};

      const gmv = row.GMV || 0;
      const discountInvestment = row.DISCOUNT_SPEND || 0;
      const roi = discountInvestment > 0 ? gmv / discountInvestment : 0;

      portfolioData.push({
        campaignName: campaign.nombre,
        date: campaign.fechaInicio,
        gmv,
        discountInvestment,
        roi,
        orders: row.ORDERS || 0,
        units: row.UNITS || 0,
      });
    }

    // Aggregate by month
    const months = [...new Set(campaigns.map(c => c.fechaInicio.slice(0, 7)))].sort();
    const trends = months.map(month => {
      const monthCampaigns = portfolioData.filter(p => p.date.startsWith(month));
      const totalGmv = monthCampaigns.reduce((s, c) => s + c.gmv, 0);
      const totalDiscount = monthCampaigns.reduce((s, c) => s + c.discountInvestment, 0);

      return {
        month,
        totalGmv,
        totalDiscount,
        avgRoi: totalDiscount > 0 ? totalGmv / totalDiscount : 0,
        campaigns: monthCampaigns.length,
      };
    });

    return NextResponse.json({ portfolio: portfolioData, trends });
  } catch (error) {
    console.error('Portfolio query error:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
