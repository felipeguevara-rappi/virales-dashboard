'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AlertTriangle, Package, MapPin } from 'lucide-react';

interface CityData {
  city: string;
  whCount: number;
  stockBefore: number;
  stockAfter: number;
  stockDayAfter: number;
}

interface OperationsData {
  totalWarehouses: number;
  whWithStockout: number;
  totalProductsWithStock: number;
  totalProductsSoldOut: number;
  mixAffectedPct: number;
  mixFullCoveragePct: number;
  totalOpening: number;
  totalClosing: number;
  unitsSold: number;
  cityBreakdown: CityData[];
  // New operational metrics
  liveStock?: number;
  sellThroughPct?: number;
  soldoutProducts?: number;
  share180dPct?: number;
  discountDetail?: { rappi: number; makers: number; commercial: number; partners: number; shrinkage: number; blackbox: number; monetization: number };
  operationalCoverage?: number;
}

interface OperationsAnalysisProps {
  data: OperationsData | null;
  loading: boolean;
}

export default function OperationsAnalysis({ data, loading }: OperationsAnalysisProps) {
  if (loading) {
    return (
      <div className="glass-card p-6 h-[400px] flex items-center justify-center">
        <div className="animate-pulse text-[var(--text-muted)]">Analizando operaciones...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="glass-card p-6 h-[300px] flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Selecciona una campaña para ver análisis operativo</p>
      </div>
    );
  }

  // Waterfall using actual units sold
  const waterfallData = [
    { name: 'Stock Inicial', value: data.totalOpening, fill: '#3B82F6' },
    { name: 'Unidades Vendidas', value: data.unitsSold, fill: '#F97316' },
    { name: 'Stock Final', value: data.totalClosing, fill: data.totalClosing > 0 ? '#10B981' : '#EF4444' },
  ];

  const coveragePct = data.operationalCoverage || data.mixFullCoveragePct || 0;
  const sellThroughRate = data.sellThroughPct || (data.totalOpening > 0 ? (data.unitsSold / data.totalOpening) * 100 : 0);

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="w-8 h-8 rounded-lg gradient-red mx-auto mb-2 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <p className="text-2xl font-bold text-[var(--accent-red)]">{data.whWithStockout}</p>
          <p className="text-xs text-[var(--text-muted)]">Warehouses con Ruptura</p>
          <p className="text-[10px] text-[var(--text-muted)]">de {data.totalWarehouses} activos</p>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="w-8 h-8 rounded-lg gradient-purple mx-auto mb-2 flex items-center justify-center">
            <Package className="w-4 h-4 text-white" />
          </div>
          <p className="text-2xl font-bold text-[var(--accent-purple)]">{data.soldoutProducts || data.totalProductsSoldOut}</p>
          <p className="text-xs text-[var(--text-muted)]">SKUs Agotados (24h)</p>
          <p className="text-[10px] text-[var(--text-muted)]">Sell-Through: {sellThroughRate.toFixed(0)}%</p>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="w-8 h-8 rounded-lg gradient-green mx-auto mb-2 flex items-center justify-center">
            <Package className="w-4 h-4 text-white" />
          </div>
          <p className="text-2xl font-bold text-[var(--accent-green)]">{data.unitsSold.toLocaleString()}</p>
          <p className="text-xs text-[var(--text-muted)]">Unidades Vendidas</p>
          <p className="text-[10px] text-[var(--text-muted)]">en el día del viral</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Coverage Gauge */}
        <div className="glass-card p-6">
          <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">
            Cobertura Operativa (Mix de Órdenes)
          </h4>
          <div className="relative pt-2">
            <div className="flex mb-2 items-center justify-between">
              <span className="text-xs font-medium text-[var(--accent-green)]">Disponibilidad completa</span>
              <span className="text-xs font-medium text-[var(--foreground)]">{coveragePct.toFixed(1)}%</span>
            </div>
            <div className="overflow-hidden h-6 rounded-full bg-white/5">
              <div style={{ width: `${coveragePct}%` }} className="h-full rounded-full gradient-green transition-all duration-1000" />
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-[var(--text-muted)]">
              <span>0%</span>
              <span className="text-[var(--accent-red)]">Afectado: {data.mixAffectedPct}%</span>
              <span>100%</span>
            </div>
          </div>
          {data.whWithStockout > 0 && (
            <p className="text-xs text-[var(--text-muted)] mt-4 p-3 bg-[var(--accent-red)]/5 rounded-lg border border-[var(--accent-red)]/20">
              {data.whWithStockout} warehouses agotaron al menos 1 producto, impactando el {data.mixAffectedPct}% del mix.
            </p>
          )}
          <div className="mt-4 pt-3 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--text-muted)]">Sell-Through Rate</span>
              <span className={`text-sm font-bold ${sellThroughRate > 50 ? 'text-[var(--accent-red)]' : sellThroughRate > 25 ? 'text-[var(--accent-orange)]' : 'text-[var(--accent-green)]'}`}>{sellThroughRate.toFixed(0)}%</span>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              {sellThroughRate > 50 ? 'Alto sell-through: se necesitaba más stock' : sellThroughRate > 25 ? 'Sell-through moderado: stock adecuado' : 'Bajo sell-through: sobró mucho stock'}
            </p>
          </div>
        </div>

        {/* Stock Waterfall */}
        <div className="glass-card p-6">
          <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">
            Stock vs Ventas (Día del Viral)
          </h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={waterfallData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
              <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
              <Tooltip
                contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }}
                formatter={(value) => [`${Number(value).toLocaleString()} unidades`, '']}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {waterfallData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* City Breakdown */}
      {data.cityBreakdown && data.cityBreakdown.length > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-[var(--accent-purple)]" />
            <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider">
              Stock por Ciudad (Antes → Viral → Día Después)
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 text-xs text-[var(--text-muted)] font-medium">Ciudad</th>
                  <th className="text-center py-2 text-xs text-[var(--text-muted)] font-medium">WH</th>
                  <th className="text-right py-2 text-xs text-[var(--text-muted)] font-medium">T-1 (Antes)</th>
                  <th className="text-right py-2 text-xs text-[var(--text-muted)] font-medium">T+0 (Viral)</th>
                  <th className="text-right py-2 text-xs text-[var(--text-muted)] font-medium">T+1 (Después)</th>
                  <th className="text-right py-2 text-xs text-[var(--text-muted)] font-medium">Cambio</th>
                </tr>
              </thead>
              <tbody>
                {data.cityBreakdown.map((city, i) => {
                  const change = city.stockBefore > 0 ? ((city.stockAfter - city.stockBefore) / city.stockBefore * 100) : 0;
                  return (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 text-xs text-[var(--foreground)] font-medium">{city.city}</td>
                      <td className="py-2 text-center text-xs text-[var(--text-muted)]">{city.whCount}</td>
                      <td className="py-2 text-right text-xs text-[var(--foreground)]">{city.stockBefore.toLocaleString()}</td>
                      <td className="py-2 text-right text-xs text-[var(--foreground)]">{city.stockAfter.toLocaleString()}</td>
                      <td className="py-2 text-right text-xs text-[var(--foreground)]">{city.stockDayAfter.toLocaleString()}</td>
                      <td className={`py-2 text-right text-xs font-medium ${change < -20 ? 'text-[var(--accent-red)]' : change < 0 ? 'text-[var(--accent-orange)]' : 'text-[var(--accent-green)]'}`}>
                        {change.toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
