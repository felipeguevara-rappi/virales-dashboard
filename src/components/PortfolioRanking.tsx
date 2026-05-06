'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line } from 'recharts';
import { Trophy, TrendingDown, Minus } from 'lucide-react';

interface PortfolioItem {
  campaignName: string;
  date: string;
  gmv: number;
  discountInvestment: number;
  roi: number;
  orders: number;
  units: number;
}

interface TrendItem {
  month: string;
  totalGmv: number;
  totalDiscount: number;
  avgRoi: number;
  campaigns: number;
}

interface PortfolioRankingProps {
  portfolio: PortfolioItem[];
  trends: TrendItem[];
  loading: boolean;
}

function getRoiColor(roi: number): string {
  if (roi >= 5) return '#10B981';
  if (roi >= 3) return '#F97316';
  if (roi >= 1.5) return '#EAB308';
  return '#EF4444';
}

function getRoiLabel(roi: number): string {
  if (roi >= 5) return 'Excelente';
  if (roi >= 3) return 'Bueno';
  if (roi >= 1.5) return 'Regular';
  return 'Ineficiente';
}

export default function PortfolioRanking({ portfolio, trends, loading }: PortfolioRankingProps) {
  if (loading) {
    return (
      <div className="glass-card p-6 h-[500px] flex items-center justify-center">
        <div className="animate-pulse text-[var(--text-muted)]">Cargando portafolio...</div>
      </div>
    );
  }

  if (portfolio.length === 0) {
    return (
      <div className="glass-card p-6 h-[300px] flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Sin datos de portafolio</p>
      </div>
    );
  }

  // Sort by ROI descending
  const sorted = [...portfolio].filter(p => p.gmv > 0).sort((a, b) => b.roi - a.roi);
  const topPerformers = sorted.slice(0, 5);
  const worstPerformers = sorted.slice(-5).reverse();

  // Trend chart data
  const trendChartData = trends.map(t => ({
    month: t.month.slice(5), // "01", "02", etc.
    'GMV ($K)': Math.round(t.totalGmv / 1000),
    'Descuento ($K)': Math.round(t.totalDiscount / 1000),
    'ROI': Math.round(t.avgRoi * 10) / 10,
  }));

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-gradient-orange">{portfolio.length}</p>
          <p className="text-xs text-[var(--text-muted)]">Campañas Totales</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-[var(--foreground)]">${(portfolio.reduce((s, p) => s + p.gmv, 0) / 1000000).toFixed(1)}M</p>
          <p className="text-xs text-[var(--text-muted)]">GMV Total Generado</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-[var(--accent-red)]">${(portfolio.reduce((s, p) => s + p.discountInvestment, 0) / 1000000).toFixed(1)}M</p>
          <p className="text-xs text-[var(--text-muted)]">Inversión en Descuento</p>
        </div>
        <div className="glass-card p-4 text-center">
          {(() => {
            const totalGmv = portfolio.reduce((s, p) => s + p.gmv, 0);
            const totalDisc = portfolio.reduce((s, p) => s + p.discountInvestment, 0);
            const avgRoi = totalDisc > 0 ? totalGmv / totalDisc : 0;
            return <p className="text-2xl font-bold" style={{ color: getRoiColor(avgRoi) }}>{avgRoi.toFixed(1)}x</p>;
          })()}
          <p className="text-xs text-[var(--text-muted)]">ROI Promedio</p>
        </div>
      </div>

      {/* Monthly Evolution */}
      <div className="glass-card p-6">
        <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">
          Evolución Mensual: GMV vs Inversión
        </h4>
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={trendChartData} margin={{ top: 10, right: 50, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="month" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
            <YAxis yAxisId="left" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={(v) => `$${v}K`} />
            <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={(v) => `${v}x`} />
            <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }} />
            <Legend formatter={(value) => <span className="text-xs">{value}</span>} />
            <Bar yAxisId="left" dataKey="GMV ($K)" fill="#10B981" radius={[4, 4, 0, 0]} opacity={0.8} />
            <Bar yAxisId="left" dataKey="Descuento ($K)" fill="#EF4444" radius={[4, 4, 0, 0]} opacity={0.6} />
            <Line yAxisId="right" type="monotone" dataKey="ROI" stroke="#F97316" strokeWidth={2.5} dot={{ r: 4, fill: '#F97316' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Top & Worst Performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-4 h-4 text-[var(--accent-green)]" />
            <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider">Top 5 Campañas</h4>
          </div>
          <div className="space-y-2">
            {topPerformers.map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
                <span className="text-xs text-[var(--text-muted)] w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[var(--foreground)] truncate">{p.campaignName.replace('VIRAL_DEAL_', '')}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{p.date} | GMV ${(p.gmv / 1000).toFixed(0)}K</p>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: `${getRoiColor(p.roi)}20`, color: getRoiColor(p.roi) }}>
                  {p.roi.toFixed(1)}x
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-4 h-4 text-[var(--accent-red)]" />
            <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider">Campañas a Revisar</h4>
          </div>
          <div className="space-y-2">
            {worstPerformers.map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
                <Minus className="w-3 h-3 text-[var(--accent-red)]" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[var(--foreground)] truncate">{p.campaignName.replace('VIRAL_DEAL_', '')}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{p.date} | Desc ${(p.discountInvestment / 1000).toFixed(0)}K</p>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: `${getRoiColor(p.roi)}20`, color: getRoiColor(p.roi) }}>
                  {p.roi > 0 ? `${p.roi.toFixed(1)}x` : getRoiLabel(p.roi)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
