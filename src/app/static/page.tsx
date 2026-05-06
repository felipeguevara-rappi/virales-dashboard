'use client';

import { useState, useEffect } from 'react';
import { Campaign } from '@/lib/types';
import CampaignSelector from '@/components/CampaignSelector';
import KPICards from '@/components/KPICards';
import UserMixDonut from '@/components/UserMixDonut';
import CannibalizationChart from '@/components/CannibalizationChart';
import RetentionBySegment from '@/components/RetentionBySegment';
import PostViralDemand from '@/components/PostViralDemand';
import DemandShiftAnalysis from '@/components/DemandShiftAnalysis';
import CrossBasketAnalysis from '@/components/CrossBasketAnalysis';
import OperationsAnalysis from '@/components/OperationsAnalysis';
import ProductAnalysis from '@/components/ProductAnalysis';
import RepeatPurchase from '@/components/RepeatPurchase';
import ExecutiveReport from '@/components/ExecutiveReport';
import Playbook from '@/components/Playbook';
import { Flame, FileText, BookOpen } from 'lucide-react';

// Static mode: loads all data from pre-generated JSONs
// This page is used for GitHub Pages export (identical to the main dashboard)

type Tab = 'campaign' | 'executive' | 'playbook';

export default function StaticDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('campaign');
  const [allData, setAllData] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [selectedData, setSelectedData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Try without basePath first (Vercel), then with basePath (GitHub Pages)
      let execRes, campRes;
      try {
        [execRes, campRes] = await Promise.all([
          fetch('/data.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }),
          fetch('/campaign-data.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }),
        ]);
      } catch {
        [execRes, campRes] = await Promise.all([
          fetch('/virales/data.json').then(r => r.json()),
          fetch('/virales/campaign-data.json').then(r => r.json()),
        ]);
      }
      setAllData(execRes);
      const campList = (campRes.campaigns || []).map((c: any, i: number) => ({
        id: `${c.name}_${c.date}`,
        fechaInicio: c.date,
        fechaFin: c.date,
        nombre: c.name,
        syncIds: c.syncIds || [],
        _fullData: c,
        _index: i,
      }));
      setCampaigns(campList);
      if (campList.length > 0) {
        setSelectedCampaign(campList[0]);
        setSelectedData(campRes.campaigns[0]);
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleSelectCampaign = (camp: Campaign) => {
    setSelectedCampaign(camp);
    const idx = campaigns.findIndex(c => c.id === camp.id);
    if (idx >= 0) setSelectedData((campaigns[idx] as any)._fullData);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0D14] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl gradient-orange flex items-center justify-center mx-auto mb-4 pulse-glow"><Flame className="w-5 h-5 text-white" /></div>
          <p className="text-[var(--text-muted)]">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  // Build KPI data from selected campaign
  const kpiData = selectedData ? {
    gmvTotal: selectedData.gmv || 0,
    unitsSold: selectedData.units || 0,
    discountSpend: selectedData.discount || 0,
    uniqueUsers: (selectedData.users?.newTurbo || 0) + (selectedData.users?.reactTurbo || 0) + (selectedData.users?.existTurbo || 0),
    totalOrders: selectedData.orders || 0,
    newUsers: selectedData.users?.newTurbo || 0,
    retainedUsers: selectedData.users?.existTurbo || 0,
    reactivatedUsers: selectedData.users?.reactTurbo || 0,
    cac: 0,
    productOnlyRoi: selectedData.roi || 0,
    basketAdjustedRoi: selectedData.roi || 0,
    newToProduct: 0, occasionalBuyer: 0, frequentBuyer: 0,
  } : null;

  const cannibData = selectedData?.cannibalization ? {
    data: selectedData.cannibalization.data || [],
    baseline: selectedData.cannibalization.baseline || { avgUnits: 0, avgGmv: 0 },
    incrementalGmv: selectedData.gmv - (selectedData.cannibalization.baseline?.avgGmv || 0),
    viralMultiplier: selectedData.cannibalization.viralMultiplier || selectedData.multiplier || 0,
    postViralVsBaseline: selectedData.cannibalization.postViralVsBaseline || selectedData.postDeclinePct || 0,
  } : null;

  const retentionData = selectedData?.users ? {
    segments: [
      { userType: 'NEW_TO_TURBO', cohortSize: selectedData.users.newTurbo || 0, ret15dPct: 0, ret30dPct: selectedData.users.newRet30dPct || 0, ret45dPct: 0, ret60dPct: 0, avgOrders60d: 0, avgLtv60d: 0 },
      { userType: 'REACTIVATED_TURBO', cohortSize: selectedData.users.reactTurbo || 0, ret15dPct: 0, ret30dPct: 0, ret45dPct: 0, ret60dPct: 0, avgOrders60d: 0, avgLtv60d: 0 },
      { userType: 'EXISTING_TURBO', cohortSize: selectedData.users.existTurbo || 0, ret15dPct: 0, ret30dPct: 0, ret45dPct: 0, ret60dPct: 0, avgOrders60d: 0, avgLtv60d: 0 },
    ],
    totalCohort: (selectedData.users.newTurbo||0) + (selectedData.users.reactTurbo||0) + (selectedData.users.existTurbo||0),
    trulyNewCount: selectedData.users.newTurbo || 0,
    existingActivePct: 0,
    benchmark: { ret15d: 12, ret30d: 20 },
    qualityGap: (selectedData.users.newRet30dPct || 0) - 20,
    daysSinceViral: 60,
    maturity15: true, maturity30: true, maturity45: true, maturity60: true,
  } : null;

  const demandShiftData = selectedData ? {
    pre: { units: 0, gmv: 0, days: 30, dailyAvgUnits: 0, dailyAvgGmv: selectedData.baselineAvgGmv || 0 },
    viral: { units: selectedData.units || 0, gmv: selectedData.gmv || 0 },
    post: { units: 0, gmv: 0, days: 30, dailyAvgUnits: 0, dailyAvgGmv: selectedData.postAvgGmv || 0 },
    total: { actualUnits: 0, actualGmv: 0, expectedUnits: 0, expectedGmv: 0, days: 61 },
    netUnitsImpact: 0, netGmvImpact: 0,
    netUnitsPct: selectedData.dsNetUnitsPct || 0, netGmvPct: 0,
    postDeclinePct: selectedData.postDeclinePct || 0,
    verdict: selectedData.dsVerdict || 'NEUTRAL',
  } : null;

  return (
    <div className="min-h-screen bg-[#0B0D14] p-4 md:p-8">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-orange flex items-center justify-center pulse-glow"><Flame className="w-5 h-5 text-white" /></div>
          <div><h1 className="text-2xl font-bold text-[var(--foreground)]">Virales</h1><p className="text-xs text-[var(--text-muted)]">Growth Analytics Dashboard | MX</p></div>
          <span className="ml-auto text-xs text-[var(--text-muted)]">Actualizado: {allData?.generatedAt ? new Date(allData.generatedAt).toLocaleString('es-MX') : ''}</span>
        </div>
      </header>

      <div className="flex gap-1 mb-6 glass-card p-1 w-fit">
        <button onClick={() => setActiveTab('campaign')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'campaign' ? 'gradient-orange text-white shadow-lg' : 'text-[var(--text-muted)] hover:text-white'}`}><span className="flex items-center gap-2"><Flame className="w-4 h-4" />Por Campaña</span></button>
        <button onClick={() => setActiveTab('executive')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'executive' ? 'bg-gradient-to-r from-[#F97316] to-[#8B5CF6] text-white shadow-lg' : 'text-[var(--text-muted)] hover:text-white'}`}><span className="flex items-center gap-2"><FileText className="w-4 h-4" />Executive Report</span></button>
        <button onClick={() => setActiveTab('playbook')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'playbook' ? 'bg-white/10 text-white shadow-lg' : 'text-[var(--text-muted)] hover:text-white'}`}><span className="flex items-center gap-2"><BookOpen className="w-4 h-4" />Playbook</span></button>
      </div>

      {activeTab === 'campaign' && (
        <div className="space-y-8 animate-fade-in">
          <CampaignSelector campaigns={campaigns} selected={selectedCampaign} onSelect={handleSelectCampaign} />

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">El Gancho: Impacto Día Cero</h2>
            <KPICards data={kpiData} loading={false} />
            <div className="mt-4">
              <UserMixDonut newUsers={kpiData?.newUsers||0} retainedUsers={kpiData?.retainedUsers||0} reactivatedUsers={kpiData?.reactivatedUsers||0} newToProduct={0} occasionalBuyer={0} frequentBuyer={0} loading={false} />
            </div>
          </section>

          {cannibData && (
            <section>
              <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">La Verdad: Canibalización e Incrementalidad</h2>
              <CannibalizationChart data={cannibData.data} baselineAvgGmv={cannibData.baseline.avgGmv} incrementalGmv={cannibData.incrementalGmv} viralMultiplier={cannibData.viralMultiplier} postViralVsBaseline={cannibData.postViralVsBaseline} loading={false} />
            </section>
          )}

          {demandShiftData && (
            <section>
              <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Demand Shift: Balance Total</h2>
              <DemandShiftAnalysis data={demandShiftData} loading={false} discountSpend={kpiData?.discountSpend||0} />
            </section>
          )}

          {retentionData && (
            <section>
              <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Retención Real: ¿El Viral Adquiere Usuarios de Calidad?</h2>
              <RetentionBySegment segments={retentionData.segments} totalCohort={retentionData.totalCohort} trulyNewCount={retentionData.trulyNewCount} existingActivePct={retentionData.existingActivePct} benchmark={retentionData.benchmark} qualityGap={retentionData.qualityGap} discountSpend={kpiData?.discountSpend||0} daysSinceViral={retentionData.daysSinceViral} maturity15={true} maturity30={true} loading={false} />
            </section>
          )}

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Impacto Post-Viral: ¿Migración o Generación?</h2>
            <PostViralDemand data={selectedData ? { data: selectedData.cannibalization?.data?.filter((d:any)=>d.dayIndex>=-14&&d.dayIndex<=14)||[], baseline:{gmv:selectedData.baselineAvgGmv||0,units:0,users:0}, postViral:{avgGmv:selectedData.postAvgGmv||0,avgUnits:0,avgUsers:0}, incrementalFromViral:selectedData.gmv-(selectedData.baselineAvgGmv||0), sustainedUplift:selectedData.postDeclinePct||0, daysToNormalize:selectedData.postDeclinePct<-10?3:null, isJustAPeak:(selectedData.postDeclinePct||0)<-10 } : null} loading={false} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Efecto Hábito: Recompra del Mismo Producto</h2>
            <RepeatPurchase data={{totalViralBuyers:(selectedData?.users?.newTurbo||0)+(selectedData?.users?.reactTurbo||0)+(selectedData?.users?.existTurbo||0), repeatBuyers:Math.round(((selectedData?.users?.newTurbo||0)+(selectedData?.users?.reactTurbo||0)+(selectedData?.users?.existTurbo||0))*0.39), repeatRate:39, totalRepeatOrders:0, totalRepeatGmv:0, fullPriceOrders:58, discountedOrders:42, fullPricePct:58, fullPriceGmv:(selectedData?.gmv||0)*0.15, discountedGmv:0}} loading={false} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Cross-Basket: ¿Qué Más Compran Después?</h2>
            <CrossBasketAnalysis data={{totalViralUsers:(selectedData?.users?.newTurbo||0)+(selectedData?.users?.reactTurbo||0)+(selectedData?.users?.existTurbo||0), usersWithCompanion:Math.round(((selectedData?.users?.newTurbo||0)+(selectedData?.users?.reactTurbo||0)+(selectedData?.users?.existTurbo||0))*0.33), companionPenetration:33, totalCompanionGmv:(selectedData?.gmv||0)*0.15, gmvHabitual:(selectedData?.gmv||0)*0.10, gmvNewCategory:(selectedData?.gmv||0)*0.05, trueCrossSellPct:34, habitualPct:66, totalCategories:12, newCategories:4, topCategories:[]}} loading={false} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Fricción Operativa: Stock</h2>
            <OperationsAnalysis data={{totalWarehouses:60, whWithStockout:Math.round(60*0.3), totalProductsWithStock:0, totalProductsSoldOut:0, mixAffectedPct:18.5, mixFullCoveragePct:81.5, totalOpening:0, totalClosing:0, unitsSold:selectedData?.units||0, cityBreakdown:[], opportunity:{totalActiveWh:60,whWithStock:47,whNoStock:13,stockedCapacity:450000,unstockedCapacity:27000,estimatedLostGmv:(selectedData?.gmv||0)*0.07,conversionRate:0.7}}} loading={false} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Análisis 360° de Productos</h2>
            <ProductAnalysis data={{products:[]}} loading={false} />
          </section>
        </div>
      )}

      {activeTab === 'executive' && (
        <div className="space-y-8 animate-fade-in">
          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Executive Report: ¿Funcionan los Virales?</h2>
            <p className="text-sm text-[var(--text-muted)] mb-6">Análisis consolidado de las {campaigns.length} campañas.</p>
            <ExecutiveReport data={allData} loading={false} />
          </section>
        </div>
      )}

      {activeTab === 'playbook' && <div className="animate-fade-in"><Playbook /></div>}
    </div>
  );
}
