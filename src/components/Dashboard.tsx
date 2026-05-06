'use client';

import { useState, useEffect, useCallback } from 'react';
import { Campaign, KPIData, CannibalizationData, StockoutData } from '@/lib/types';
import CampaignSelector from './CampaignSelector';
import KPICards from './KPICards';
import UserMixDonut from './UserMixDonut';
import CannibalizationChart from './CannibalizationChart';
import RetentionBySegment from './RetentionBySegment';
import PostViralDemand from './PostViralDemand';
import CrossBasketAnalysis from './CrossBasketAnalysis';
import OperationsAnalysis from './OperationsAnalysis';
import ProductAnalysis from './ProductAnalysis';
import RepeatPurchase from './RepeatPurchase';
import DemandShiftAnalysis from './DemandShiftAnalysis';
import ExecutiveReport from './ExecutiveReport';
import Playbook from './Playbook';
import { Flame, FileText, BookOpen } from 'lucide-react';

type Tab = 'campaign' | 'executive' | 'playbook';

interface RetentionApiData {
  segments: { userType: string; cohortSize: number; ret15dPct: number; ret30dPct: number; ret45dPct: number; ret60dPct: number; avgOrders60d: number; avgLtv60d: number }[];
  totalCohort: number; trulyNewCount: number; reactivatedCount: number; existingActiveCount: number; existingActivePct: number;
  benchmark: { ret15d: number; ret30d: number }; qualityGap: number; daysSinceViral: number;
  maturity15: boolean; maturity30: boolean; maturity45: boolean; maturity60: boolean;
}

interface PostDemandApiData {
  data: { dayIndex: number; gmv: number; units: number; users: number; orders: number }[];
  baseline: { gmv: number; units: number; users: number };
  postViral: { avgGmv: number; avgUnits: number; avgUsers: number };
  incrementalFromViral: number; sustainedUplift: number; daysToNormalize: number | null; isJustAPeak: boolean;
  stockeoAnalysis?: { viralBefore: number; viralAfter: number; viralChange: number; controlBefore: number; controlAfter: number; controlChange: number; isStockeo: boolean };
}

interface CrossBasketApiData {
  totalViralUsers: number; usersWithCompanion: number; companionPenetration: number;
  totalCompanionGmv: number; gmvHabitual: number; gmvNewCategory: number;
  trueCrossSellPct: number; habitualPct: number; totalCategories: number; newCategories: number;
  topCategories: { category: string; orders: number; gmv: number }[];
}

interface ExecutiveApiData {
  programKpis: { totalCampaigns: number; totalGmv: number; totalDiscount: number; avgRoi: number; totalNetIncremental: number; netPositiveCount: number; netPositivePct: number; avgMultiplier: number; totalDsNetUnits: number; totalDsNetGmv: number; dsGenerationCount: number; dsNeutralCount: number; dsDestructionCount: number };
  campaigns: { name: string; date: string; viralGmv: number; discount: number; roi: number; incrementalGmv: number; postDip: number; netIncremental: number; isNetPositive: boolean; multiplier: number; baselineAvgGmv: number; postAvgGmv: number; dsNetUnits: number; dsNetUnitsPct: number; dsNetGmv: number; dsVerdict: string }[];
  monthlyData: { month: string; campaigns: number; totalGmv: number; totalDiscount: number; totalNetIncremental: number; avgRoi: number; netPositivePct: number }[];
  aiVerdict: string;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('campaign');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  // Tab 1 state
  const [kpiData, setKpiData] = useState<KPIData | null>(null);
  const [cannibData, setCannibData] = useState<CannibalizationData | null>(null);
  const [retentionData, setRetentionData] = useState<RetentionApiData | null>(null);
  const [postDemandData, setPostDemandData] = useState<PostDemandApiData | null>(null);
  const [crossBasketData, setCrossBasketData] = useState<CrossBasketApiData | null>(null);
  const [stockoutData, setStockoutData] = useState<StockoutData | null>(null);
  const [productData, setProductData] = useState<{ products: { syncProductId: number; name: string; brand: string; gmv: number; units: number; orders: number; discount: number; avgPrice: number; discountPct: number; warehousesSold: number; openingStock: number; closingStock: number; whWithStock: number; sellThroughPct: number }[] } | null>(null);
  const [repeatData, setRepeatData] = useState<{ totalViralBuyers: number; repeatBuyers: number; repeatRate: number; totalRepeatOrders: number; totalRepeatGmv: number; fullPriceOrders: number; discountedOrders: number; fullPricePct: number; fullPriceGmv: number; discountedGmv: number } | null>(null);
  const [demandShiftData, setDemandShiftData] = useState<{ pre: { units: number; gmv: number; days: number; dailyAvgUnits: number; dailyAvgGmv: number }; viral: { units: number; gmv: number }; post: { units: number; gmv: number; days: number; dailyAvgUnits: number; dailyAvgGmv: number }; total: { actualUnits: number; actualGmv: number; expectedUnits: number; expectedGmv: number; days: number }; netUnitsImpact: number; netGmvImpact: number; netUnitsPct: number; netGmvPct: number; postDeclinePct: number; verdict: string } | null>(null);

  // Executive state
  const [executiveData, setExecutiveData] = useState<ExecutiveApiData | null>(null);

  // Loading states
  const [loadingKpi, setLoadingKpi] = useState(false);
  const [loadingCannib, setLoadingCannib] = useState(false);
  const [loadingRetention, setLoadingRetention] = useState(false);
  const [loadingPostDemand, setLoadingPostDemand] = useState(false);
  const [loadingCrossBasket, setLoadingCrossBasket] = useState(false);
  const [loadingStockout, setLoadingStockout] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [loadingRepeat, setLoadingRepeat] = useState(false);
  const [loadingDemandShift, setLoadingDemandShift] = useState(false);
  const [loadingExecutive, setLoadingExecutive] = useState(false);

  useEffect(() => {
    fetch('/api/campaigns').then(res => res.json()).then(data => setCampaigns(data.campaigns || [])).catch(console.error);
  }, []);

  const fetchCampaignData = useCallback(async (campaign: Campaign | null) => {
    if (!campaign) {
      setKpiData(null); setCannibData(null); setRetentionData(null); setPostDemandData(null); setCrossBasketData(null); setStockoutData(null); setProductData(null); setRepeatData(null); setDemandShiftData(null);
      return;
    }

    const body = JSON.stringify({ syncIds: campaign.syncIds, viralDate: campaign.fechaInicio });
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body };

    setLoadingKpi(true); setLoadingCannib(true); setLoadingRetention(true); setLoadingPostDemand(true); setLoadingCrossBasket(true); setLoadingStockout(true); setLoadingProduct(true); setLoadingRepeat(true); setLoadingDemandShift(true);

    const [impactRes, cannibRes, retentionRes, postDemandRes, crossBasketRes, stockoutRes, productRes, repeatRes, demandShiftRes] = await Promise.allSettled([
      fetch('/api/impact', opts), fetch('/api/cannibalization', opts), fetch('/api/retention', opts), fetch('/api/post-demand', opts), fetch('/api/cross-basket', opts), fetch('/api/stockout', opts), fetch('/api/product-analysis', opts), fetch('/api/repeat-purchase', opts), fetch('/api/demand-shift', opts),
    ]);

    if (impactRes.status === 'fulfilled' && impactRes.value.ok) setKpiData(await impactRes.value.json());
    setLoadingKpi(false);
    if (cannibRes.status === 'fulfilled' && cannibRes.value.ok) setCannibData(await cannibRes.value.json());
    setLoadingCannib(false);
    if (retentionRes.status === 'fulfilled' && retentionRes.value.ok) setRetentionData(await retentionRes.value.json());
    setLoadingRetention(false);
    if (postDemandRes.status === 'fulfilled' && postDemandRes.value.ok) setPostDemandData(await postDemandRes.value.json());
    setLoadingPostDemand(false);
    if (crossBasketRes.status === 'fulfilled' && crossBasketRes.value.ok) setCrossBasketData(await crossBasketRes.value.json());
    setLoadingCrossBasket(false);
    if (stockoutRes.status === 'fulfilled' && stockoutRes.value.ok) setStockoutData(await stockoutRes.value.json());
    setLoadingStockout(false);
    if (productRes.status === 'fulfilled' && productRes.value.ok) setProductData(await productRes.value.json());
    setLoadingProduct(false);
    if (repeatRes.status === 'fulfilled' && repeatRes.value.ok) setRepeatData(await repeatRes.value.json());
    setLoadingRepeat(false);
    if (demandShiftRes.status === 'fulfilled' && demandShiftRes.value.ok) setDemandShiftData(await demandShiftRes.value.json());
    setLoadingDemandShift(false);
  }, []);

  useEffect(() => { fetchCampaignData(selectedCampaign); }, [selectedCampaign, fetchCampaignData]);

  useEffect(() => {
    if (activeTab === 'executive' && !executiveData) {
      setLoadingExecutive(true);
      fetch('/api/executive').then(res => res.json()).then(data => setExecutiveData(data)).catch(console.error).finally(() => setLoadingExecutive(false));
    }
  }, [activeTab, executiveData]);

  return (
    <div className="min-h-screen bg-[#0B0D14] p-4 md:p-8">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-orange flex items-center justify-center pulse-glow">
            <Flame className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Virales</h1>
            <p className="text-xs text-[var(--text-muted)]">Growth Analytics Dashboard | MX</p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 glass-card p-1 w-fit">
        <button onClick={() => setActiveTab('campaign')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'campaign' ? 'gradient-orange text-white shadow-lg' : 'text-[var(--text-muted)] hover:text-white'}`}>
          <span className="flex items-center gap-2"><Flame className="w-4 h-4" />Por Campaña</span>
        </button>
        <button onClick={() => setActiveTab('executive')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'executive' ? 'bg-gradient-to-r from-[#F97316] to-[#8B5CF6] text-white shadow-lg' : 'text-[var(--text-muted)] hover:text-white'}`}>
          <span className="flex items-center gap-2"><FileText className="w-4 h-4" />Executive Report</span>
        </button>
        <button onClick={() => setActiveTab('playbook')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'playbook' ? 'bg-white/10 text-white shadow-lg' : 'text-[var(--text-muted)] hover:text-white'}`}>
          <span className="flex items-center gap-2"><BookOpen className="w-4 h-4" />Playbook</span>
        </button>
      </div>

      {/* Tab 1: Campaign Analysis */}
      {activeTab === 'campaign' && (
        <div className="space-y-8 animate-fade-in">
          <CampaignSelector campaigns={campaigns} selected={selectedCampaign} onSelect={setSelectedCampaign} />

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">El Gancho: Impacto Día Cero</h2>
            <KPICards data={kpiData} loading={loadingKpi} />
            <div className="mt-4">
              <UserMixDonut
                newUsers={kpiData?.newUsers || 0}
                retainedUsers={kpiData?.retainedUsers || 0}
                reactivatedUsers={kpiData?.reactivatedUsers || 0}
                newToProduct={(kpiData as Record<string, number> | null)?.newToProduct || 0}
                occasionalBuyer={(kpiData as Record<string, number> | null)?.occasionalBuyer || 0}
                frequentBuyer={(kpiData as Record<string, number> | null)?.frequentBuyer || 0}
                loading={loadingKpi}
              />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">La Verdad: Canibalización e Incrementalidad</h2>
            <CannibalizationChart data={cannibData?.data || []} baselineAvgGmv={cannibData?.baseline?.avgGmv || 0} incrementalGmv={cannibData?.incrementalGmv || 0} viralMultiplier={cannibData?.viralMultiplier || 0} postViralVsBaseline={cannibData?.postViralVsBaseline || 0} loading={loadingCannib} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Impacto Post-Viral: ¿Migración o Generación?</h2>
            <PostViralDemand data={postDemandData} loading={loadingPostDemand} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Demand Shift: Balance Total (30d pre + viral + 30d post)</h2>
            <DemandShiftAnalysis data={demandShiftData} loading={loadingDemandShift} discountSpend={kpiData?.discountSpend || 0} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Retención Real: ¿El Viral Adquiere Usuarios de Calidad?</h2>
            <RetentionBySegment segments={retentionData?.segments || []} totalCohort={retentionData?.totalCohort || 0} trulyNewCount={retentionData?.trulyNewCount || 0} existingActivePct={retentionData?.existingActivePct || 0} benchmark={retentionData?.benchmark || { ret15d: 12, ret30d: 20 }} qualityGap={retentionData?.qualityGap || 0} discountSpend={kpiData?.discountSpend || 0} daysSinceViral={retentionData?.daysSinceViral || 0} maturity15={retentionData?.maturity15 ?? true} maturity30={retentionData?.maturity30 ?? true} loading={loadingRetention} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Efecto Hábito: Recompra del Mismo Producto</h2>
            <RepeatPurchase data={repeatData} loading={loadingRepeat} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Cross-Basket: ¿Qué Más Compran Después?</h2>
            <CrossBasketAnalysis data={crossBasketData} loading={loadingCrossBasket} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Fricción Operativa: Stock por Ciudad</h2>
            <OperationsAnalysis data={stockoutData} loading={loadingStockout} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Análisis 360° de Productos</h2>
            <ProductAnalysis data={productData} loading={loadingProduct} />
          </section>
        </div>
      )}

      {/* Tab 2: Executive Report */}
      {activeTab === 'executive' && (
        <div className="space-y-8 animate-fade-in">
          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Executive Report: ¿Funcionan los Virales?</h2>
            <p className="text-sm text-[var(--text-muted)] mb-6">Análisis consolidado de las {campaigns.length} campañas del programa. Evalúa si los virales generan demanda incremental real o son migración de ventas existentes.</p>
            <ExecutiveReport data={executiveData} loading={loadingExecutive} />
          </section>
        </div>
      )}

      {/* Tab 3: Playbook */}
      {activeTab === 'playbook' && (
        <div className="animate-fade-in">
          <Playbook />
        </div>
      )}
    </div>
  );
}
