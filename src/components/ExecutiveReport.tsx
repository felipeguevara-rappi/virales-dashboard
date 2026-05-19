'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, ComposedChart, Line, ScatterChart, Scatter, ZAxis, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Zap, AlertTriangle, CheckCircle, XCircle, DollarSign, Users, Package, Target } from 'lucide-react';

interface CampaignResult {
  name: string; date: string; viralGmv: number; discount: number; roi: number;
  incrementalGmv: number; postDip: number; netIncremental: number; isNetPositive: boolean; multiplier: number;
  baselineAvgGmv: number; postAvgGmv: number;
  dsNetUnits: number; dsNetUnitsPct: number; dsNetGmv: number; dsVerdict: string;
}

interface MonthlyData {
  month: string; campaigns: number; totalGmv: number; totalDiscount: number; totalNetIncremental: number; avgRoi: number; netPositivePct: number;
}

interface ExecutiveData {
  programKpis: { totalCampaigns: number; totalGmv: number; totalDiscount: number; avgRoi: number; totalNetIncremental: number; netPositiveCount: number; netPositivePct: number; avgMultiplier: number; [key: string]: number };
  campaigns: CampaignResult[]; monthlyData: MonthlyData[]; aiVerdict: string;
  doiProgram?: { avgDoiPre: number; avgDoiPost: number; doiDelta: number; campaignsWithDoiRisk: number };
  discountBreakdown?: { rappi: number; makers: number; commercial: number; monetization: number; partners: number; shrinkage: number; blackbox: number };
  userMetrics?: { totalNewTurbo: number; totalReactivated: number; totalExisting: number; newThatReturned30d: number; avgNewRetPct: number; benchmarkRet30d: number };
}

interface ExecutiveReportProps { data: ExecutiveData | null; loading: boolean; }

export default function ExecutiveReport({ data, loading }: ExecutiveReportProps) {
  if (loading) {
    return <div className="space-y-4">{[...Array(5)].map((_, i) => (<div key={i} className="glass-card p-6 h-[200px] flex items-center justify-center"><div className="animate-pulse text-[var(--text-muted)]">Analizando programa completo...</div></div>))}</div>;
  }
  if (!data) return null;

  const { programKpis: kpis, campaigns, monthlyData, aiVerdict } = data;
  const verdictColor = kpis.netPositivePct >= 70 ? '#10B981' : kpis.netPositivePct >= 40 ? '#F97316' : '#EF4444';
  const VerdictIcon = kpis.netPositivePct >= 70 ? CheckCircle : kpis.netPositivePct >= 40 ? AlertTriangle : XCircle;

  /** Program P&L waterfall: GMV - discount - post dip = net value */
  const waterfallProgram = useMemo(() => {
    const totalPostDip = campaigns.reduce((s, c) => s + c.postDip, 0);
    return [
      { name: 'GMV Viral', value: Math.round(kpis.totalGmv / 1000), fill: '#F97316' },
      { name: '- Inversión', value: -Math.round(kpis.totalDiscount / 1000), fill: '#EF4444' },
      { name: '- Post Dip', value: -Math.round(totalPostDip / 1000), fill: '#8B5CF6' },
      { name: '= Net Value', value: Math.round(kpis.totalNetIncremental / 1000), fill: kpis.totalNetIncremental > 0 ? '#10B981' : '#EF4444' },
    ];
  }, [campaigns, kpis.totalGmv, kpis.totalDiscount, kpis.totalNetIncremental]);

  const totalPostDip = useMemo(() => campaigns.reduce((s, c) => s + c.postDip, 0), [campaigns]);

  /** Demand quadrant: plots multiplier (X) vs post-viral change (Y) per campaign */
  const demandQuadrant = useMemo(() => campaigns.filter(c => c.baselineAvgGmv > 0).map(c => ({
    x: c.multiplier,
    y: c.baselineAvgGmv > 0 ? ((c.postAvgGmv - c.baselineAvgGmv) / c.baselineAvgGmv) * 100 : 0,
    name: c.name.replace('VIRAL_DEAL_', '').slice(0, 10),
    isGood: c.netIncremental > 0,
  })), [campaigns]);

  // Classify campaigns into quadrants
  const pureGeneration = demandQuadrant.filter(d => d.x > 3 && d.y >= -10).length;
  const mixedResult = demandQuadrant.filter(d => d.x > 3 && d.y < -10).length;
  const lowImpact = demandQuadrant.filter(d => d.x <= 3).length;

  // Learning Curve
  const learningData = useMemo(() => campaigns.map((c, i) => ({
    index: i + 1, roi: c.roi, name: c.name.replace('VIRAL_DEAL_', '').slice(0, 8), date: c.date.slice(5),
  })), [campaigns]);

  // Monthly trend
  const trendData = useMemo(() => monthlyData.map(m => ({
    month: m.month.slice(5), 'GMV ($K)': Math.round(m.totalGmv / 1000),
    'Net Inc ($K)': Math.round(m.totalNetIncremental / 1000), 'ROI': Math.round(m.avgRoi * 10) / 10,
  })), [monthlyData]);

  // Prediction: linear trend of ROI
  const roiValues = campaigns.map(c => c.roi).filter(r => r > 0);
  const avgRecentRoi = roiValues.slice(-10).reduce((s, v) => s + v, 0) / Math.max(roiValues.slice(-10).length, 1);
  const avgEarlyRoi = roiValues.slice(0, 10).reduce((s, v) => s + v, 0) / Math.max(roiValues.slice(0, 10).length, 1);
  const roiTrend = avgRecentRoi - avgEarlyRoi;

  /** Top/bottom campaigns sorted by net incremental value */
  const sorted = useMemo(() => [...campaigns].filter(c => c.discount > 0).sort((a, b) => b.netIncremental - a.netIncremental), [campaigns]);

  return (
    <div className="space-y-6">
      {/* === ÁNGULO 1: VENTAS === */}
      <div className="glass-card p-4 bg-gradient-to-r from-[#F97316]/5 to-transparent border-l-4 border-l-[var(--accent-orange)]">
        <h3 className="text-xs font-bold text-[var(--accent-orange)] uppercase tracking-widest">Ángulo 1: Ventas</h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="glass-card p-4 text-center">
          <DollarSign className="w-5 h-5 mx-auto mb-1 text-[var(--accent-orange)]" />
          <p className="text-2xl font-bold text-gradient-orange">${(kpis.totalGmv / 1000000).toFixed(1)}M</p>
          <p className="text-[10px] text-[var(--text-muted)]">GMV Total ({kpis.totalCampaigns} campañas)</p>
        </div>
        <div className="glass-card p-4 text-center">
          <TrendingDown className="w-5 h-5 mx-auto mb-1 text-[var(--accent-red)]" />
          <p className="text-2xl font-bold text-[var(--accent-red)]">${(kpis.totalDiscount / 1000000).toFixed(1)}M</p>
          <p className="text-[10px] text-[var(--text-muted)]">Inversión Descuento</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-[var(--foreground)]">{kpis.avgRoi.toFixed(1)}x</p>
          <p className="text-[10px] text-[var(--text-muted)]">ROI Bruto</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-[var(--accent-purple)]">-${(totalPostDip / 1000000).toFixed(2)}M</p>
          <p className="text-[10px] text-[var(--text-muted)]">Canibalización Post</p>
        </div>
        <div className="glass-card p-4 text-center">
          <TrendingUp className="w-5 h-5 mx-auto mb-1" style={{ color: verdictColor }} />
          <p className="text-2xl font-bold" style={{ color: verdictColor }}>${(kpis.totalNetIncremental / 1000000).toFixed(2)}M</p>
          <p className="text-[10px] text-[var(--text-muted)]">Net Incremental</p>
        </div>
      </div>

      {/* Waterfall */}
      <div className="glass-card p-6">
        <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">P&L del Programa Viral</h4>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={waterfallProgram} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
            <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={(v) => `$${v}K`} />
            <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }} formatter={(value) => [`$${Math.abs(Number(value))}K`, '']} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>{waterfallProgram.map((entry, i) => <Cell key={`wf-${i}`} fill={entry.fill} opacity={0.85} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* === ÁNGULO 2: DEMANDA (¿migración o generación?) === */}
      <div className="glass-card p-4 bg-gradient-to-r from-[#8B5CF6]/5 to-transparent border-l-4 border-l-[var(--accent-purple)]">
        <h3 className="text-xs font-bold text-[var(--accent-purple)] uppercase tracking-widest">Ángulo 2: ¿Migración o Generación de Demanda?</h3>
      </div>

      {/* Demand Quadrant Classification */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-5 text-center border-l-3 border-l-[var(--accent-green)]">
          <Target className="w-5 h-5 mx-auto mb-2 text-[var(--accent-green)]" />
          <p className="text-3xl font-bold text-[var(--accent-green)]">{pureGeneration}</p>
          <p className="text-xs text-[var(--text-muted)]">Generación Pura</p>
          <p className="text-[10px] text-[var(--text-muted)]">Alto multiplicador + sin dip post-viral</p>
        </div>
        <div className="glass-card p-5 text-center border-l-3 border-l-[var(--accent-orange)]">
          <AlertTriangle className="w-5 h-5 mx-auto mb-2 text-[var(--accent-orange)]" />
          <p className="text-3xl font-bold text-[var(--accent-orange)]">{mixedResult}</p>
          <p className="text-xs text-[var(--text-muted)]">Resultado Mixto</p>
          <p className="text-[10px] text-[var(--text-muted)]">Alto multiplicador PERO dip significativo</p>
        </div>
        <div className="glass-card p-5 text-center border-l-3 border-l-[var(--text-muted)]">
          <Package className="w-5 h-5 mx-auto mb-2 text-[var(--text-muted)]" />
          <p className="text-3xl font-bold text-[var(--text-muted)]">{lowImpact}</p>
          <p className="text-xs text-[var(--text-muted)]">Bajo Impacto</p>
          <p className="text-[10px] text-[var(--text-muted)]">Multiplicador &lt;3x — poca diferencia vs normal</p>
        </div>
      </div>

      {/* Demand Scatter */}
      <div className="glass-card p-6">
        <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">Cuadrante de Demanda: Multiplicador vs Dip Post-Viral</h4>
        <p className="text-[10px] text-[var(--text-muted)] mb-4">Ideal = arriba derecha (alto multiplicador, sin caída post). Peor = abajo derecha (alto mult, gran caída = migración).</p>
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis type="number" dataKey="x" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 9 }} name="Multiplicador" tickFormatter={(v) => `${v}x`} />
            <YAxis type="number" dataKey="y" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 9 }} name="Post vs Baseline" tickFormatter={(v) => `${v}%`} />
            <ZAxis range={[50, 50]} />
            <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }} content={({ payload }) => {
              if (!payload?.length) return null;
              const d = payload[0].payload;
              return <div className="p-2 text-xs"><p className="font-bold text-[var(--foreground)]">{d.name}</p><p className="text-[var(--text-muted)]">Mult: {d.x.toFixed(1)}x | Post: {d.y.toFixed(0)}%</p></div>;
            }} />
            <Scatter data={demandQuadrant.filter(d => d.isGood)} fill="#10B981" opacity={0.7} name="Net Positivo" />
            <Scatter data={demandQuadrant.filter(d => !d.isGood)} fill="#EF4444" opacity={0.7} name="Net Negativo" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Demand Shift: Full Period Balance */}
      <div className="glass-card p-6">
        <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Demand Shift: Balance Total del Programa (unidades reales vs esperadas sin viral)</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="p-4 bg-white/5 rounded-lg text-center">
            <p className="text-2xl font-bold" style={{ color: kpis.totalDsNetUnits >= 0 ? '#10B981' : '#EF4444' }}>
              {kpis.totalDsNetUnits >= 0 ? '+' : ''}{Math.round(kpis.totalDsNetUnits / 1000)}K
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">Net Units Impact (programa)</p>
          </div>
          <div className="p-4 bg-white/5 rounded-lg text-center">
            <p className="text-2xl font-bold" style={{ color: kpis.totalDsNetGmv >= 0 ? '#10B981' : '#EF4444' }}>
              {kpis.totalDsNetGmv >= 0 ? '+' : ''}${Math.round(kpis.totalDsNetGmv / 1000)}K
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">Net GMV Impact (programa)</p>
          </div>
          <div className="p-4 bg-white/5 rounded-lg text-center">
            <div className="flex justify-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#10B981]/20 text-[#10B981]">{kpis.dsGenerationCount} Gen</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#F97316]/20 text-[#F97316]">{kpis.dsNeutralCount} Neutro</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#EF4444]/20 text-[#EF4444]">{kpis.dsDestructionCount} Destr</span>
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">Clasificación campañas</p>
          </div>
        </div>
        {/* Per-campaign demand shift bars */}
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={campaigns.filter(c => c.discount > 0).sort((a, b) => b.dsNetUnitsPct - a.dsNetUnitsPct).slice(0, 20).map(c => ({ name: c.name.replace('VIRAL_DEAL_', '').slice(0, 10), pct: Math.round(c.dsNetUnitsPct * 10) / 10 }))} margin={{ top: 10, right: 20, left: 10, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 8, angle: -45 }} textAnchor="end" height={60} />
            <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 9 }} tickFormatter={(v) => `${v}%`} />
            <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }} formatter={(value) => [`${Number(value)}%`, 'Net Units vs Expected']} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" />
            <ReferenceLine y={5} stroke="#10B981" strokeDasharray="3 3" strokeOpacity={0.5} />
            <ReferenceLine y={-5} stroke="#EF4444" strokeDasharray="3 3" strokeOpacity={0.5} />
            <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
              {campaigns.filter(c => c.discount > 0).sort((a, b) => b.dsNetUnitsPct - a.dsNetUnitsPct).slice(0, 20).map((c, i) => <Cell key={`ds-${i}`} fill={c.dsNetUnitsPct > 5 ? '#10B981' : c.dsNetUnitsPct < -5 ? '#EF4444' : '#F97316'} opacity={0.8} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 justify-center text-[10px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#10B981]" /> &gt;+5% = Genera demanda</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#F97316]" /> ±5% = Demand Shift (neutro)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#EF4444]" /> &lt;-5% = Destruye demanda</span>
        </div>
      </div>

      {/* DOI + Lost GMV Program Summary */}
      {(data.doiProgram?.avgDoiPre || kpis.totalLostGmv) ? (
        <div className="glass-card p-6">
          <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Supply: DOI e Impacto en Cobertura del Programa</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
            {data.doiProgram && data.doiProgram.avgDoiPre > 0 && (<>
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-xl font-bold text-[var(--foreground)]">{data.doiProgram.avgDoiPre.toFixed(0)}d</p>
                <p className="text-[10px] text-[var(--text-muted)]">DOI Pre-Viral</p>
              </div>
              <div className="p-3 bg-white/5 rounded-lg">
                <p className={`text-xl font-bold ${data.doiProgram.avgDoiPost < 14 ? 'text-[var(--accent-red)]' : 'text-[var(--foreground)]'}`}>{data.doiProgram.avgDoiPost.toFixed(0)}d</p>
                <p className="text-[10px] text-[var(--text-muted)]">DOI Post +7d</p>
              </div>
              <div className="p-3 bg-white/5 rounded-lg">
                <p className={`text-xl font-bold ${data.doiProgram.doiDelta < -5 ? 'text-[var(--accent-orange)]' : 'text-[var(--accent-green)]'}`}>{data.doiProgram.doiDelta >= 0 ? '+' : ''}{data.doiProgram.doiDelta.toFixed(0)}d</p>
                <p className="text-[10px] text-[var(--text-muted)]">Delta DOI</p>
              </div>
            </>)}
            <div className="p-3 bg-white/5 rounded-lg">
              <p className="text-xl font-bold text-[var(--accent-red)]">${(kpis.totalLostGmv / 1000).toFixed(0)}K</p>
              <p className="text-[10px] text-[var(--text-muted)]">GMV Potencial Perdido</p>
              <p className="text-[10px] text-[var(--text-muted)]">por falta de cobertura</p>
            </div>
            <div className="p-3 bg-white/5 rounded-lg">
              <p className="text-xl font-bold text-[var(--accent-orange)]">+{kpis.lostGmvPct.toFixed(1)}%</p>
              <p className="text-[10px] text-[var(--text-muted)]">Potencial de Crecimiento</p>
              <p className="text-[10px] text-[var(--text-muted)]">si 100% cobertura</p>
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-3 p-2 bg-white/5 rounded">
            Si todos los warehouses activos hubieran tenido stock para cada viral, el programa habría generado ~${((kpis.totalGmv + kpis.totalLostGmv) / 1000000).toFixed(1)}M en lugar de ${(kpis.totalGmv / 1000000).toFixed(1)}M — un upside de +{kpis.lostGmvPct.toFixed(1)}%.
          </p>
        </div>
      ) : null}

      {/* === ÁNGULO 3: USUARIOS === */}
      <div className="glass-card p-4 bg-gradient-to-r from-[#10B981]/5 to-transparent border-l-4 border-l-[var(--accent-green)]">
        <h3 className="text-xs font-bold text-[var(--accent-green)] uppercase tracking-widest">Ángulo 3: Usuarios — ¿Adquisición o Reciclaje?</h3>
      </div>

      <div className="glass-card p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-medium text-[var(--text-muted)] mb-4">Composición del Programa (Turbo-only)</h4>
            {(() => {
              const um = data.userMetrics || { totalNewTurbo: 0, totalReactivated: 0, totalExisting: 0, avgNewRetPct: 0, benchmarkRet30d: 20, newThatReturned30d: 0 };
              const total = um.totalNewTurbo + um.totalReactivated + um.totalExisting || 1;
              const newPct = Math.round(um.totalNewTurbo / total * 100);
              const reactPct = Math.round(um.totalReactivated / total * 100);
              const existPct = Math.round(um.totalExisting / total * 100);
              return (<div className="space-y-3">
                <div className="flex items-center gap-3"><div className="w-full bg-white/5 rounded-full h-6 overflow-hidden"><div className="h-full bg-[var(--accent-green)] rounded-full flex items-center px-2" style={{ width: `${existPct}%` }}><span className="text-[10px] text-white font-medium">Existentes Turbo {existPct}%</span></div></div></div>
                <div className="flex items-center gap-3"><div className="w-full bg-white/5 rounded-full h-6 overflow-hidden"><div className="h-full bg-[var(--accent-purple)] rounded-full flex items-center px-2" style={{ width: `${reactPct}%` }}><span className="text-[10px] text-white font-medium">Reactivados {reactPct}%</span></div></div></div>
                <div className="flex items-center gap-3"><div className="w-full bg-white/5 rounded-full h-6 overflow-hidden"><div className="h-full bg-[var(--accent-orange)] rounded-full flex items-center px-2" style={{ width: `${newPct}%` }}><span className="text-[10px] text-white font-medium">Nuevos Turbo {newPct}%</span></div></div></div>
                <p className="text-xs text-[var(--text-muted)] mt-3 p-2 bg-white/5 rounded">
                  De {total.toLocaleString()} compradores totales: {um.totalNewTurbo.toLocaleString()} nuevos a Turbo, {um.totalReactivated.toLocaleString()} reactivados, {um.totalExisting.toLocaleString()} existentes.
                </p>
              </div>);
            })()}
          </div>
          <div>
            <h4 className="text-sm font-medium text-[var(--text-muted)] mb-4">Calidad de Adquisición (Turbo-only)</h4>
            {(() => {
              const um = data.userMetrics || { totalNewTurbo: 0, totalReactivated: 0, totalExisting: 0, avgNewRetPct: 0, benchmarkRet30d: 20, newThatReturned30d: 0 };
              const gap = um.avgNewRetPct - um.benchmarkRet30d;
              return (<div className="space-y-4">
                <div className="flex items-center justify-between p-3 glass-card">
                  <span className="text-xs text-[var(--text-muted)]">Ret. Nuevos Viral Turbo (30d)</span>
                  <span className="text-sm font-bold text-[var(--accent-red)]">{um.avgNewRetPct.toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between p-3 glass-card">
                  <span className="text-xs text-[var(--text-muted)]">Benchmark Nuevos Turbo (30d)</span>
                  <span className="text-sm font-bold text-[var(--accent-green)]">{um.benchmarkRet30d}%</span>
                </div>
                <div className="flex items-center justify-between p-3 glass-card border border-[var(--accent-red)]/30">
                  <span className="text-xs text-[var(--text-muted)]">Gap de Calidad</span>
                  <span className="text-sm font-bold text-[var(--accent-red)]">{gap >= 0 ? '+' : ''}{gap.toFixed(1)}pp</span>
                </div>
                <p className="text-xs text-[var(--text-muted)] p-2 bg-[var(--accent-red)]/5 rounded border border-[var(--accent-red)]/20">
                  De {um.totalNewTurbo.toLocaleString()} nuevos a Turbo adquiridos por virales, solo {um.newThatReturned30d} ({um.avgNewRetPct.toFixed(1)}%) volvieron a comprar en Turbo en 30 días.
                </p>
              </div>);
            })()}
          </div>
        </div>
      </div>

      {/* === ÁNGULO 4: TENDENCIA Y PREDICCIÓN === */}
      <div className="glass-card p-4 bg-gradient-to-r from-[#3B82F6]/5 to-transparent border-l-4 border-l-[#3B82F6]">
        <h3 className="text-xs font-bold text-[#3B82F6] uppercase tracking-widest">Ángulo 4: Tendencia y Predicción</h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Campaign Performance Ranking */}
        <div className="glass-card p-6">
          <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Net Incremental por Campaña (Top 15)</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={campaigns.filter(c => c.discount > 0).sort((a, b) => b.netIncremental - a.netIncremental).slice(0, 15).map(c => ({ name: c.name.replace('VIRAL_DEAL_', '').slice(0, 12), net: Math.round(c.netIncremental / 1000), isPos: c.netIncremental > 0 }))} margin={{ top: 10, right: 20, left: 10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 8, angle: -45 }} textAnchor="end" height={60} />
              <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 9 }} tickFormatter={(v) => `$${v}K`} />
              <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }} formatter={(value) => [`$${Number(value)}K`, 'Net Incremental']} />
              <Bar dataKey="net" radius={[4, 4, 0, 0]}>
                {campaigns.filter(c => c.discount > 0).sort((a, b) => b.netIncremental - a.netIncremental).slice(0, 15).map((c, i) => <Cell key={`nc-${i}`} fill={c.netIncremental > 0 ? '#10B981' : '#EF4444'} opacity={0.8} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 justify-center text-[10px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#10B981]" /> Genera valor neto</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#EF4444]" /> Destruye valor</span>
          </div>
        </div>

        {/* Monthly Trend */}
        <div className="glass-card p-6">
          <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Evolución Mensual</h4>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={trendData} margin={{ top: 10, right: 40, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <YAxis yAxisId="left" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={(v) => `$${v}K`} />
              <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={(v) => `${v}x`} domain={[0, 'auto']} />
              <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }} />
              <Legend formatter={(value) => <span className="text-[10px]">{value}</span>} />
              <Bar yAxisId="left" dataKey="GMV ($K)" fill="#F97316" radius={[4, 4, 0, 0]} opacity={0.7} />
              <Bar yAxisId="left" dataKey="Net Inc ($K)" fill="#10B981" radius={[4, 4, 0, 0]} opacity={0.7} />
              <Line yAxisId="right" type="monotone" dataKey="ROI" stroke="#8B5CF6" strokeWidth={2.5} dot={{ r: 4, fill: '#8B5CF6' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Prediction Card */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-[#3B82F6]" />
          <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider">Proyección y Recomendación</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-white/5 rounded-lg text-center">
            <p className="text-xs text-[var(--text-muted)] mb-1">Si continuamos al ritmo actual (próx. 3 meses)</p>
            <p className="text-xl font-bold text-[var(--foreground)]">~${(kpis.totalGmv / monthlyData.length * 3 / 1000000).toFixed(1)}M GMV</p>
            <p className="text-xs text-[var(--text-muted)]">con ~${(kpis.totalDiscount / monthlyData.length * 3 / 1000000).toFixed(1)}M inversión</p>
          </div>
          <div className="p-4 bg-white/5 rounded-lg text-center">
            <p className="text-xs text-[var(--text-muted)] mb-1">Net Incremental proyectado</p>
            <p className="text-xl font-bold" style={{ color: verdictColor }}>${(kpis.totalNetIncremental / monthlyData.length * 3 / 1000000).toFixed(2)}M</p>
            <p className="text-xs text-[var(--text-muted)]">después de canibalización</p>
          </div>
          <div className="p-4 bg-white/5 rounded-lg text-center">
            <p className="text-xs text-[var(--text-muted)] mb-1">Break-even: ROI mínimo necesario</p>
            <p className="text-xl font-bold text-[var(--foreground)]">1.0x</p>
            <p className="text-xs text-[var(--text-muted)]">Actual: {kpis.avgRoi.toFixed(1)}x ({kpis.avgRoi >= 1 ? 'OK' : 'BAJO'})</p>
          </div>
        </div>
      </div>

      {/* === ÁNGULO 5: HÁBITO Y TIMING === */}
      <div className="glass-card p-4 bg-gradient-to-r from-[#EC4899]/5 to-transparent border-l-4 border-l-[#EC4899]">
        <h3 className="text-xs font-bold text-[#EC4899] uppercase tracking-widest">Ángulo 5: Hábito, Full-Price Revenue y Timing</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Habit Insights */}
        <div className="glass-card p-6">
          <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">El Viral Crea Hábito</h4>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
              <span className="text-xs text-[var(--text-muted)]">Tasa de Recompra (mismo producto, 60d)</span>
              <span className="text-sm font-bold text-[var(--accent-green)]">~39%</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
              <span className="text-xs text-[var(--text-muted)]">Recompras a Precio Completo</span>
              <span className="text-sm font-bold text-[var(--accent-green)]">~58%</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-[var(--accent-green)]/5 rounded-lg border border-[var(--accent-green)]/20">
              <span className="text-xs text-[var(--text-muted)]">Esto significa que...</span>
              <span className="text-xs font-medium text-[var(--accent-green)]">El descuento genera venta recurrente SIN descuento</span>
            </div>
          </div>
        </div>

        {/* Timing Intelligence */}
        <div className="glass-card p-6">
          <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Timing Óptimo</h4>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
              <span className="text-xs text-[var(--text-muted)]">Mejores días</span>
              <span className="text-sm font-bold text-[var(--accent-orange)]">Jueves y Viernes</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
              <span className="text-xs text-[var(--text-muted)]">Peak horario</span>
              <span className="text-sm font-bold text-[var(--accent-orange)]">12pm - 5pm (51% GMV)</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
              <span className="text-xs text-[var(--text-muted)]">Multiplicador Thu/Fri vs Mon</span>
              <span className="text-sm font-bold text-[var(--accent-orange)]">~2.4x más GMV</span>
            </div>
            <div className="p-3 bg-[var(--accent-orange)]/5 rounded-lg border border-[var(--accent-orange)]/20">
              <p className="text-xs text-[var(--text-muted)]">Recomendación: Concentrar virales en <strong className="text-[var(--accent-orange)]">Thu-Fri</strong> y comunicar en la mañana para peak de 12-5pm.</p>
            </div>
          </div>
        </div>
      </div>

      {/* === VEREDICTO FINAL === */}
      <div className="glass-card p-4 bg-gradient-to-r from-[var(--accent-purple)]/5 to-transparent border-l-4 border-l-[var(--accent-purple)]">
        <h3 className="text-xs font-bold text-[var(--accent-purple)] uppercase tracking-widest">Veredicto Final</h3>
      </div>

      {/* Verdict Banner */}
      <div className="glass-card p-6" style={{ borderLeft: `4px solid ${verdictColor}` }}>
        <div className="flex items-start gap-4">
          <VerdictIcon className="w-8 h-8 flex-shrink-0" style={{ color: verdictColor }} />
          <div>
            <h3 className="text-xl font-bold text-[var(--foreground)] mb-2">
              {kpis.netPositivePct >= 70 ? 'Los Virales SÍ Generan Valor' : kpis.netPositivePct >= 40 ? 'Resultados Mixtos — Necesita Optimización' : 'Los Virales No Están Generando Valor Neto'}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <div className="text-center"><p className="text-lg font-bold text-[var(--foreground)]">{kpis.avgMultiplier.toFixed(1)}x</p><p className="text-[10px] text-[var(--text-muted)]">Multiplier promedio</p></div>
              <div className="text-center"><p className="text-lg font-bold" style={{ color: verdictColor }}>{kpis.netPositivePct.toFixed(0)}%</p><p className="text-[10px] text-[var(--text-muted)]">Campañas net-positivas</p></div>
              <div className="text-center"><p className="text-lg font-bold text-[var(--foreground)]">~2%</p><p className="text-[10px] text-[var(--text-muted)]">Users verdaderamente nuevos</p></div>
              <div className="text-center"><p className="text-lg font-bold text-[var(--foreground)]">{roiTrend >= 0 ? '↑' : '↓'}</p><p className="text-[10px] text-[var(--text-muted)]">Tendencia ROI</p></div>
            </div>
          </div>
        </div>
      </div>

      {/* Top / Bottom */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-6">
          <h4 className="text-sm font-medium text-[var(--accent-green)] uppercase tracking-wider mb-3">Top 5: Mayor Valor Neto</h4>
          {sorted.slice(0, 5).map((c, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5">
              <span className="text-xs text-[var(--text-muted)] w-4">{i + 1}</span>
              <div className="flex-1"><p className="text-xs font-medium">{c.name.replace('VIRAL_DEAL_', '')}</p><p className="text-[10px] text-[var(--text-muted)]">{c.date} | {c.multiplier.toFixed(0)}x mult</p></div>
              <div className="text-right"><p className="text-xs font-bold text-[var(--accent-green)]">+${(c.netIncremental / 1000).toFixed(0)}K</p></div>
            </div>
          ))}
        </div>
        <div className="glass-card p-6">
          <h4 className="text-sm font-medium text-[var(--accent-red)] uppercase tracking-wider mb-3">Bottom 5: Destruyen Valor</h4>
          {sorted.slice(-5).reverse().map((c, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5">
              <span className="text-xs text-[var(--text-muted)] w-4">{i + 1}</span>
              <div className="flex-1"><p className="text-xs font-medium">{c.name.replace('VIRAL_DEAL_', '')}</p><p className="text-[10px] text-[var(--text-muted)]">{c.date} | {c.multiplier.toFixed(0)}x mult</p></div>
              <div className="text-right"><p className="text-xs font-bold text-[var(--accent-red)]">{c.netIncremental >= 0 ? '+' : ''}${(c.netIncremental / 1000).toFixed(0)}K</p></div>
            </div>
          ))}
        </div>
      </div>

      {/* Discount Breakdown by Source */}
      {data.discountBreakdown && (
        <div className="glass-card p-6">
          <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Inversión en Descuento: ¿Quién Paga?</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Commercial', value: data.discountBreakdown.commercial, color: '#F97316', desc: 'Acuerdos comerciales' },
              { label: 'Makers', value: data.discountBreakdown.makers, color: '#8B5CF6', desc: 'Inversión del fabricante' },
              { label: 'Monetización', value: data.discountBreakdown.monetization, color: '#3B82F6', desc: 'Monetization / Ads' },
              { label: 'Blackbox', value: data.discountBreakdown.blackbox, color: '#6B7280', desc: 'Algoritmo de pricing' },
              { label: 'Rappi', value: data.discountBreakdown.rappi, color: '#EF4444', desc: 'Inversión Rappi directa' },
              { label: 'Partners', value: data.discountBreakdown.partners, color: '#10B981', desc: 'Socios comerciales' },
              { label: 'Shrinkage', value: data.discountBreakdown.shrinkage, color: '#FBBF24', desc: 'Merma / ajustes' },
            ].filter(d => d.value > 0).sort((a, b) => b.value - a.value).map((d, i) => (
              <div key={i} className="p-3 bg-white/5 rounded-lg text-center" style={{ borderTop: `3px solid ${d.color}` }}>
                <p className="text-lg font-bold text-[var(--foreground)]">${(d.value / 1000).toFixed(0)}K</p>
                <p className="text-[10px] font-medium" style={{ color: d.color }}>{d.label}</p>
                <p className="text-[10px] text-[var(--text-muted)]">{d.desc}</p>
                <p className="text-[10px] text-[var(--text-muted)]">{kpis.totalDiscount > 0 ? ((d.value / kpis.totalDiscount) * 100).toFixed(0) : 0}% del total</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-3 p-2 bg-white/5 rounded">
            Total invertido: ${(kpis.totalDiscount / 1000000).toFixed(2)}M. {data.discountBreakdown.rappi === 0 ? 'Rappi no invierte directamente en descuentos — 100% financiado por makers/partners.' : `Rappi invierte $${(data.discountBreakdown.rappi / 1000).toFixed(0)}K (${((data.discountBreakdown.rappi / kpis.totalDiscount) * 100).toFixed(0)}% del total).`}
          </p>
        </div>
      )}

      {/* AI Verdict */}
      {aiVerdict && (
        <div className="glass-card p-6 border-l-4 border-l-[var(--accent-purple)]">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-[var(--accent-purple)]" />
            <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider">Análisis IA (Cortex)</h4>
          </div>
          <div className="whitespace-pre-wrap text-sm text-[var(--foreground)] leading-relaxed">{aiVerdict}</div>
        </div>
      )}
    </div>
  );
}
