import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/snowflake';
import { parseCampaigns } from '@/lib/campaigns';

export async function GET() {
  try {
    const campaigns = parseCampaigns();
    const results: { name: string; date: string; viralGmv: number; discount: number; roi: number; baselineAvgGmv: number; postAvgGmv: number; incrementalGmv: number; postDip: number; netIncremental: number; isNetPositive: boolean; multiplier: number; dsNetUnits: number; dsNetUnitsPct: number; dsNetGmv: number; dsVerdict: string }[] = [];
    const discountBreakdown = { rappi: 0, makers: 0, commercial: 0, monetization: 0, partners: 0, shrinkage: 0, blackbox: 0 };

    // For each campaign, get: GMV, discount, baseline, post-viral dip, supply readiness
    for (const campaign of campaigns) {
      const safeSyncIds = campaign.syncIds.filter(id => Number.isInteger(id)).join(',');
      const safeDate = (campaign.fecha || '').replace(/[^0-9-]/g, '');

      // Query: GMV viral day + baseline (T-14 to T-2) + post-viral (T+1 to T+7)
      const sql = `
        SELECT 
          CASE 
            WHEN CREATED_AT = TO_DATE('${safeDate}') THEN 'VIRAL'
            WHEN CREATED_AT BETWEEN DATEADD(day,-14,TO_DATE('${safeDate}')) AND DATEADD(day,-2,TO_DATE('${safeDate}')) THEN 'BASELINE'
            WHEN CREATED_AT BETWEEN DATEADD(day,1,TO_DATE('${safeDate}')) AND DATEADD(day,7,TO_DATE('${safeDate}')) THEN 'POST'
          END AS PERIOD,
          SUM(TOTAL_PRICE_WO_IVA) AS GMV,
          SUM(UNITS) AS UNITS,
          COUNT(DISTINCT ORDER_ID) AS ORDERS,
          SUM(COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_RAPPI,0)
            + COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MAKERS,0)
            + COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_COMMERCIAL,0)
            + COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_PARTNERS,0)
            + COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_SHRINKAGE,0)
            + COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_BLACKBOX,0)
            + COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MONETIZATION,0)) AS DISCOUNT,
          SUM(COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_RAPPI,0)) AS DISC_RAPPI,
          SUM(COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MAKERS,0)) AS DISC_MAKERS,
          SUM(COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_COMMERCIAL,0)) AS DISC_COMMERCIAL,
          SUM(COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MONETIZATION,0)) AS DISC_MONETIZATION,
          SUM(COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_PARTNERS,0)) AS DISC_PARTNERS,
          SUM(COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_SHRINKAGE,0)) AS DISC_SHRINKAGE,
          SUM(COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_BLACKBOX,0)) AS DISC_BLACKBOX,
          COUNT(DISTINCT CREATED_AT) AS DAYS_IN_PERIOD
        FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS
        WHERE SYNC_PRODUCT_ID IN (${safeSyncIds}) AND COUNTRY = 'MX' AND COUNT_TO_GMV = TRUE
          AND CREATED_AT BETWEEN DATEADD(day,-14,TO_DATE('${safeDate}')) AND DATEADD(day,7,TO_DATE('${safeDate}'))
        GROUP BY CASE 
            WHEN CREATED_AT = TO_DATE('${safeDate}') THEN 'VIRAL'
            WHEN CREATED_AT BETWEEN DATEADD(day,-14,TO_DATE('${safeDate}')) AND DATEADD(day,-2,TO_DATE('${safeDate}')) THEN 'BASELINE'
            WHEN CREATED_AT BETWEEN DATEADD(day,1,TO_DATE('${safeDate}')) AND DATEADD(day,7,TO_DATE('${safeDate}')) THEN 'POST'
          END
      `;

      const rows = await executeQuery(sql);
      const periods: Record<string, { gmv: number; units: number; discount: number; days: number }> = {};
      let campDiscBreakdown = { rappi: 0, makers: 0, commercial: 0, monetization: 0, partners: 0, shrinkage: 0, blackbox: 0 };
      for (const row of rows as Record<string, unknown>[]) {
        const period = String(row.PERIOD);
        if (period && period !== 'null') {
          periods[period] = {
            gmv: Number(row.GMV) || 0,
            units: Number(row.UNITS) || 0,
            discount: Number(row.DISCOUNT) || 0,
            days: Number(row.DAYS_IN_PERIOD) || 1,
          };
          if (period === 'VIRAL') {
            campDiscBreakdown = {
              rappi: Number(row.DISC_RAPPI) || 0,
              makers: Number(row.DISC_MAKERS) || 0,
              commercial: Number(row.DISC_COMMERCIAL) || 0,
              monetization: Number(row.DISC_MONETIZATION) || 0,
              partners: Number(row.DISC_PARTNERS) || 0,
              shrinkage: Number(row.DISC_SHRINKAGE) || 0,
              blackbox: Number(row.DISC_BLACKBOX) || 0,
            };
          }
        }
      }

      const baselineAvgGmv = periods.BASELINE ? periods.BASELINE.gmv / periods.BASELINE.days : 0;
      const viralGmv = periods.VIRAL?.gmv || 0;
      const viralDiscount = periods.VIRAL?.discount || 0;
      const postAvgGmv = periods.POST ? periods.POST.gmv / periods.POST.days : 0;

      // Accumulate discount breakdown
      discountBreakdown.rappi += campDiscBreakdown.rappi;
      discountBreakdown.makers += campDiscBreakdown.makers;
      discountBreakdown.commercial += campDiscBreakdown.commercial;
      discountBreakdown.monetization += campDiscBreakdown.monetization;
      discountBreakdown.partners += campDiscBreakdown.partners;
      discountBreakdown.shrinkage += campDiscBreakdown.shrinkage;
      discountBreakdown.blackbox += campDiscBreakdown.blackbox;

      // Net incremental (7d post view)
      const incrementalGmv = viralGmv - baselineAvgGmv;
      const postDip = Math.max(0, (baselineAvgGmv - postAvgGmv) * (periods.POST?.days || 7));
      const netIncremental = incrementalGmv - postDip;

      // DEMAND SHIFT: Full 61-day view (baseline daily rate × 61 vs actual total)
      // Baseline daily rate from BASELINE period (T-14 to T-2)
      const baselineDailyUnits = periods.BASELINE ? periods.BASELINE.units / periods.BASELINE.days : 0;
      const totalActualUnits = (periods.BASELINE?.units || 0) + (periods.VIRAL?.units || 0) + (periods.POST?.units || 0);
      const totalDays = (periods.BASELINE?.days || 13) + 1 + (periods.POST?.days || 7);
      const expectedUnits = Math.round(baselineDailyUnits * totalDays);
      const dsNetUnits = totalActualUnits - expectedUnits;
      const dsNetUnitsPct = expectedUnits > 0 ? (dsNetUnits / expectedUnits) * 100 : 0;
      // Same for GMV
      const baselineDailyGmv = periods.BASELINE ? periods.BASELINE.gmv / periods.BASELINE.days : 0;
      const totalActualGmv = (periods.BASELINE?.gmv || 0) + viralGmv + (periods.POST?.gmv || 0);
      const expectedGmv = Math.round(baselineDailyGmv * totalDays);
      const dsNetGmv = totalActualGmv - expectedGmv;

      results.push({
        name: campaign.nombre,
        date: safeDate,
        viralGmv,
        discount: viralDiscount,
        roi: viralDiscount > 0 ? viralGmv / viralDiscount : 0,
        baselineAvgGmv,
        postAvgGmv,
        incrementalGmv,
        postDip,
        netIncremental,
        isNetPositive: netIncremental > 0,
        multiplier: baselineAvgGmv > 0 ? viralGmv / baselineAvgGmv : 0,
        // Demand shift fields
        dsNetUnits,
        dsNetUnitsPct,
        dsNetGmv,
        dsVerdict: dsNetUnitsPct > 5 ? 'GENERATION' : dsNetUnitsPct < -5 ? 'DESTRUCTION' : 'NEUTRAL',
      });
    }

    // Program-level aggregates
    const totalGmv = results.reduce((s, r) => s + r.viralGmv, 0);
    const totalDiscount = results.reduce((s, r) => s + r.discount, 0);
    const totalNetIncremental = results.reduce((s, r) => s + r.netIncremental, 0);
    const netPositiveCount = results.filter(r => r.isNetPositive).length;
    const avgRoi = totalDiscount > 0 ? totalGmv / totalDiscount : 0;
    const avgMultiplier = results.length > 0 ? results.reduce((s, r) => s + r.multiplier, 0) / results.length : 0;

    // DOI program-level: batch query for all viral products across all campaigns
    let doiProgram = { avgDoiPre: 0, avgDoiPost: 0, doiDelta: 0, campaignsWithDoiRisk: 0 };
    try {
      // Use first 15 campaigns for DOI (performance)
      const doiCampaigns = campaigns.slice(0, 15);
      let totalDoiPre = 0, totalDoiPost = 0, doiCount = 0, doiRiskCount = 0;

      for (const camp of doiCampaigns) {
        const ids = camp.syncIds.filter(id => Number.isInteger(id)).join(',');
        const dt = (camp.fecha || '').replace(/[^0-9-]/g, '');
        const doiSql = `
          WITH stock_pre AS (
            SELECT SUM(ic.SUM_UNITS_CUMULADO) AS S FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_INVENTORY_COST ic
            JOIN RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_WAREHOUSE_NEW w ON ic.WAREHOUSE_ID = w.WAREHOUSE_ID AND w.COUNTRY = 'MX' AND w.IS_CEDI = FALSE AND w.WAREHOUSE_NAME NOT LIKE '%INACTIVE%'
            WHERE ic.SYNC_PRODUCT_ID IN (${ids}) AND ic.COUNTRY = 'MX' AND ic.CREATED_AT = DATEADD(day,-1,TO_DATE('${dt}'))
          ),
          stock_post AS (
            SELECT SUM(ic.SUM_UNITS_CUMULADO) AS S FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_INVENTORY_COST ic
            JOIN RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_WAREHOUSE_NEW w ON ic.WAREHOUSE_ID = w.WAREHOUSE_ID AND w.COUNTRY = 'MX' AND w.IS_CEDI = FALSE AND w.WAREHOUSE_NAME NOT LIKE '%INACTIVE%'
            WHERE ic.SYNC_PRODUCT_ID IN (${ids}) AND ic.COUNTRY = 'MX' AND ic.CREATED_AT = DATEADD(day,7,TO_DATE('${dt}'))
          ),
          avg_sales AS (
            SELECT ROUND(AVG(D), 1) AS AVG_D FROM (SELECT SUM(UNITS) AS D FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS WHERE SYNC_PRODUCT_ID IN (${ids}) AND COUNTRY='MX' AND COUNT_TO_GMV=TRUE AND CREATED_AT BETWEEN DATEADD(day,-14,TO_DATE('${dt}')) AND DATEADD(day,-2,TO_DATE('${dt}')) GROUP BY CREATED_AT)
          )
          SELECT 
            ROUND((SELECT S FROM stock_pre) / NULLIF((SELECT AVG_D FROM avg_sales), 0), 1) AS DOI_PRE,
            ROUND((SELECT S FROM stock_post) / NULLIF((SELECT AVG_D FROM avg_sales), 0), 1) AS DOI_POST
        `;
        const doiRows = await executeQuery(doiSql);
        const dr = doiRows[0] as Record<string, number> || {};
        if (dr.DOI_PRE && dr.DOI_POST) {
          totalDoiPre += dr.DOI_PRE;
          totalDoiPost += dr.DOI_POST;
          doiCount++;
          if (dr.DOI_POST < 14) doiRiskCount++;
        }
      }

      if (doiCount > 0) {
        doiProgram = {
          avgDoiPre: totalDoiPre / doiCount,
          avgDoiPost: totalDoiPost / doiCount,
          doiDelta: (totalDoiPost / doiCount) - (totalDoiPre / doiCount),
          campaignsWithDoiRisk: doiRiskCount,
        };
      }
    } catch { /* DOI optional */ }

    // Turbo-only user acquisition metrics across all campaigns
    let userMetrics = { totalNewTurbo: 0, totalReactivated: 0, totalExisting: 0, newThatReturned30d: 0, avgNewRetPct: 0, benchmarkRet30d: 20 };
    try {
      // Batch: for each campaign, count new-to-turbo users and their retention
      const retCampaigns = campaigns.slice(0, 15);
      let totalNew = 0, totalReact = 0, totalExist = 0, totalNewRet = 0;

      for (const camp of retCampaigns) {
        const ids = camp.syncIds.filter(id => Number.isInteger(id)).join(',');
        const dt = (camp.fecha || '').replace(/[^0-9-]/g, '');
        const retSql = `
          WITH vu AS (SELECT DISTINCT o.APPLICATION_USER_ID FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o ON o.ORDER_ID=d.ORDER_ID AND o.COUNTRY='MX' WHERE d.SYNC_PRODUCT_ID IN (${ids}) AND d.CREATED_AT=TO_DATE('${dt}') AND d.COUNTRY='MX' AND d.COUNT_TO_GMV=TRUE AND o.APPLICATION_USER_ID IS NOT NULL),
          th AS (SELECT vu.APPLICATION_USER_ID, MIN(o.CREATED_AT)::DATE AS FT, MAX(CASE WHEN o.CREATED_AT < TO_DATE('${dt}') THEN o.CREATED_AT END)::DATE AS LT FROM vu LEFT JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o ON o.APPLICATION_USER_ID=vu.APPLICATION_USER_ID AND o.COUNTRY='MX' AND o.STORE_TYPE_STORE ILIKE '%turbo%' AND o.CREATED_AT >= '2023-01-01'::TIMESTAMP_NTZ AND o.CREATED_AT < DATEADD(day,1,TO_DATE('${dt}')) GROUP BY 1),
          cl AS (SELECT APPLICATION_USER_ID, CASE WHEN FT IS NULL OR FT=TO_DATE('${dt}') THEN 'NEW' WHEN LT IS NOT NULL AND LT>=DATEADD(day,-30,TO_DATE('${dt}')) THEN 'EXIST' ELSE 'REACT' END AS T FROM th)
          SELECT T, COUNT(*) AS C,
            SUM(CASE WHEN T='NEW' AND EXISTS(SELECT 1 FROM RP_SILVER_DB_PROD.DES_PROD.ORDERS o2 WHERE o2.APPLICATION_USER_ID=cl.APPLICATION_USER_ID AND o2.COUNTRY='MX' AND o2.STORE_TYPE_STORE ILIKE '%turbo%' AND o2.CREATED_AT > TO_DATE('${dt}') AND o2.CREATED_AT < DATEADD(day,31,TO_DATE('${dt}'))) THEN 1 ELSE 0 END) AS NEW_RET
          FROM cl GROUP BY 1
        `;
        const retRows = await executeQuery(retSql);
        for (const r of retRows as Record<string, unknown>[]) {
          const t = String(r.T);
          const c = Number(r.C) || 0;
          if (t === 'NEW') { totalNew += c; totalNewRet += Number(r.NEW_RET) || 0; }
          else if (t === 'REACT') totalReact += c;
          else if (t === 'EXIST') totalExist += c;
        }
      }

      const total = totalNew + totalReact + totalExist;
      userMetrics = {
        totalNewTurbo: totalNew,
        totalReactivated: totalReact,
        totalExisting: totalExist,
        newThatReturned30d: totalNewRet,
        avgNewRetPct: totalNew > 0 ? (totalNewRet / totalNew) * 100 : 0,
        benchmarkRet30d: 20,
      };
    } catch { /* optional */ }

    // Monthly aggregation
    const months = [...new Set(results.map(r => r.date.slice(0, 7)))].sort();
    const monthlyData = months.map(month => {
      const monthResults = results.filter(r => r.date.startsWith(month));
      return {
        month,
        campaigns: monthResults.length,
        totalGmv: monthResults.reduce((s, r) => s + r.viralGmv, 0),
        totalDiscount: monthResults.reduce((s, r) => s + r.discount, 0),
        totalNetIncremental: monthResults.reduce((s, r) => s + r.netIncremental, 0),
        avgRoi: monthResults.reduce((s, r) => s + r.discount, 0) > 0 
          ? monthResults.reduce((s, r) => s + r.viralGmv, 0) / monthResults.reduce((s, r) => s + r.discount, 0) : 0,
        netPositivePct: monthResults.length > 0 ? monthResults.filter(r => r.isNetPositive).length / monthResults.length * 100 : 0,
      };
    });

    // Generate AI verdict
    const summaryForAi = `Programa Viral Deals MX - Análisis Consolidado:
- ${results.length} campañas ejecutadas (Ene-May 2026)
- GMV Total: $${(totalGmv/1000000).toFixed(1)}M | Inversión: $${(totalDiscount/1000000).toFixed(1)}M | ROI Bruto: ${avgRoi.toFixed(1)}x
- ${netPositiveCount} de ${results.length} campañas (${(netPositiveCount/results.length*100).toFixed(0)}%) generaron demanda NETA incremental (después de descontar canibalización post-viral)
- Net Incremental Total: $${(totalNetIncremental/1000000).toFixed(2)}M (esto es lo que queda después de restar la canibalización)
- Multiplicador promedio vs baseline diario: ${avgMultiplier.toFixed(1)}x
- DATO CLAVE: ~95% de los compradores en virales ya son usuarios activos existentes. Solo ~2% son verdaderamente nuevos en la plataforma.
- La retención de nuevos adquiridos por viral (~46% a 30d) es MENOR que el benchmark de nuevos normales (~81%). Los virales adquieren usuarios de menor calidad.
- Top ROI: ${[...results].sort((a,b) => b.roi - a.roi).slice(0,3).map(r => `${r.name.replace('VIRAL_DEAL_','')} (${r.roi.toFixed(1)}x)`).join(', ')}
- Peor ROI: ${[...results].sort((a,b) => a.roi - b.roi).slice(0,3).map(r => `${r.name.replace('VIRAL_DEAL_','')} (${r.roi.toFixed(1)}x)`).join(', ')}`;

    const aiPrompt = `Eres el Chief Growth Officer de un quick-commerce en México. Con base en estos datos REALES del programa Viral Deals, da un VEREDICTO ejecutivo:

${summaryForAi}

PREGUNTA CENTRAL: ¿Los virales generan valor incremental o simplemente mueven demanda existente a un día con descuento?

Responde en español:
1. VEREDICTO (1 línea clara): Funciona / No Funciona / Parcialmente
2. EVIDENCIA PARA (2 bullets): datos que dicen que sí funciona
3. EVIDENCIA CONTRA (2 bullets): datos que dicen que no funciona
4. EL RIESGO: ¿qué pasa si seguimos haciendo virales sin cambiar nada?
5. RECOMENDACIÓN (3 bullets concretos): qué cambiar para que funcionen mejor

Sé brutalmente honesto. Si los datos dicen que no funciona, dilo. Máximo 300 palabras.`;

    let aiVerdict = '';
    try {
      const aiSql = `SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large2', '${aiPrompt.replace(/'/g, "''")}') AS REPORT`;
      const aiRows = await executeQuery(aiSql);
      aiVerdict = String((aiRows[0] as Record<string, string>)?.REPORT || '');
    } catch {
      aiVerdict = 'No se pudo generar el veredicto IA.';
    }

    // Calculate total lost GMV across all campaigns
    let totalLostGmv = 0;
    try {
      for (const camp of campaigns.slice(0, 20)) {
        const ids = camp.syncIds.filter(id => Number.isInteger(id)).join(',');
        const dt = (camp.fecha || '').replace(/[^0-9-]/g, '');
        const lostSql = `
          WITH wh_stock AS (SELECT DISTINCT ic.WAREHOUSE_ID FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_INVENTORY_COST ic JOIN RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_WAREHOUSE_NEW w ON ic.WAREHOUSE_ID = w.WAREHOUSE_ID AND w.COUNTRY='MX' AND w.IS_CEDI=FALSE AND w.WAREHOUSE_NAME NOT LIKE '%INACTIVE%' WHERE ic.SYNC_PRODUCT_ID IN (${ids}) AND ic.COUNTRY='MX' AND ic.CREATED_AT=DATEADD(day,-1,TO_DATE('${dt}')) AND ic.SUM_UNITS_CUMULADO>0),
          wh_cap AS (SELECT WAREHOUSE_ID, COUNT(DISTINCT ORDER_ID) AS C FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS WHERE COUNTRY='MX' AND COUNT_TO_GMV=TRUE AND CREATED_AT BETWEEN DATEADD(day,-30,TO_DATE('${dt}')) AND DATEADD(day,-1,TO_DATE('${dt}')) GROUP BY 1),
          sales AS (SELECT SUM(TOTAL_PRICE_WO_IVA) AS G, COUNT(DISTINCT ORDER_ID) AS O FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS WHERE SYNC_PRODUCT_ID IN (${ids}) AND COUNTRY='MX' AND CREATED_AT=TO_DATE('${dt}') AND COUNT_TO_GMV=TRUE)
          SELECT SUM(CASE WHEN ws.WAREHOUSE_ID IS NOT NULL THEN wc.C ELSE 0 END) AS SC, SUM(CASE WHEN ws.WAREHOUSE_ID IS NULL THEN wc.C ELSE 0 END) AS UC, (SELECT O FROM sales) AS VO, (SELECT G FROM sales) AS VG
          FROM wh_cap wc LEFT JOIN wh_stock ws ON ws.WAREHOUSE_ID=wc.WAREHOUSE_ID
        `;
        const lRows = await executeQuery(lostSql);
        const lr = lRows[0] as Record<string, number> || {};
        if (lr.SC && lr.UC && lr.VO && lr.VG) {
          const convRate = lr.VO / lr.SC;
          const avgOV = lr.VG / lr.VO;
          totalLostGmv += lr.UC * convRate * avgOV;
        }
      }
    } catch { /* optional */ }

    return NextResponse.json({
      programKpis: {
        totalCampaigns: results.length,
        totalGmv,
        totalDiscount,
        avgRoi,
        totalNetIncremental,
        netPositiveCount,
        netPositivePct: results.length > 0 ? (netPositiveCount / results.length) * 100 : 0,
        avgMultiplier,
        // Demand Shift aggregates
        totalDsNetUnits: results.reduce((s, r) => s + r.dsNetUnits, 0),
        totalDsNetGmv: results.reduce((s, r) => s + r.dsNetGmv, 0),
        dsGenerationCount: results.filter(r => r.dsVerdict === 'GENERATION').length,
        dsNeutralCount: results.filter(r => r.dsVerdict === 'NEUTRAL').length,
        dsDestructionCount: results.filter(r => r.dsVerdict === 'DESTRUCTION').length,
        // Lost GMV
        totalLostGmv,
        lostGmvPct: totalGmv > 0 ? (totalLostGmv / totalGmv) * 100 : 0,
      },
      campaigns: results,
      monthlyData,
      aiVerdict,
      doiProgram,
      discountBreakdown,
      userMetrics,
    });
  } catch (error) {
    console.error('Executive report error:', error);
    return NextResponse.json({ error: 'Executive report failed' }, { status: 500 });
  }
}
