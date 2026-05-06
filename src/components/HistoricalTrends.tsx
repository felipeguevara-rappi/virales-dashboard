'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface HistoricalTrend {
  month: string;
  avgCac: number;
  avgRetention30d: number;
}

interface HistoricalTrendsProps {
  data: HistoricalTrend[];
  loading: boolean;
}

export default function HistoricalTrends({ data, loading }: HistoricalTrendsProps) {
  if (loading) {
    return (
      <div className="glass-card p-6 h-[350px] flex items-center justify-center">
        <div className="animate-pulse text-[var(--text-muted)]">Cargando tendencias...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="glass-card p-6 h-[350px] flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Sin datos históricos</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <h3 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">
        Tendencias Históricas del Programa
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="month"
            stroke="rgba(255,255,255,0.3)"
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
          />
          <YAxis
            yAxisId="left"
            stroke="rgba(255,255,255,0.3)"
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="rgba(255,255,255,0.3)"
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              background: '#1E293B',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px',
              color: '#F8FAFC',
            }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            formatter={(value) => <span className="text-xs">{value}</span>}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="avgCac"
            stroke="var(--accent-orange)"
            strokeWidth={2}
            dot={{ r: 3, fill: '#F97316' }}
            name="CAC Promedio"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="avgRetention30d"
            stroke="var(--accent-purple)"
            strokeWidth={2}
            dot={{ r: 3, fill: '#8B5CF6' }}
            name="Retención 30d %"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
