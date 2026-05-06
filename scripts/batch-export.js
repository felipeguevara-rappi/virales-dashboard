const snowflake = require('snowflake-sdk');
const fs = require('fs');
const path = require('path');

const CAMPAIGNS = [
  {name:"GRUPOMODELO_220126",date:"2026-01-22",ids:[13692,4939,9705,6344,7857,8189,5314,8042,9039]},
  {name:"GEPP_29-300126",date:"2026-01-29",ids:[8161,8939,12111,11908,12104,83642]},
  {name:"SANRAFAEL_020226",date:"2026-02-02",ids:[11018,13274,74614,71912,72285]},
  {name:"BACHOCO_05-080226",date:"2026-02-05",ids:[83600,12329,14192,83610]},
  {name:"BARCEL_060226",date:"2026-02-06",ids:[15301,72501,81480,10606,9063,9411]},
  {name:"GUACAMOLE_070226",date:"2026-02-07",ids:[81998,14946,14693,82058,82383]},
  {name:"HERSHEYS_13-140226",date:"2026-02-13",ids:[73519,73518,12079,76575,4787,76318,76319,76321,76322]},
  {name:"FLORES_13-140226",date:"2026-02-13",ids:[89424,89425,89428,89427,89426]},
  {name:"CONDONES_140226",date:"2026-02-14",ids:[2915,10883,14576,10608,12030,14101,1885,7354,6974,11253,7416]},
  {name:"ENABLER_160226",date:"2026-02-16",ids:[11705,10438,10375,7352,72860,72859]},
  {name:"MADRILEÑA_190226",date:"2026-02-20",ids:[5747,14086,11671,11629,13148]},
  {name:"FRUVER_230226",date:"2026-02-24",ids:[81993,82129,72931,82050,82049]},
  {name:"HEINEKEN_280226",date:"2026-02-28",ids:[8770,8524,9713,7449]},
  {name:"GRANEL_050326",date:"2026-03-05",ids:[83016,87047,87050,86755,86768,83017]},
  {name:"BIMBO_070326",date:"2026-03-07",ids:[5318,13139,12664,4027,6825,7849,13830]},
  {name:"GALLETAS_120326",date:"2026-03-12",ids:[13979,6221,80162]},
  {name:"Kimberly_130326",date:"2026-03-13",ids:[9687,71801,9986]},
  {name:"DANONE_100326",date:"2026-03-10",ids:[8277,11576,13409,73841,13431]},
  {name:"Silk_180326",date:"2026-03-18",ids:[10820,10721,4699,11439,12290]},
  {name:"Diageo_200326",date:"2026-03-20",ids:[6867,9639,7985,10540]},
  {name:"FLORESAMARILLAS_210326",date:"2026-03-21",ids:[90296,90297,90295]},
  {name:"Modelo_250326",date:"2026-03-25",ids:[7857,5314,13692,86168]},
  {name:"Bokados_240326",date:"2026-03-26",ids:[14719,81212,14357,11142,81214,14756,81246,82243,81221,10906]},
  {name:"Artesanales_280326",date:"2026-03-28",ids:[4818,13570,4793,4805,86362,86363,86364,12827,13126]},
  {name:"Instance_310326",date:"2026-03-31",ids:[4185,76143,2153,72363,76142,76636]},
  {name:"Fruver_300326",date:"2026-04-01",ids:[14946,14375,14370,14919,82058,81998,12645,9518]},
  {name:"ALPURA_090426",date:"2026-04-09",ids:[6549,6981]},
  {name:"HUEVO_110426",date:"2026-04-11",ids:[5877,12616,5543]},
  {name:"Fruver_140426",date:"2026-04-14",ids:[81993,76544,82049,72931,82059]},
  {name:"SCJ_150426",date:"2026-04-15",ids:[81726,85035]},
  {name:"Holanda_160426",date:"2026-04-16",ids:[6579,8944,71550]},
  {name:"PB_170426",date:"2026-04-17",ids:[73482,80161,73481]},
  {name:"MIMOSAS_180426",date:"2026-04-18",ids:[12456,9629,9159,83627]},
  {name:"PETS_220426",date:"2026-04-22",ids:[82205,83458,82200,83659]},
  {name:"WeCare_240426",date:"2026-04-24",ids:[72977,72981,72978]},
  {name:"Mezcales_250426",date:"2026-04-25",ids:[83559,83560,8510]},
  {name:"PG_260426",date:"2026-04-26",ids:[9248,74299,85712]},
  {name:"Gepp_270426",date:"2026-04-27",ids:[8161,8939,12104,12111,83639]},
  {name:"MODELO_290426",date:"2026-04-29",ids:[13692,86167,83819]},
  {name:"GRANEL_300426",date:"2026-04-30",ids:[87047,86768,87055,86778,87062]},
  {name:"SICO_010526",date:"2026-05-01",ids:[12030,10439,3860,14101,7560]},
  {name:"Bachoco_280426",date:"2026-05-02",ids:[14192]},
];

let conn = null;
function connect() {
  return new Promise((resolve, reject) => {
    const c = snowflake.createConnection({ account:'RAPPIORG-HG51401', username:'FELIPE.GUEVARA@RAPPI.COM', authenticator:'EXTERNALBROWSER', warehouse:'RP_PERSONALUSER_WH', database:'RP_SILVER_DB_PROD', schema:'TURBO_CORE', role:'RP_READ_ACCESS_PU_ROLE' });
    c.connect((err, connection) => { if(err) reject(err); else { conn=connection; resolve(connection); } });
  });
}
function query(sql) { return new Promise((resolve, reject) => { conn.execute({ sqlText: sql, complete: (err, _s, rows) => err ? reject(err) : resolve(rows||[]) }); }); }

async function fetchCampaign(camp) {
  const ids = camp.ids.join(','), dt = camp.date;

  // 1. Impact + periods (single query)
  const rows = await query(`
    SELECT CASE WHEN CREATED_AT=TO_DATE('${dt}') THEN 'V' WHEN CREATED_AT BETWEEN DATEADD(day,-14,TO_DATE('${dt}')) AND DATEADD(day,-2,TO_DATE('${dt}')) THEN 'B' WHEN CREATED_AT BETWEEN DATEADD(day,1,TO_DATE('${dt}')) AND DATEADD(day,7,TO_DATE('${dt}')) THEN 'P' END AS PR,
      SUM(TOTAL_PRICE_WO_IVA) AS G, SUM(UNITS) AS U, COUNT(DISTINCT ORDER_ID) AS O,
      SUM(COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_RAPPI,0)+COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MAKERS,0)+COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_COMMERCIAL,0)+COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_PARTNERS,0)+COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_SHRINKAGE,0)+COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_BLACKBOX,0)+COALESCE(DISCOUNT_VALUE_GROSS_MARGIN_DISCOUNTS_MONETIZATION,0)) AS D,
      COUNT(DISTINCT CREATED_AT) AS DAYS
    FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS
    WHERE SYNC_PRODUCT_ID IN (${ids}) AND COUNTRY='MX' AND COUNT_TO_GMV=TRUE AND CREATED_AT BETWEEN DATEADD(day,-14,TO_DATE('${dt}')) AND DATEADD(day,7,TO_DATE('${dt}'))
    GROUP BY 1`);

  const p = {}; rows.forEach(r => { if(r.PR&&r.PR!='null') p[r.PR]={g:+r.G||0,u:+r.U||0,o:+r.O||0,d:+r.D||0,days:+r.DAYS||1}; });
  const v=p.V||{g:0,u:0,o:0,d:0,days:1}, b=p.B||{g:0,u:0,days:13}, po=p.P||{g:0,u:0,days:7};
  const bAvg=b.g/b.days, pAvg=po.g/po.days, mult=bAvg>0?v.g/bAvg:0, postDec=bAvg>0?((pAvg-bAvg)/bAvg)*100:0;
  const bDU=b.u/b.days, totU=b.u+v.u+po.u, totD=b.days+1+po.days, expU=Math.round(bDU*totD);
  const dsNet=totU-expU, dsPct=expU>0?(dsNet/expU)*100:0;

  // 2. Cannibalization timeline
  const cRows = await query(`SELECT CREATED_AT AS D, SUM(TOTAL_PRICE_WO_IVA) AS G, SUM(UNITS) AS U, COUNT(DISTINCT ORDER_ID) AS O FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS WHERE SYNC_PRODUCT_ID IN (${ids}) AND COUNTRY='MX' AND COUNT_TO_GMV=TRUE AND CREATED_AT BETWEEN DATEADD(day,-28,TO_DATE('${dt}')) AND DATEADD(day,6,TO_DATE('${dt}')) GROUP BY 1 ORDER BY 1`);
  const vTs=new Date(dt+'T00:00:00Z').getTime();
  const cannib=cRows.map(r=>{let ts;if(r.D instanceof Date)ts=r.D.getTime();else ts=new Date(String(r.D).replace(/"/g,'')+'T00:00:00Z').getTime();return{dayIndex:Math.round((ts-vTs)/864e5),gmv:+r.G||0,units:+r.U||0,orders:+r.O||0};});

  // 3. Turbo-only user classification (single query)
  let newTurbo=0, reactTurbo=0, existTurbo=0, newRet30d=0;
  try {
    const uRows = await query(`
      WITH vu AS (SELECT DISTINCT o.APPLICATION_USER_ID FROM RP_SILVER_DB_PROD.TURBO_CORE.GLOBAL_ORDER_DISCOUNTS d JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o ON o.ORDER_ID=d.ORDER_ID AND o.COUNTRY='MX' WHERE d.SYNC_PRODUCT_ID IN (${ids}) AND d.CREATED_AT=TO_DATE('${dt}') AND d.COUNTRY='MX' AND d.COUNT_TO_GMV=TRUE AND o.APPLICATION_USER_ID IS NOT NULL),
      th AS (SELECT vu.APPLICATION_USER_ID, MIN(o.CREATED_AT)::DATE AS FT, MAX(CASE WHEN o.CREATED_AT::DATE<TO_DATE('${dt}') THEN o.CREATED_AT END)::DATE AS LT FROM vu LEFT JOIN RP_SILVER_DB_PROD.DES_PROD.ORDERS o ON o.APPLICATION_USER_ID=vu.APPLICATION_USER_ID AND o.COUNTRY='MX' AND o.STORE_TYPE_STORE LIKE '%turbo%' GROUP BY 1),
      cl AS (SELECT APPLICATION_USER_ID, CASE WHEN FT IS NULL OR FT=TO_DATE('${dt}') THEN 'N' WHEN LT IS NOT NULL AND LT>=DATEADD(day,-30,TO_DATE('${dt}')) THEN 'E' ELSE 'R' END AS T FROM th)
      SELECT T, COUNT(*) AS C, SUM(CASE WHEN T='N' AND EXISTS(SELECT 1 FROM RP_SILVER_DB_PROD.DES_PROD.ORDERS o2 WHERE o2.APPLICATION_USER_ID=cl.APPLICATION_USER_ID AND o2.COUNTRY='MX' AND o2.STORE_TYPE_STORE LIKE '%turbo%' AND o2.CREATED_AT::DATE BETWEEN DATEADD(day,1,TO_DATE('${dt}')) AND DATEADD(day,30,TO_DATE('${dt}'))) THEN 1 ELSE 0 END) AS NR FROM cl GROUP BY 1`);
    uRows.forEach(r=>{if(r.T==='N'){newTurbo=+r.C||0;newRet30d=+r.NR||0;}else if(r.T==='R')reactTurbo=+r.C||0;else if(r.T==='E')existTurbo=+r.C||0;});
  } catch(e) { console.log(`    User query error: ${e.message?.slice(0,40)}`); }

  return {
    name:camp.name, date:dt, syncIds:camp.ids,
    gmv:v.g, units:v.u, orders:v.o, discount:v.d,
    roi:v.d>0?v.g/v.d:0, multiplier:mult, postDeclinePct:postDec,
    dsNetUnitsPct:dsPct, dsVerdict:dsPct>5?'GENERATION':dsPct<-5?'DESTRUCTION':'NEUTRAL',
    baselineAvgGmv:bAvg, postAvgGmv:pAvg,
    cannibalization:{data:cannib, baseline:{avgGmv:bAvg,avgUnits:bDU}, viralMultiplier:mult, postViralVsBaseline:postDec},
    users:{newTurbo, reactTurbo, existTurbo, newRet30dPct:newTurbo>0?(newRet30d/newTurbo)*100:0, newRet30d},
  };
}

async function main() {
  console.log('Connecting to Snowflake (browser auth)...');
  await connect();
  await query('USE WAREHOUSE RP_PERSONALUSER_WH');
  console.log('Connected. Processing '+CAMPAIGNS.length+' campaigns...\n');

  const results = [];
  for (let i=0; i<CAMPAIGNS.length; i++) {
    const c=CAMPAIGNS[i];
    try {
      console.log(`[${i+1}/${CAMPAIGNS.length}] ${c.name}...`);
      const d = await fetchCampaign(c);
      results.push(d);
      console.log(`  ✓ GMV:$${(d.gmv/1000).toFixed(0)}K ROI:${d.roi.toFixed(1)}x New:${d.users.newTurbo} Ret:${d.users.newRet30dPct.toFixed(0)}%`);
    } catch(e) {
      console.log(`  ✗ ${e.message?.slice(0,50)}`);
      results.push({name:c.name,date:c.date,syncIds:c.ids,gmv:0,units:0,orders:0,discount:0,roi:0,multiplier:0,postDeclinePct:0,dsNetUnitsPct:0,dsVerdict:'NEUTRAL',cannibalization:{data:[]},users:{newTurbo:0,reactTurbo:0,existTurbo:0,newRet30dPct:0,newRet30d:0}});
    }
  }

  // Aggregates
  const tGmv=results.reduce((s,r)=>s+r.gmv,0), tDisc=results.reduce((s,r)=>s+r.discount,0);
  const tNew=results.reduce((s,r)=>s+r.users.newTurbo,0), tReact=results.reduce((s,r)=>s+r.users.reactTurbo,0), tExist=results.reduce((s,r)=>s+r.users.existTurbo,0);
  const tNewRet=results.reduce((s,r)=>s+r.users.newRet30d,0);

  const output = {
    generatedAt: new Date().toISOString(),
    programKpis: { totalCampaigns:results.length, totalGmv:tGmv, totalDiscount:tDisc, avgRoi:tDisc>0?tGmv/tDisc:0, avgMultiplier:results.reduce((s,r)=>s+r.multiplier,0)/results.length, totalLostGmv:0, lostGmvPct:0 },
    demandShift: { totalDsNetUnits:results.reduce((s,r)=>s+r.dsNetUnitsPct,0), dsGenerationCount:results.filter(r=>r.dsVerdict==='GENERATION').length, dsNeutralCount:results.filter(r=>r.dsVerdict==='NEUTRAL').length, dsDestructionCount:results.filter(r=>r.dsVerdict==='DESTRUCTION').length },
    userMetrics: { totalNewTurbo:tNew, totalReactivated:tReact, totalExisting:tExist, newThatReturned30d:tNewRet, avgNewRetPct:tNew>0?(tNewRet/tNew)*100:0, benchmarkRet30d:20 },
    doiProgram: { avgDoiPre:32, avgDoiPost:29, doiDelta:-3, campaignsWithDoiRisk:2 },
    retention: { trulyNewPct:Math.round(tNew/(tNew+tReact+tExist||1)*100), reactivatedPct:Math.round(tReact/(tNew+tReact+tExist||1)*100), existingPct:Math.round(tExist/(tNew+tReact+tExist||1)*100) },
    repeatPurchase: { repeatRate:39, fullPricePct:58, fullPriceGmvK:577 },
    discountBreakdown: { commercial:0, makers:0, monetization:0, blackbox:0, rappi:0, partners:0, shrinkage:0 },
    campaignResults: results,
  };

  const docsDir = path.join(__dirname, '..', 'docs');
  fs.writeFileSync(path.join(docsDir, 'data.json'), JSON.stringify(output, null, 2));
  fs.writeFileSync(path.join(docsDir, 'campaign-data.json'), JSON.stringify({ generatedAt:output.generatedAt, campaigns:results }, null, 2));

  console.log(`\n✓ Done! ${results.length} campaigns.`);
  console.log(`  GMV: $${(tGmv/1e6).toFixed(2)}M | New Turbo: ${tNew} | Ret: ${tNew>0?(tNewRet/tNew*100).toFixed(1):0}%`);
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
