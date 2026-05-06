'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, ReferenceLine, ReferenceArea } from 'recharts';
import { AlertTriangle, Package, TrendingDown, MapPin, Clock } from 'lucide-react';

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
  opportunity?: {
    totalActiveWh: number; whWithStock: number; whNoStock: number;
    stockedCapacity: number; unstockedCapacity: number; estimatedLostGmv: number; conversionRate: number;
  };
  doiData?: { day: string; dayIndex: number; stock: number; doi: number }[];
  doiByProduct?: { syncProductId: number; name: string; doiPre: number; doiViral: number; doiPost1: number; doiPost7: number; avgDailySales: number }[];
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

  const coveragePct = data.mixFullCoveragePct || 0;
  const sellThroughRate = data.totalOpening > 0 ? (data.unitsSold / data.totalOpening) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="w-8 h-8 rounded-lg gradient-red mx-auto mb-2 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <p className="text-2xl font-bold text-[var(--accent-red)]">{data.whWithStockout}</p>
          <p className="text-xs text-[var(--text-muted)]">Warehouses con Ruptura</p>
          <p className="text-[10px] text-[var(--text-muted)]">de {data.totalWarehouses} activos</p>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="w-8 h-8 rounded-lg gradient-orange mx-auto mb-2 flex items-center justify-center">
            <TrendingDown className="w-4 h-4 text-white" />
          </div>
          <p className="text-2xl font-bold text-[var(--accent-orange)]">{data.mixAffectedPct}%</p>
          <p className="text-xs text-[var(--text-muted)]">Mix Órdenes Afectado</p>
          <p className="text-[10px] text-[var(--text-muted)]">peso en últimos 180d</p>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="w-8 h-8 rounded-lg gradient-purple mx-auto mb-2 flex items-center justify-center">
            <Package className="w-4 h-4 text-white" />
          </div>
          <p className="text-2xl font-bold text-[var(--accent-purple)]">{data.totalProductsSoldOut}</p>
          <p className="text-xs text-[var(--text-muted)]">Productos Agotados</p>
          <p className="text-[10px] text-[var(--text-muted)]">de {data.totalProductsWithStock} con stock</p>
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
      {/* Stock Opportunity */}
      {data.opportunity && data.opportunity.whNoStock > 0 && (
        <div className="glass-card p-6 border-l-4 border-l-[var(--accent-orange)]">
          <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Oportunidad: Warehouses Sin Preparar</h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-[var(--accent-orange)]">{data.opportunity.whNoStock}</p>
              <p className="text-[10px] text-[var(--text-muted)]">WH sin producto viral</p>
              <p className="text-[10px] text-[var(--text-muted)]">de {data.opportunity.totalActiveWh} activos</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--foreground)]">{data.opportunity.unstockedCapacity.toLocaleString()}</p>
              <p className="text-[10px] text-[var(--text-muted)]">Órdenes/30d capacidad</p>
              <p className="text-[10px] text-[var(--text-muted)]">de esos WH</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--foreground)]">{data.opportunity.conversionRate.toFixed(2)}%</p>
              <p className="text-[10px] text-[var(--text-muted)]">Tasa conversión viral</p>
              <p className="text-[10px] text-[var(--text-muted)]">(WH con stock)</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--accent-red)]">${(data.opportunity.estimatedLostGmv / 1000).toFixed(0)}K</p>
              <p className="text-[10px] text-[var(--text-muted)]">GMV potencial perdido</p>
              <p className="text-[10px] text-[var(--text-muted)]">por falta de stock</p>
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-3 p-2 bg-white/5 rounded">
            Si los {data.opportunity.whNoStock} warehouses hubieran tenido producto, estimamos ~{Math.round(data.opportunity.unstockedCapacity * data.opportunity.conversionRate / 100)} órdenes adicionales (${(data.opportunity.estimatedLostGmv / 1000).toFixed(0)}K) basado en conversion rate de {data.opportunity.conversionRate.toFixed(2)}%.
          </p>
          <div className="mt-3 p-3 bg-[var(--accent-green)]/5 rounded-lg border border-[var(--accent-green)]/20">
            <p className="text-xs font-medium text-[var(--accent-green)]">Recomendación:</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Priorizar distribución de producto viral a los {data.opportunity.whNoStock} warehouses sin stock antes del siguiente viral. 
              Focus en los de mayor capacidad ({(data.opportunity.unstockedCapacity / Math.max(data.opportunity.whNoStock, 1)).toFixed(0)} orders/30d promedio).
            </p>
          </div>
        </div>
      )}
      {/* DOI Analysis */}
      {data.doiData && data.doiData.length > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-[var(--accent-purple)]" />
            <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider">Days of Inventory (DOI) — T-7 a T+7</h4>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.doiData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
              <ReferenceArea y1={0} y2={7} fill="#EF4444" fillOpacity={0.05} />
              <ReferenceArea y1={7} y2={14} fill="#FBBF24" fillOpacity={0.05} />
              <ReferenceArea y1={45} y2={100} fill="#3B82F6" fillOpacity={0.05} />
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="dayIndex" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={(v) => v === 0 ? 'VIRAL' : `T${v > 0 ? '+' : ''}${v}`} />
              <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={(v) => `${v}d`} />
              <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }} formatter={(value) => [`${Number(value)} días`, 'DOI']} labelFormatter={(l) => `T${Number(l) >= 0 ? '+' : ''}${l}`} />
              <ReferenceLine y={7} stroke="#EF4444" strokeDasharray="3 3" />
              <ReferenceLine y={45} stroke="#3B82F6" strokeDasharray="3 3" />
              <ReferenceLine x={0} stroke="var(--accent-orange)" strokeWidth={2} strokeDasharray="3 3" />
              <Line type="monotone" dataKey="doi" stroke="#8B5CF6" strokeWidth={2.5} dot={{ r: 3, fill: '#8B5CF6' }} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 justify-center text-[10px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#EF4444]" /> &lt;7d Desabasto</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#FBBF24]" /> 7-14d Riesgo</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#10B981]" /> 15-45d Saludable</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#3B82F6]" /> &gt;45d Sobrestock</span>
          </div>
        </div>
      )}

      {/* DOI by Product */}
      {data.doiByProduct && data.doiByProduct.length > 0 && (
        <div className="glass-card p-6">
          <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">DOI por Producto (Pre → Viral → Post)</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 text-[10px] text-[var(--text-muted)] font-medium">Producto</th>
                  <th className="text-right py-2 text-[10px] text-[var(--text-muted)] font-medium">Vta/día</th>
                  <th className="text-right py-2 text-[10px] text-[var(--text-muted)] font-medium">DOI Pre</th>
                  <th className="text-right py-2 text-[10px] text-[var(--text-muted)] font-medium">DOI Viral</th>
                  <th className="text-right py-2 text-[10px] text-[var(--text-muted)] font-medium">DOI +1d</th>
                  <th className="text-right py-2 text-[10px] text-[var(--text-muted)] font-medium">DOI +7d</th>
                  <th className="text-right py-2 text-[10px] text-[var(--text-muted)] font-medium">Riesgo</th>
                </tr>
              </thead>
              <tbody>
                {data.doiByProduct.map((p, i) => {
                  const minDoi = Math.min(p.doiPre, p.doiViral, p.doiPost1, p.doiPost7 || 999);
                  const risk = minDoi < 7 ? 'DESABASTO' : minDoi < 14 ? 'BAJO' : p.doiPost7 > 45 ? 'SOBRESTOCK' : 'OK';
                  const riskColor = risk === 'DESABASTO' ? 'text-[var(--accent-red)]' : risk === 'BAJO' ? 'text-[#FBBF24]' : risk === 'SOBRESTOCK' ? 'text-[#3B82F6]' : 'text-[var(--accent-green)]';
                  return (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 text-xs text-[var(--foreground)]">{p.name}</td>
                      <td className="py-2 text-right text-xs text-[var(--text-muted)]">{p.avgDailySales.toFixed(0)}</td>
                      <td className="py-2 text-right text-xs text-[var(--foreground)]">{p.doiPre}d</td>
                      <td className="py-2 text-right text-xs text-[var(--foreground)]">{p.doiViral}d</td>
                      <td className="py-2 text-right text-xs text-[var(--foreground)]">{p.doiPost1}d</td>
                      <td className="py-2 text-right text-xs text-[var(--foreground)]">{p.doiPost7}d</td>
                      <td className={`py-2 text-right text-xs font-medium ${riskColor}`}>{risk}</td>
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
