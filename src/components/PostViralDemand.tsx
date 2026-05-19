'use client';

import { useMemo } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, BarChart, Bar, Area, Line, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Activity, Users } from 'lucide-react';

interface StockeoAnalysis {
  viralBefore: number;
  viralAfter: number;
  viralChange: number;
  controlBefore: number;
  controlAfter: number;
  controlChange: number;
  isStockeo: boolean;
}

interface PostDemandData {
  data: { dayIndex: number; gmv: number; units: number; users: number; orders: number }[];
  baseline: { gmv: number; units: number; users: number };
  postViral: { avgGmv: number; avgUnits: number; avgUsers: number };
  incrementalFromViral: number;
  sustainedUplift: number;
  daysToNormalize: number | null;
  isJustAPeak: boolean;
  stockeoAnalysis?: StockeoAnalysis;
}

interface PostViralDemandProps {
  data: PostDemandData | null;
  loading: boolean;
}

export default function PostViralDemand({ data, loading }: PostViralDemandProps) {
  if (loading) {
    return <div className="glass-card p-6 h-[400px] flex items-center justify-center"><div className="animate-pulse text-[var(--text-muted)]">Analizando demanda post-viral...</div></div>;
  }
  if (!data || data.data.length === 0) {
    return <div className="glass-card p-6 h-[300px] flex items-center justify-center"><p className="text-[var(--text-muted)]">Selecciona una campaña</p></div>;
  }

  const chartData = useMemo(() => data.data.map(d => ({
    dayIndex: d.dayIndex,
    gmvPct: data.baseline.gmv > 0 ? (d.gmv / data.baseline.gmv) * 100 : 0,
    usersPct: data.baseline.users > 0 ? (d.users / data.baseline.users) * 100 : 0,
  })), [data.data, data.baseline.gmv, data.baseline.users]);

  const verdict = data.isJustAPeak;
  const uplift = data.sustainedUplift;
  const stockeo = data.stockeoAnalysis;

  // Stockeo comparison chart data
  const stockeoChartData = useMemo(() => stockeo ? [
    { group: 'Viral', '7d Antes': stockeo.viralBefore, '7d Después': stockeo.viralAfter },
    { group: 'Control', '7d Antes': stockeo.controlBefore, '7d Después': stockeo.controlAfter },
  ] : [], [stockeo]);

  return (
    <div className="space-y-4">
      {/* Verdict Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`glass-card p-4 text-center ${verdict ? 'border-l-4 border-l-[var(--accent-red)]' : 'border-l-4 border-l-[var(--accent-green)]'}`}>
          <Activity className={`w-5 h-5 mx-auto mb-2 ${verdict ? 'text-[var(--accent-red)]' : 'text-[var(--accent-green)]'}`} />
          <p className={`text-lg font-bold ${verdict ? 'text-[var(--accent-red)]' : 'text-[var(--accent-green)]'}`}>
            {verdict ? 'Solo un Pico' : 'Demanda Sostenida'}
          </p>
          <p className="text-xs text-[var(--text-muted)]">{verdict ? 'Volvió a niveles normales' : `+${uplift.toFixed(0)}% sobre baseline`}</p>
        </div>
        <div className="glass-card p-4 text-center">
          {data.daysToNormalize ? (
            <><TrendingDown className="w-5 h-5 mx-auto mb-2 text-[var(--accent-orange)]" /><p className="text-lg font-bold text-[var(--accent-orange)]">{data.daysToNormalize} días</p><p className="text-xs text-[var(--text-muted)]">para normalizar</p></>
          ) : (
            <><TrendingUp className="w-5 h-5 mx-auto mb-2 text-[var(--accent-green)]" /><p className="text-lg font-bold text-[var(--accent-green)]">No normaliza</p><p className="text-xs text-[var(--text-muted)]">Sigue arriba del baseline</p></>
          )}
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-lg font-bold text-[var(--foreground)]">{uplift >= 0 ? '+' : ''}{uplift.toFixed(0)}%</p>
          <p className="text-xs text-[var(--text-muted)]">Post-Viral vs Baseline</p>
          <p className="text-[10px] text-[var(--text-muted)]">${(data.postViral.avgGmv / 1000).toFixed(0)}K/día vs ${(data.baseline.gmv / 1000).toFixed(0)}K/día</p>
        </div>
      </div>

      {/* Demand Chart */}
      <div className="glass-card p-6">
        <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Demanda Normalizada (T-14 a T+14)</h4>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="postGmvGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="dayIndex" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={(v) => v === 0 ? 'VIRAL' : `T${v > 0 ? '+' : ''}${v}`} />
            <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
            <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }} formatter={(value, name) => [`${Number(value).toFixed(0)}%`, name === 'gmvPct' ? 'GMV' : 'Usuarios']} labelFormatter={(l) => `T${Number(l) >= 0 ? '+' : ''}${l}`} />
            <ReferenceLine y={100} stroke="rgba(255,255,255,0.3)" strokeDasharray="5 5" />
            <ReferenceLine x={0} stroke="var(--accent-orange)" strokeWidth={2} strokeDasharray="3 3" />
            <Area type="monotone" dataKey="gmvPct" fill="url(#postGmvGrad)" stroke="none" />
            <Line type="monotone" dataKey="gmvPct" stroke="#10B981" strokeWidth={2} dot={false} name="GMV" />
            <Line type="monotone" dataKey="usersPct" stroke="#8B5CF6" strokeWidth={2} dot={false} name="Usuarios" strokeDasharray="4 2" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Stockeo Analysis */}
      {stockeo && stockeo.viralBefore > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-[var(--accent-purple)]" />
            <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider">
              Test de Stockeo: ¿Los usuarios se abastecieron y dejaron de comprar?
            </h4>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stockeoChartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="group" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                  <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }} />
                  <Bar dataKey="7d Antes" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="7d Después" fill="#F97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col justify-center space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">Viral (7d antes → después)</span>
                <span className={`text-sm font-bold ${stockeo.viralChange < 0 ? 'text-[var(--accent-red)]' : 'text-[var(--accent-green)]'}`}>
                  {stockeo.viralChange >= 0 ? '+' : ''}{stockeo.viralChange.toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">Control (7d antes → después)</span>
                <span className={`text-sm font-bold ${stockeo.controlChange < 0 ? 'text-[var(--accent-red)]' : 'text-[var(--accent-green)]'}`}>
                  {stockeo.controlChange >= 0 ? '+' : ''}{stockeo.controlChange.toFixed(0)}%
                </span>
              </div>
              <div className="pt-2 border-t border-white/10">
                <p className={`text-xs font-medium ${stockeo.isStockeo ? 'text-[var(--accent-red)]' : 'text-[var(--accent-green)]'}`}>
                  {stockeo.isStockeo 
                    ? 'Evidencia de stockeo: viral cae significativamente más que control'
                    : 'Sin evidencia de stockeo: ambos grupos caen similar (patrón calendario)'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
