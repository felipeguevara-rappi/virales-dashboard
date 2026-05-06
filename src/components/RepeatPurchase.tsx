'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { RefreshCw, DollarSign, TrendingUp } from 'lucide-react';

interface RepeatData {
  totalViralBuyers: number;
  repeatBuyers: number;
  repeatRate: number;
  totalRepeatOrders: number;
  totalRepeatGmv: number;
  fullPriceOrders: number;
  discountedOrders: number;
  fullPricePct: number;
  fullPriceGmv: number;
  discountedGmv: number;
}

interface RepeatPurchaseProps {
  data: RepeatData | null;
  loading: boolean;
}

export default function RepeatPurchase({ data, loading }: RepeatPurchaseProps) {
  if (loading) return <div className="glass-card p-6 h-[300px] flex items-center justify-center"><div className="animate-pulse text-[var(--text-muted)]">Analizando recompras...</div></div>;
  if (!data) return <div className="glass-card p-6 h-[200px] flex items-center justify-center"><p className="text-[var(--text-muted)]">Selecciona una campaña</p></div>;

  const donutData = [
    { name: 'Full Price', value: data.fullPriceOrders, color: '#10B981' },
    { name: 'Con Descuento', value: data.discountedOrders, color: '#F97316' },
  ];

  return (
    <div className="space-y-4">
      {/* Insight Banner */}
      <div className="glass-card p-5 border-l-4 border-l-[var(--accent-green)]">
        <div className="flex items-start gap-3">
          <RefreshCw className="w-5 h-5 text-[var(--accent-green)] mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-[var(--foreground)] mb-1">El Viral Crea Hábito</h4>
            <p className="text-xs text-[var(--text-muted)]">
              <span className="text-[var(--accent-green)] font-medium">{data.repeatRate.toFixed(0)}%</span> de los compradores volvieron a comprar el mismo producto en 60 días.
              De esas recompras, <span className="text-[var(--accent-green)] font-medium">{data.fullPricePct.toFixed(0)}%</span> fueron a <strong>precio completo</strong> — evidencia de que el viral genera demanda sostenida, no solo oportunismo.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* KPI Cards */}
        <div className="glass-card p-5 text-center">
          <RefreshCw className="w-5 h-5 mx-auto mb-2 text-[var(--accent-purple)]" />
          <p className="text-3xl font-bold text-[var(--foreground)]">{data.repeatRate.toFixed(0)}%</p>
          <p className="text-xs text-[var(--text-muted)]">Tasa de Recompra (60d)</p>
          <p className="text-[10px] text-[var(--text-muted)]">{data.repeatBuyers.toLocaleString()} de {data.totalViralBuyers.toLocaleString()} buyers</p>
        </div>

        {/* Donut: Full Price vs Discounted */}
        <div className="glass-card p-5">
          <h4 className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider text-center mb-2">Recompras: Full Price vs Descuento</h4>
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie data={donutData} cx="50%" cy="50%" innerRadius={35} outerRadius={50} paddingAngle={3} dataKey="value" stroke="none">
                {donutData.map((entry, i) => <Cell key={`cell-${i}`} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }} formatter={(value) => [`${Number(value)} órdenes`, '']} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-3 text-[10px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#10B981]" /> Full Price ({data.fullPricePct.toFixed(0)}%)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#F97316]" /> Descuento</span>
          </div>
        </div>

        {/* Revenue puro */}
        <div className="glass-card p-5 text-center">
          <DollarSign className="w-5 h-5 mx-auto mb-2 text-[var(--accent-green)]" />
          <p className="text-3xl font-bold text-[var(--accent-green)]">${(data.fullPriceGmv / 1000).toFixed(0)}K</p>
          <p className="text-xs text-[var(--text-muted)]">Revenue Full-Price (60d)</p>
          <p className="text-[10px] text-[var(--text-muted)]">GMV generado sin ningún descuento</p>
          <div className="mt-2 flex items-center justify-center gap-1">
            <TrendingUp className="w-3 h-3 text-[var(--accent-green)]" />
            <span className="text-[10px] text-[var(--accent-green)]">Valor puro del viral</span>
          </div>
        </div>
      </div>
    </div>
  );
}
