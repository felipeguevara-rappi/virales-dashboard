'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ShoppingBag, Layers, AlertTriangle } from 'lucide-react';

interface CrossBasketData {
  totalViralUsers: number;
  usersWithCompanion: number;
  companionPenetration: number;
  totalCompanionGmv: number;
  gmvHabitual: number;
  gmvNewCategory: number;
  trueCrossSellPct: number;
  habitualPct: number;
  totalCategories: number;
  newCategories: number;
  topCategories: { category: string; orders: number; gmv: number }[];
}

interface CrossBasketAnalysisProps {
  data: CrossBasketData | null;
  loading: boolean;
}

export default function CrossBasketAnalysis({ data, loading }: CrossBasketAnalysisProps) {
  if (loading) {
    return <div className="glass-card p-6 h-[300px] flex items-center justify-center"><div className="animate-pulse text-[var(--text-muted)]">Analizando cross-basket...</div></div>;
  }
  if (!data) {
    return <div className="glass-card p-6 h-[200px] flex items-center justify-center"><p className="text-[var(--text-muted)]">Selecciona una campaña</p></div>;
  }

  // Stacked bar for GMV breakdown
  const breakdownData = [
    { name: 'Companion GMV', habitual: Math.round(data.gmvHabitual / 1000), nuevo: Math.round(data.gmvNewCategory / 1000) },
  ];

  const catChartData = data.topCategories.slice(0, 6).map(c => ({
    category: c.category?.length > 18 ? c.category.slice(0, 18) + '...' : c.category,
    gmv: Math.round(c.gmv / 1000),
  }));

  return (
    <div className="space-y-4">
      {/* Reality Check */}
      <div className="glass-card p-5 border-l-4 border-l-[var(--accent-orange)]">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[var(--accent-orange)] mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-[var(--foreground)] mb-1">Cross-Basket: Contexto Importante</h4>
            <p className="text-xs text-[var(--text-muted)]">
              De los <span className="text-[var(--accent-purple)] font-medium">${(data.totalCompanionGmv / 1000).toFixed(0)}K</span> en productos companion,
              el <span className="text-[var(--accent-red)] font-medium">{data.habitualPct.toFixed(0)}%</span> (${ (data.gmvHabitual / 1000).toFixed(0)}K) son categorías que el usuario <strong>ya compraba antes</strong> del viral.
              Solo el <span className="text-[var(--accent-green)] font-medium">{data.trueCrossSellPct.toFixed(0)}%</span> (${ (data.gmvNewCategory / 1000).toFixed(0)}K) son categorías nuevas para el usuario.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card p-4 text-center">
          <ShoppingBag className="w-4 h-4 mx-auto mb-1 text-[var(--accent-purple)]" />
          <p className="text-xl font-bold text-[var(--foreground)]">{data.companionPenetration.toFixed(0)}%</p>
          <p className="text-[10px] text-[var(--text-muted)]">Órdenes con companion</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-xl font-bold text-[var(--accent-green)]">${(data.gmvNewCategory / 1000).toFixed(0)}K</p>
          <p className="text-[10px] text-[var(--text-muted)]">True Cross-Sell (cat. nueva)</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-xl font-bold text-[var(--text-muted)]">${(data.gmvHabitual / 1000).toFixed(0)}K</p>
          <p className="text-[10px] text-[var(--text-muted)]">Compra habitual (no atribuible)</p>
        </div>
        <div className="glass-card p-4 text-center">
          <Layers className="w-4 h-4 mx-auto mb-1 text-[var(--accent-orange)]" />
          <p className="text-xl font-bold text-[var(--foreground)]">{data.newCategories}/{data.totalCategories}</p>
          <p className="text-[10px] text-[var(--text-muted)]">Categorías nuevas/total</p>
        </div>
      </div>

      {/* GMV Breakdown Visual */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-6">
          <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Desglose Companion GMV</h4>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={breakdownData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
              <XAxis type="number" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={(v) => `$${v}K`} />
              <YAxis type="category" dataKey="name" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 10 }} width={100} />
              <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }} formatter={(value) => [`$${Number(value)}K`, '']} />
              <Bar dataKey="habitual" stackId="a" fill="#6B7280" name="Habitual (no atribuible)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="nuevo" stackId="a" fill="#10B981" name="True Cross-Sell" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 justify-center">
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-[#6B7280]" /><span className="text-[10px] text-[var(--text-muted)]">Habitual</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-[#10B981]" /><span className="text-[10px] text-[var(--text-muted)]">Cross-Sell Real</span></div>
          </div>
        </div>

        {/* Top Categories */}
        {catChartData.length > 0 && (
          <div className="glass-card p-6">
            <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Top Categorías Companion ($K)</h4>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={catChartData} layout="vertical" margin={{ top: 0, right: 20, left: 80, bottom: 0 }}>
                <XAxis type="number" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 9 }} tickFormatter={(v) => `$${v}K`} />
                <YAxis type="category" dataKey="category" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 9 }} width={80} />
                <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }} formatter={(value) => [`$${Number(value)}K`, '']} />
                <Bar dataKey="gmv" radius={[0, 4, 4, 0]}>
                  {catChartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#F97316' : index < 3 ? '#8B5CF6' : '#6B7280'} opacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
