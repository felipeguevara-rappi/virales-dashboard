'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Package, TrendingUp, AlertTriangle } from 'lucide-react';

interface ProductData {
  syncProductId: number;
  name: string;
  brand: string;
  gmv: number;
  units: number;
  orders: number;
  discount: number;
  avgPrice: number;
  discountPct: number;
  warehousesSold: number;
  openingStock: number;
  closingStock: number;
  whWithStock: number;
  sellThroughPct: number;
}

interface ProductAnalysisProps {
  data: { products: ProductData[] } | null;
  loading: boolean;
}

export default function ProductAnalysis({ data, loading }: ProductAnalysisProps) {
  if (loading) {
    return <div className="glass-card p-6 h-[300px] flex items-center justify-center"><div className="animate-pulse text-[var(--text-muted)]">Analizando productos...</div></div>;
  }
  if (!data || !data.products.length) {
    return <div className="glass-card p-6 h-[200px] flex items-center justify-center"><p className="text-[var(--text-muted)]">Selecciona una campaña</p></div>;
  }

  const { products } = data;
  const totalGmv = products.reduce((s, p) => s + p.gmv, 0);

  // Chart data: GMV by product
  const chartData = products.slice(0, 8).map(p => ({
    name: p.name.length > 25 ? p.name.slice(0, 25) + '...' : p.name,
    gmv: Math.round(p.gmv / 1000),
    discount: Math.round(p.discount / 1000),
  }));

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card p-4 text-center">
          <Package className="w-4 h-4 mx-auto mb-1 text-[var(--accent-orange)]" />
          <p className="text-xl font-bold text-[var(--foreground)]">{products.length}</p>
          <p className="text-[10px] text-[var(--text-muted)]">Productos en el Viral</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-xl font-bold text-gradient-orange">${(totalGmv / 1000).toFixed(0)}K</p>
          <p className="text-[10px] text-[var(--text-muted)]">GMV Total</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-xl font-bold text-[var(--foreground)]">{products.reduce((s, p) => s + p.units, 0).toLocaleString()}</p>
          <p className="text-[10px] text-[var(--text-muted)]">Unidades Vendidas</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-xl font-bold text-[var(--accent-purple)]">{Math.round(products.reduce((s, p) => s + p.discountPct * p.gmv, 0) / totalGmv)}%</p>
          <p className="text-[10px] text-[var(--text-muted)]">Descuento Promedio</p>
        </div>
      </div>

      {/* GMV by Product Chart */}
      <div className="glass-card p-6">
        <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">GMV por Producto ($K)</h4>
        <ResponsiveContainer width="100%" height={Math.max(180, products.length * 35)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 30, left: 120, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
            <XAxis type="number" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={(v) => `$${v}K`} />
            <YAxis type="category" dataKey="name" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 9 }} width={120} />
            <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }} formatter={(value) => [`$${Number(value)}K`, '']} />
            <Bar dataKey="gmv" radius={[0, 4, 4, 0]}>
              {chartData.map((_, i) => <Cell key={`c-${i}`} fill={i === 0 ? '#F97316' : i < 3 ? '#8B5CF6' : '#6B7280'} opacity={0.8} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Product Detail Table */}
      <div className="glass-card p-6">
        <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Detalle por Producto</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 text-[10px] text-[var(--text-muted)] font-medium">Producto</th>
                <th className="text-right py-2 text-[10px] text-[var(--text-muted)] font-medium">GMV</th>
                <th className="text-right py-2 text-[10px] text-[var(--text-muted)] font-medium">Unidades</th>
                <th className="text-right py-2 text-[10px] text-[var(--text-muted)] font-medium">Desc%</th>
                <th className="text-right py-2 text-[10px] text-[var(--text-muted)] font-medium">Stock Ini</th>
                <th className="text-right py-2 text-[10px] text-[var(--text-muted)] font-medium">Sell-Through</th>
                <th className="text-right py-2 text-[10px] text-[var(--text-muted)] font-medium">WH</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2">
                    <p className="text-xs text-[var(--foreground)] font-medium">{p.name.slice(0, 35)}{p.name.length > 35 ? '...' : ''}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{p.brand}</p>
                  </td>
                  <td className="py-2 text-right text-xs text-[var(--foreground)]">${(p.gmv / 1000).toFixed(0)}K</td>
                  <td className="py-2 text-right text-xs text-[var(--foreground)]">{p.units.toLocaleString()}</td>
                  <td className="py-2 text-right">
                    <span className={`text-xs font-medium ${p.discountPct > 40 ? 'text-[var(--accent-red)]' : 'text-[var(--accent-orange)]'}`}>{p.discountPct.toFixed(0)}%</span>
                  </td>
                  <td className="py-2 text-right text-xs text-[var(--foreground)]">{p.openingStock.toLocaleString()}</td>
                  <td className="py-2 text-right">
                    <span className={`text-xs font-medium ${p.sellThroughPct > 80 ? 'text-[var(--accent-red)]' : p.sellThroughPct > 40 ? 'text-[var(--accent-orange)]' : 'text-[var(--accent-green)]'}`}>
                      {p.sellThroughPct.toFixed(0)}%
                      {p.sellThroughPct > 80 && <AlertTriangle className="inline w-3 h-3 ml-1" />}
                    </span>
                  </td>
                  <td className="py-2 text-right text-xs text-[var(--text-muted)]">{p.warehousesSold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex gap-4 text-[10px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-[var(--accent-green)]" /> Sell-Through &lt;40% = stock sobrante</span>
          <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-[var(--accent-red)]" /> Sell-Through &gt;80% = posible ruptura</span>
        </div>
      </div>
    </div>
  );
}
