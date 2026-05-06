/**
 * Export data from Snowflake to JSON for GitHub Pages
 * Usage: npx ts-node --esm scripts/export-data.ts
 * Or: node --loader ts-node/esm scripts/export-data.ts
 */

import { parseCampaigns } from '../src/lib/campaigns.js';
import snowflake from 'snowflake-sdk';
import fs from 'fs';
import path from 'path';

let connection: snowflake.Connection | null = null;

async function connect(): Promise<snowflake.Connection> {
  if (connection) return connection;
  return new Promise((resolve, reject) => {
    const conn = snowflake.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT || 'RAPPIORG-HG51401',
      username: process.env.SNOWFLAKE_USER || 'FELIPE.GUEVARA@RAPPI.COM',
      authenticator: 'EXTERNALBROWSER',
      warehouse: 'RP_PERSONALUSER_WH',
      database: 'RP_SILVER_DB_PROD',
      schema: 'TURBO_CORE',
      role: 'RP_READ_ACCESS_PU_ROLE',
    });
    conn.connect((err, c) => {
      if (err) reject(err);
      else { connection = c; resolve(c); }
    });
  });
}

async function query(sql: string): Promise<Record<string, unknown>[]> {
  const conn = await connect();
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText: sql,
      complete: (err, _stmt, rows) => {
        if (err) reject(err);
        else resolve((rows || []) as Record<string, unknown>[]);
      },
    });
  });
}

async function main() {
  console.log('Connecting to Snowflake (browser auth will open)...');
  const conn = await connect();
  
  // Set warehouse
  await query('USE WAREHOUSE RP_PERSONALUSER_WH');
  console.log('Connected. Fetching data...');

  const campaigns = parseCampaigns();
  const allData: Record<string, unknown> = { generatedAt: new Date().toISOString(), campaigns };

  // Executive data for each campaign
  const campaignResults = [];
  for (const campaign of campaigns) {
    const safeSyncIds = campaign.syncIds.filter(id => Number.isInteger(id)).join(',');
    const safeDate = campaign.fechaInicio.replace(/[^0-9-]/g, '');
    console.log(`  Processing ${campaign.nombre}...`);

    try {
      // Impact
      const impactRows = await query(`
        SELECT SUM(TOTAL_PRICE_WO_IVA) AS GMV, SUM(UNITS) AS UNITS, COUNT(DISTINCT ORDER_ID) AS ORDERS,
          SUM(COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_RAPPI,0)+COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MAKERS,0)+COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_COMMERCIAL,0)+COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_PARTNERS,0)+COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_SHRINKAGE,0)+COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_BLACKBOX,0)+COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MONETIZATION,0)) AS DISCOUNT
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS
        WHERE SYNC_PRODUCT_ID IN (${safeSyncIds}) AND CREATED_AT = TO_DATE('${safeDate}') AND COUNTRY = 'MX' AND COUNT_TO_GMV = TRUE
      `);
      const impact = impactRows[0] || {};

      // Baseline + Post
      const periodRows = await query(`
        SELECT CASE WHEN CREATED_AT BETWEEN DATEADD(day,-14,TO_DATE('${safeDate}')) AND DATEADD(day,-2,TO_DATE('${safeDate}')) THEN 'BASELINE'
          WHEN CREATED_AT BETWEEN DATEADD(day,1,TO_DATE('${safeDate}')) AND DATEADD(day,7,TO_DATE('${safeDate}')) THEN 'POST' END AS P,
          SUM(TOTAL_PRICE_WO_IVA) AS GMV, SUM(UNITS) AS UNITS, COUNT(DISTINCT CREATED_AT) AS DAYS
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS
        WHERE SYNC_PRODUCT_ID IN (${safeSyncIds}) AND COUNTRY = 'MX' AND COUNT_TO_GMV = TRUE
          AND CREATED_AT BETWEEN DATEADD(day,-14,TO_DATE('${safeDate}')) AND DATEADD(day,7,TO_DATE('${safeDate}'))
        GROUP BY 1 HAVING P IS NOT NULL
      `);

      const baseline = periodRows.find(r => r.P === 'BASELINE') as Record<string, number> || {};
      const post = periodRows.find(r => r.P === 'POST') as Record<string, number> || {};

      const baselineAvgGmv = baseline.DAYS ? Number(baseline.GMV) / Number(baseline.DAYS) : 0;
      const postAvgGmv = post.DAYS ? Number(post.GMV) / Number(post.DAYS) : 0;
      const viralGmv = Number(impact.GMV) || 0;
      const discount = Number(impact.DISCOUNT) || 0;

      campaignResults.push({
        name: campaign.nombre,
        date: safeDate,
        gmv: viralGmv,
        units: Number(impact.UNITS) || 0,
        orders: Number(impact.ORDERS) || 0,
        discount,
        roi: discount > 0 ? viralGmv / discount : 0,
        baselineAvgGmv,
        postAvgGmv,
        multiplier: baselineAvgGmv > 0 ? viralGmv / baselineAvgGmv : 0,
        postDeclinePct: baselineAvgGmv > 0 ? ((postAvgGmv - baselineAvgGmv) / baselineAvgGmv) * 100 : 0,
      });
    } catch (err) {
      console.log(`    Error: ${(err as Error).message?.slice(0, 50)}`);
      campaignResults.push({ name: campaign.nombre, date: safeDate, gmv: 0, units: 0, orders: 0, discount: 0, roi: 0, baselineAvgGmv: 0, postAvgGmv: 0, multiplier: 0, postDeclinePct: 0 });
    }
  }

  allData.campaignResults = campaignResults;

  // Program totals
  const totalGmv = campaignResults.reduce((s, c) => s + (c.gmv || 0), 0);
  const totalDiscount = campaignResults.reduce((s, c) => s + (c.discount || 0), 0);
  allData.programKpis = {
    totalCampaigns: campaignResults.length,
    totalGmv,
    totalDiscount,
    avgRoi: totalDiscount > 0 ? totalGmv / totalDiscount : 0,
    avgMultiplier: campaignResults.length > 0 ? campaignResults.reduce((s, c) => s + (c.multiplier || 0), 0) / campaignResults.length : 0,
  };

  // Write JSON
  const outPath = path.join(process.cwd(), 'docs', 'data.json');
  fs.writeFileSync(outPath, JSON.stringify(allData, null, 2));
  console.log(`\nData exported to ${outPath}`);
  console.log(`Campaigns: ${campaignResults.length}`);
  console.log(`Total GMV: $${(totalGmv / 1000000).toFixed(2)}M`);
  
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
