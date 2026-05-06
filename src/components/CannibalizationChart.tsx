'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from 'recharts';
import { TrendingUp, Zap } from 'lucide-react';
import { CannibalizationPoint } from '@/lib/types';

interface CannibalizationChartProps {
  data: CannibalizationPoint[];
  baselineAvgGmv: number;
  incrementalGmv: number;
  viralMultiplier: number;
  postViralVsBaseline: number;
  loading: boolean;
}

export default function CannibalizationChart({ data, baselineAvgGmv, incrementalGmv, viralMultiplier, postViralVsBaseline, loading }: CannibalizationChartProps) {
  if (loading) {
    return (
      <div className="glass-card p-6 h-[450px] flex items-center justify-center">
        <div className="animate-pulse text-[var(--text-muted)]">Cargando análisis de canibalización...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="glass-card p-6 h-[300px] flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Selecciona una campaña para ver el análisis</p>
      </div>
    );
  }

  // Normalize: express everything as % of baseline
  const chartData = data.map(d => ({
    ...d,
    gmvNormalized: baselineAvgGmv > 0 ? (d.gmv / baselineAvgGmv) * 100 : 0,
    baseline: 100,
  }));

  const hasCannibalization = postViralVsBaseline < -5; // more than 5% drop = cannibalization

  return (
    <div className="space-y-4">
      {/* Incrementality KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4 text-center">
          <Zap className="w-5 h-5 mx-auto mb-2 text-[var(--accent-orange)]" />
          <p className="text-xl font-bold text-gradient-orange">${(incrementalGmv / 1000).toFixed(0)}K</p>
          <p className="text-xs text-[var(--text-muted)]">GMV Incremental</p>
          <p className="text-[10px] text-[var(--text-muted)]">vs baseline de ${(baselineAvgGmv / 1000).toFixed(0)}K/día</p>
        </div>
        <div className="glass-card p-4 text-center">
          <TrendingUp className="w-5 h-5 mx-auto mb-2 text-[var(--accent-purple)]" />
          <p className="text-xl font-bold text-gradient-purple">{viralMultiplier.toFixed(1)}x</p>
          <p className="text-xs text-[var(--text-muted)]">Multiplicador vs Baseline</p>
          <p className="text-[10px] text-[var(--text-muted)]">venta día viral / promedio normal</p>
        </div>
        <div className="glass-card p-4 text-center">
          <div className={`w-5 h-5 mx-auto mb-2 rounded-full flex items-center justify-center ${hasCannibalization ? 'bg-[var(--accent-red)]/20' : 'bg-[var(--accent-green)]/20'}`}>
            <span className="text-xs">{hasCannibalization ? '⚠' : '✓'}</span>
          </div>
          <p className={`text-xl font-bold ${hasCannibalization ? 'text-[var(--accent-red)]' : 'text-[var(--accent-green)]'}`}>
            {postViralVsBaseline >= 0 ? '+' : ''}{postViralVsBaseline.toFixed(1)}%
          </p>
          <p className="text-xs text-[var(--text-muted)]">Post-Viral vs Baseline</p>
          <p className="text-[10px] text-[var(--text-muted)]">
            {hasCannibalization ? 'Hay canibalización' : 'Sin canibalización detectada'}
          </p>
        </div>
      </div>

      {/* Main Chart */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider">
            GMV Diario Normalizado (Baseline = 100%)
          </h4>
          <span className="text-xs text-[var(--text-muted)]">T-28 a T+6</span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="gmvGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F97316" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="dayIndex"
              stroke="rgba(255,255,255,0.3)"
              tick={{ fill: '#9CA3AF', fontSize: 10 }}
              tickFormatter={(v) => v === 0 ? 'VIRAL' : `T${v > 0 ? '+' : ''}${v}`}
            />
            <YAxis
              stroke="rgba(255,255,255,0.3)"
              tick={{ fill: '#9CA3AF', fontSize: 10 }}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }}
              formatter={(value, name) => {
                if (name === 'gmvNormalized') return [`${Number(value).toFixed(0)}% del baseline`, 'GMV'];
                return [`${value}%`, 'Baseline'];
              }}
              labelFormatter={(label) => `Día T${Number(label) >= 0 ? '+' : ''}${label}`}
            />
            <ReferenceLine y={100} stroke="rgba(255,255,255,0.4)" strokeDasharray="5 5" />
            <ReferenceLine x={0} stroke="var(--accent-orange)" strokeWidth={2} strokeDasharray="3 3" />
            <Area type="monotone" dataKey="gmvNormalized" fill="url(#gmvGradient)" stroke="none" />
            <Line
              type="monotone"
              dataKey="gmvNormalized"
              stroke="var(--accent-orange)"
              strokeWidth={2.5}
              dot={(props) => {
                const { cx, cy, payload } = props;
                if (payload.dayIndex === 0) {
                  return <circle cx={cx} cy={cy} r={6} fill="#F97316" stroke="#fff" strokeWidth={2} />;
                }
                return <circle cx={cx} cy={cy} r={0} />;
              }}
              activeDot={{ r: 4, fill: '#F97316' }}
            />
            <Line type="monotone" dataKey="baseline" stroke="rgba(255,255,255,0.3)" strokeDasharray="5 5" strokeWidth={1} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
