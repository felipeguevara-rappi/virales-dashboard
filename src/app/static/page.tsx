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

type Tab = 'campaign' | 'executive' | 'playbook';

export default function StaticDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('campaign');
  const [fullData, setFullData] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Try root first (Vercel), then /virales/ (GitHub Pages)
      let data;
      try {
        const r = await fetch('/full-data.json');
        if (!r.ok) throw new Error();
        data = await r.json();
      } catch {
        const r = await fetch('/virales/full-data.json');
        data = await r.json();
      }
      setFullData(data);
      setCampaigns(data.campaigns || []);
      if (data.campaigns?.length > 0) setSelectedCampaign(data.campaigns[0]);
      setLoading(false);
    }
    load();
  }, []);

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

  // Get data for selected campaign — EXACT same data as the API returns
  const campId = selectedCampaign?.id || '';
  const cd = fullData?.campaignData?.[campId] || {};
  const kpiData = cd.impact || null;
  const cannibData = cd.cannibalization || null;
  const retentionData = cd.retention || null;
  const postDemandData = cd.postDemand || null;
  const crossBasketData = cd.crossBasket || null;
  const stockoutData = cd.stockout || null;
  const productData = cd.productAnalysis || null;
  const repeatData = cd.repeatPurchase || null;
  const demandShiftData = cd.demandShift || null;
  const executiveData = fullData?.executive || null;

  return (
    <div className="min-h-screen bg-[#0B0D14] p-4 md:p-8">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-orange flex items-center justify-center pulse-glow"><Flame className="w-5 h-5 text-white" /></div>
          <div><h1 className="text-2xl font-bold text-[var(--foreground)]">Virales</h1><p className="text-xs text-[var(--text-muted)]">Growth Analytics Dashboard | MX</p></div>
          <span className="ml-auto text-xs text-[var(--text-muted)]">{fullData?.generatedAt ? `Actualizado: ${new Date(fullData.generatedAt).toLocaleString('es-MX')}` : ''}</span>
        </div>
      </header>

      <div className="flex gap-1 mb-6 glass-card p-1 w-fit">
        <button onClick={() => setActiveTab('campaign')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'campaign' ? 'gradient-orange text-white shadow-lg' : 'text-[var(--text-muted)] hover:text-white'}`}><span className="flex items-center gap-2"><Flame className="w-4 h-4" />Por Campaña</span></button>
        <button onClick={() => setActiveTab('executive')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'executive' ? 'bg-gradient-to-r from-[#F97316] to-[#8B5CF6] text-white shadow-lg' : 'text-[var(--text-muted)] hover:text-white'}`}><span className="flex items-center gap-2"><FileText className="w-4 h-4" />Executive Report</span></button>
        <button onClick={() => setActiveTab('playbook')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'playbook' ? 'bg-white/10 text-white shadow-lg' : 'text-[var(--text-muted)] hover:text-white'}`}><span className="flex items-center gap-2"><BookOpen className="w-4 h-4" />Playbook</span></button>
      </div>

      {activeTab === 'campaign' && (
        <div className="space-y-8 animate-fade-in">
          <CampaignSelector campaigns={campaigns} selected={selectedCampaign} onSelect={setSelectedCampaign} />

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">El Gancho: Impacto Día Cero</h2>
            <KPICards data={kpiData} loading={!kpiData} />
            <div className="mt-4">
              <UserMixDonut
                newUsers={kpiData?.newUsers || 0}
                retainedUsers={kpiData?.retainedUsers || 0}
                reactivatedUsers={kpiData?.reactivatedUsers || 0}
                newToProduct={(kpiData as any)?.newToProduct || 0}
                occasionalBuyer={(kpiData as any)?.occasionalBuyer || 0}
                frequentBuyer={(kpiData as any)?.frequentBuyer || 0}
                loading={!kpiData}
              />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">La Verdad: Canibalización e Incrementalidad</h2>
            <CannibalizationChart data={cannibData?.data || []} baselineAvgGmv={cannibData?.baseline?.avgGmv || 0} incrementalGmv={cannibData?.incrementalGmv || 0} viralMultiplier={cannibData?.viralMultiplier || 0} postViralVsBaseline={cannibData?.postViralVsBaseline || 0} loading={!cannibData} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Impacto Post-Viral: ¿Migración o Generación?</h2>
            <PostViralDemand data={postDemandData} loading={!postDemandData} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Demand Shift: Balance Total (30d pre + viral + 30d post)</h2>
            <DemandShiftAnalysis data={demandShiftData} loading={!demandShiftData} discountSpend={kpiData?.discountSpend || 0} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Retención Real: ¿El Viral Adquiere Usuarios de Calidad?</h2>
            <RetentionBySegment segments={retentionData?.segments || []} totalCohort={retentionData?.totalCohort || 0} trulyNewCount={retentionData?.trulyNewCount || 0} existingActivePct={retentionData?.existingActivePct || 0} benchmark={retentionData?.benchmark || { ret15d: 12, ret30d: 20 }} qualityGap={retentionData?.qualityGap || 0} discountSpend={kpiData?.discountSpend || 0} daysSinceViral={retentionData?.daysSinceViral || 0} maturity15={retentionData?.maturity15 ?? true} maturity30={retentionData?.maturity30 ?? true} loading={!retentionData} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Efecto Hábito: Recompra del Mismo Producto</h2>
            <RepeatPurchase data={repeatData} loading={!repeatData} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Cross-Basket: ¿Qué Más Compran Después?</h2>
            <CrossBasketAnalysis data={crossBasketData} loading={!crossBasketData} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Fricción Operativa: Stock por Ciudad</h2>
            <OperationsAnalysis data={stockoutData} loading={!stockoutData} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Análisis 360° de Productos</h2>
            <ProductAnalysis data={productData} loading={!productData} />
          </section>
        </div>
      )}

      {activeTab === 'executive' && (
        <div className="space-y-8 animate-fade-in">
          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Executive Report: ¿Funcionan los Virales?</h2>
            <p className="text-sm text-[var(--text-muted)] mb-6">Análisis consolidado de las {campaigns.length} campañas del programa.</p>
            <ExecutiveReport data={executiveData} loading={!executiveData} />
          </section>
        </div>
      )}

      {activeTab === 'playbook' && <div className="animate-fade-in"><Playbook /></div>}
    </div>
  );
}
