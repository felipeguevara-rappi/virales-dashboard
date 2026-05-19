'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Scale, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface DemandShiftData {
  pre: { units: number; gmv: number; days: number; dailyAvgUnits: number; dailyAvgGmv: number };
  viral: { units: number; gmv: number };
  post: { units: number; gmv: number; days: number; dailyAvgUnits: number; dailyAvgGmv: number };
  total: { actualUnits: number; actualGmv: number; expectedUnits: number; expectedGmv: number; days: number };
  netUnitsImpact: number;
  netGmvImpact: number;
  netUnitsPct: number;
  netGmvPct: number;
  postDeclinePct: number;
  verdict: string;
}

interface DemandShiftAnalysisProps {
  data: DemandShiftData | null;
  loading: boolean;
  discountSpend: number;
}

export default function DemandShiftAnalysis({ data, loading, discountSpend }: DemandShiftAnalysisProps) {
  if (loading) return <div className="glass-card p-6 h-[300px] flex items-center justify-center"><div className="animate-pulse text-[var(--text-muted)]">Analizando demand shift...</div></div>;
  if (!data || !data.total) return <div className="glass-card p-6 h-[200px] flex items-center justify-center"><p className="text-[var(--text-muted)]">{data?.verdict ? `Veredicto: ${data.verdict} (${data.netUnitsPct?.toFixed(1)}%)` : 'Selecciona una campaña'}</p></div>;

  const VerdictIcon = data.verdict === 'GENERATION' ? TrendingUp : data.verdict === 'DESTRUCTION' ? TrendingDown : Minus;
  const verdictColor = data.verdict === 'GENERATION' ? '#10B981' : data.verdict === 'DESTRUCTION' ? '#EF4444' : '#F97316';
  const verdictText = data.verdict === 'GENERATION' ? 'Generación Neta' : data.verdict === 'DESTRUCTION' ? 'Destrucción de Demanda' : 'Demand Shift (Neutro)';
  const verdictDesc = data.verdict === 'GENERATION' ? 'El viral generó más unidades de las esperadas' : data.verdict === 'DESTRUCTION' ? 'El viral concentró demanda pero se perdieron unidades netas' : 'El viral concentró ~30d de venta en 1 día. No genera ni destruye — solo mueve en el tiempo.';

  // Comparison chart: actual vs expected
  const comparisonData = useMemo(() => [
    { name: 'Esperado sin viral', units: Math.round(data.total.expectedUnits / 1000), fill: '#6B7280' },
    { name: 'Real (con viral)', units: Math.round(data.total.actualUnits / 1000), fill: verdictColor },
  ], [data.total.expectedUnits, data.total.actualUnits, verdictColor]);

  // Period breakdown
  const periodData = useMemo(() => [
    { name: 'Pre-30d\n(diario)', value: Math.round(data.pre.dailyAvgUnits), fill: '#8B5CF6' },
    { name: 'Día Viral', value: Math.round(data.viral.units), fill: '#F97316' },
    { name: 'Post-30d\n(diario)', value: Math.round(data.post.dailyAvgUnits), fill: data.postDeclinePct < -10 ? '#EF4444' : '#10B981' },
  ], [data.pre.dailyAvgUnits, data.viral.units, data.post.dailyAvgUnits, data.postDeclinePct]);

  // True cost of the viral
  const trueCost = data.netUnitsImpact <= 0 && discountSpend > 0
    ? `El descuento de $${(discountSpend / 1000).toFixed(0)}K se aplicó sobre venta que hubiera ocurrido de todos modos`
    : `El viral generó ${data.netUnitsImpact.toLocaleString()} unidades extra netas`;

  return (
    <div className="space-y-4">
      {/* Verdict Banner */}
      <div className="glass-card p-5" style={{ borderLeft: `4px solid ${verdictColor}` }}>
        <div className="flex items-start gap-3">
          <VerdictIcon className="w-6 h-6 flex-shrink-0 mt-0.5" style={{ color: verdictColor }} />
          <div>
            <h4 className="text-sm font-bold text-[var(--foreground)]">{verdictText}</h4>
            <p className="text-xs text-[var(--text-muted)] mt-1">{verdictDesc}</p>
            <p className="text-xs text-[var(--text-muted)] mt-2 italic">{trueCost}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Total period comparison */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Scale className="w-4 h-4 text-[var(--accent-purple)]" />
            <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider">Balance Total ({data.total.days}d con viral incluido)</h4>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={comparisonData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
              <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={(v) => `${v}K`} />
              <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }} formatter={(value) => [`${Number(value)}K unidades`, '']} />
              <Bar dataKey="units" radius={[6, 6, 0, 0]}>
                {comparisonData.map((entry, i) => <Cell key={`c-${i}`} fill={entry.fill} opacity={0.8} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 grid grid-cols-2 gap-3 text-center">
            <div><p className="text-xs text-[var(--text-muted)]">Net Units</p><p className={`text-lg font-bold ${data.netUnitsImpact >= 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>{data.netUnitsImpact >= 0 ? '+' : ''}{data.netUnitsImpact.toLocaleString()}</p><p className="text-[10px] text-[var(--text-muted)]">({data.netUnitsPct >= 0 ? '+' : ''}{data.netUnitsPct.toFixed(1)}%)</p></div>
            <div><p className="text-xs text-[var(--text-muted)]">Net GMV</p><p className={`text-lg font-bold ${data.netGmvImpact >= 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>{data.netGmvImpact >= 0 ? '+' : ''}${(data.netGmvImpact / 1000).toFixed(0)}K</p><p className="text-[10px] text-[var(--text-muted)]">({data.netGmvPct >= 0 ? '+' : ''}{data.netGmvPct.toFixed(1)}%)</p></div>
          </div>
        </div>

        {/* Daily rate comparison */}
        <div className="glass-card p-6">
          <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Velocidad de Venta (units/día)</h4>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={periodData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 9 }} />
              <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }} formatter={(value) => [`${Number(value).toLocaleString()} units`, '']} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {periodData.map((entry, i) => <Cell key={`p-${i}`} fill={entry.fill} opacity={0.8} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 text-center">
            <p className={`text-sm font-medium ${data.postDeclinePct < -10 ? 'text-[var(--accent-red)]' : 'text-[var(--accent-green)]'}`}>
              Post-viral: {data.postDeclinePct >= 0 ? '+' : ''}{data.postDeclinePct.toFixed(0)}% vs pre-viral
            </p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              {data.postDeclinePct < -10 ? 'La venta diaria cayó significativamente después del viral' : 'La venta diaria se mantuvo estable'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
