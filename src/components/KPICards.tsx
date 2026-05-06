'use client';

import { KPIData } from '@/lib/types';
import { TrendingUp, ShoppingCart, DollarSign, Users, Package } from 'lucide-react';

interface KPICardsProps {
  data: (KPIData & { companionGmv?: number; fullBasketGmv?: number; basketAdjustedRoi?: number; productOnlyRoi?: number; companionPct?: number }) | null;
  loading: boolean;
}

export default function KPICards({ data, loading }: KPICardsProps) {
  const gmv = data?.gmvTotal || 0;
  const disc = data?.discountSpend || 0;
  const productRoi = data?.productOnlyRoi || (disc > 0 ? gmv / disc : 0);
  const basketRoi = data?.basketAdjustedRoi || productRoi;
  const companionGmv = data?.companionGmv || 0;

  const cards = [
    {
      label: 'GMV (sin IVA)',
      value: data ? `$${(gmv / 1000).toFixed(0)}K` : '--',
      sub: data && companionGmv > 0 ? `+ $${(companionGmv / 1000).toFixed(0)}K companion` : '',
      icon: DollarSign,
      gradient: 'gradient-orange',
      textGradient: 'text-gradient-orange',
    },
    {
      label: 'Órdenes / Unidades',
      value: data ? `${(data.totalOrders || 0).toLocaleString()} / ${(data.unitsSold || 0).toLocaleString()}` : '--',
      sub: data?.companionPct ? `${data.companionPct.toFixed(0)}% con companion items` : '',
      icon: ShoppingCart,
      gradient: 'gradient-purple',
      textGradient: 'text-gradient-purple',
    },
    {
      label: 'Inversión Descuento',
      value: data ? `$${(disc / 1000).toFixed(0)}K` : '--',
      sub: '',
      icon: TrendingUp,
      gradient: 'gradient-red',
      textGradient: 'text-[var(--accent-red)]',
    },
    {
      label: 'ROI (Producto)',
      value: data ? `${productRoi.toFixed(1)}x` : '--',
      sub: '',
      icon: Package,
      gradient: 'gradient-green',
      textGradient: 'text-[var(--accent-green)]',
    },
    {
      label: 'ROI (Full Basket)',
      value: data ? `${basketRoi.toFixed(1)}x` : '--',
      sub: data && basketRoi > productRoi ? `+${((basketRoi - productRoi) / productRoi * 100).toFixed(0)}% vs product-only` : '',
      icon: Users,
      gradient: 'gradient-purple',
      textGradient: 'text-gradient-purple',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="glass-card glass-card-hover p-4 transition-all duration-300">
          {loading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-3 bg-white/10 rounded w-20" />
              <div className="h-7 bg-white/10 rounded w-14" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">{card.label}</span>
                <div className={`w-6 h-6 rounded-md ${card.gradient} flex items-center justify-center opacity-80`}>
                  <card.icon className="w-3 h-3 text-white" />
                </div>
              </div>
              <p className={`text-xl font-bold ${card.textGradient}`}>{card.value}</p>
              {card.sub && <p className="text-[10px] text-[var(--text-muted)] mt-1">{card.sub}</p>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
