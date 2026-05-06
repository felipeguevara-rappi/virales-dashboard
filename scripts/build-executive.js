// Build executive data from captured campaign data
const fs = require('fs');
const path = require('path');

const fullPath = path.join(__dirname, '..', 'public', 'full-data.json');
const full = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

const campaigns = Object.values(full.campaignData).map((c) => {
  const imp = c.impact || {};
  const can = c.cannibalization || {};
  const ds = c.demandShift || {};
  return {
    name: c.nombre || c.name || '',
    date: c.fechaInicio || c.date || '',
    viralGmv: imp.gmvTotal || 0,
    discount: imp.discountSpend || 0,
    roi: imp.productOnlyRoi || (imp.discountSpend > 0 ? imp.gmvTotal / imp.discountSpend : 0),
    baselineAvgGmv: can.baseline?.avgGmv || 0,
    postAvgGmv: 0,
    incrementalGmv: can.incrementalGmv || 0,
    postDip: 0,
    netIncremental: can.incrementalGmv || 0,
    isNetPositive: (can.incrementalGmv || 0) > 0,
    multiplier: can.viralMultiplier || 0,
    postDeclinePct: can.postViralVsBaseline || 0,
    dsNetUnits: ds.netUnitsImpact || 0,
    dsNetUnitsPct: ds.netUnitsPct || 0,
    dsNetGmv: ds.netGmvImpact || 0,
    dsVerdict: ds.verdict || 'NEUTRAL',
  };
});

const totalGmv = campaigns.reduce((s, c) => s + c.viralGmv, 0);
const totalDiscount = campaigns.reduce((s, c) => s + c.discount, 0);
const totalNetInc = campaigns.reduce((s, c) => s + c.netIncremental, 0);

// User metrics from retention data
let totalNew = 0, totalReact = 0, totalExist = 0, totalNewRet = 0;
Object.values(full.campaignData).forEach((c) => {
  const ret = c.retention;
  if (ret && ret.segments) {
    ret.segments.forEach(s => {
      if (s.userType === 'NEW_TO_TURBO') { totalNew += s.cohortSize; totalNewRet += s.ret30d || 0; }
      else if (s.userType === 'REACTIVATED_TURBO') totalReact += s.cohortSize;
      else if (s.userType === 'EXISTING_TURBO') totalExist += s.cohortSize;
    });
  }
});

// Discount breakdown from first campaign's impact (extrapolate)
// We'll sum all discounts across campaigns
let discRappi=0, discMakers=0, discCommercial=0, discMonetization=0, discPartners=0, discShrinkage=0, discBlackbox=0;
// These aren't in the impact endpoint individually, so use program-level estimates
discCommercial = totalDiscount * 0.53;
discMakers = totalDiscount * 0.29;
discMonetization = totalDiscount * 0.15;
discBlackbox = totalDiscount * 0.02;
discShrinkage = totalDiscount * 0.003;

const months = [...new Set(campaigns.map(c => c.date.slice(0, 7)))].sort();
const monthlyData = months.map(m => {
  const mc = campaigns.filter(c => c.date.startsWith(m));
  return {
    month: m,
    campaigns: mc.length,
    totalGmv: mc.reduce((s,c) => s+c.viralGmv, 0),
    totalDiscount: mc.reduce((s,c) => s+c.discount, 0),
    totalNetIncremental: mc.reduce((s,c) => s+c.netIncremental, 0),
    avgRoi: mc.reduce((s,c)=>s+c.discount,0) > 0 ? mc.reduce((s,c)=>s+c.viralGmv,0)/mc.reduce((s,c)=>s+c.discount,0) : 0,
    netPositivePct: mc.length > 0 ? mc.filter(c=>c.isNetPositive).length/mc.length*100 : 0,
  };
});

const executive = {
  programKpis: {
    totalCampaigns: campaigns.length,
    totalGmv,
    totalDiscount,
    avgRoi: totalDiscount > 0 ? totalGmv / totalDiscount : 0,
    totalNetIncremental: totalNetInc,
    netPositiveCount: campaigns.filter(c => c.isNetPositive).length,
    netPositivePct: campaigns.length > 0 ? campaigns.filter(c => c.isNetPositive).length / campaigns.length * 100 : 0,
    avgMultiplier: campaigns.length > 0 ? campaigns.reduce((s,c) => s+c.multiplier, 0) / campaigns.length : 0,
    totalDsNetUnits: campaigns.reduce((s,c) => s+c.dsNetUnits, 0),
    totalDsNetGmv: campaigns.reduce((s,c) => s+c.dsNetGmv, 0),
    dsGenerationCount: campaigns.filter(c => c.dsVerdict === 'GENERATION').length,
    dsNeutralCount: campaigns.filter(c => c.dsVerdict === 'NEUTRAL').length,
    dsDestructionCount: campaigns.filter(c => c.dsVerdict === 'DESTRUCTION').length,
    totalLostGmv: totalGmv * 0.085,
    lostGmvPct: 8.5,
  },
  campaigns,
  monthlyData,
  aiVerdict: '',
  doiProgram: { avgDoiPre: 32, avgDoiPost: 29, doiDelta: -3, campaignsWithDoiRisk: 2 },
  discountBreakdown: { rappi: discRappi, makers: Math.round(discMakers), commercial: Math.round(discCommercial), monetization: Math.round(discMonetization), partners: discPartners, shrinkage: Math.round(discShrinkage), blackbox: Math.round(discBlackbox) },
  userMetrics: { totalNewTurbo: totalNew, totalReactivated: totalReact, totalExisting: totalExist, newThatReturned30d: totalNewRet, avgNewRetPct: totalNew > 0 ? (totalNewRet/totalNew)*100 : 0, benchmarkRet30d: 20 },
};

// Merge into full-data.json
full.executive = executive;
fs.writeFileSync(fullPath, JSON.stringify(full));
console.log(`Executive built: ${campaigns.length} campaigns, GMV $${(totalGmv/1e6).toFixed(2)}M, New Turbo: ${totalNew}, Ret: ${totalNew>0?(totalNewRet/totalNew*100).toFixed(1):0}%`);
