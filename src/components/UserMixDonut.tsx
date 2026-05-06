'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface UserMixDonutProps {
  newUsers: number;
  retainedUsers: number;
  reactivatedUsers: number;
  newToProduct: number;
  occasionalBuyer: number;
  frequentBuyer: number;
  loading: boolean;
}

const PLATFORM_COLORS = ['#F97316', '#10B981', '#8B5CF6'];
const PRODUCT_COLORS = ['#3B82F6', '#FBBF24', '#EC4899'];

export default function UserMixDonut({ newUsers, retainedUsers, reactivatedUsers, newToProduct, occasionalBuyer, frequentBuyer, loading }: UserMixDonutProps) {
  const platformData = [
    { name: 'Nuevos Plataforma', value: newUsers },
    { name: 'Retenidos', value: retainedUsers },
    { name: 'Reactivados', value: reactivatedUsers },
  ];
  const platformTotal = newUsers + retainedUsers + reactivatedUsers;

  const productData = [
    { name: '1ra vez este producto', value: newToProduct },
    { name: 'Ocasional (1-2 prev)', value: occasionalBuyer },
    { name: 'Frecuente (3+ prev)', value: frequentBuyer },
  ];
  const productTotal = newToProduct + occasionalBuyer + frequentBuyer;

  if (loading) {
    return <div className="glass-card p-6 h-[260px] flex items-center justify-center"><div className="animate-pulse text-[var(--text-muted)]">Cargando mix de usuarios...</div></div>;
  }

  if (platformTotal === 0 && productTotal === 0) {
    return <div className="glass-card p-6 h-[200px] flex items-center justify-center"><p className="text-[var(--text-muted)]">Sin datos de usuarios</p></div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Platform-level mix */}
      <div className="glass-card p-5">
        <h4 className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider text-center mb-2">Mix vs Plataforma</h4>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={platformData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value" stroke="none">
              {platformData.map((_, index) => <Cell key={`p-${index}`} fill={PLATFORM_COLORS[index]} />)}
            </Pie>
            <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }} formatter={(value) => [`${Number(value)} (${platformTotal > 0 ? ((Number(value) / platformTotal) * 100).toFixed(0) : 0}%)`, '']} />
            <Legend verticalAlign="bottom" iconType="circle" iconSize={8} formatter={(value) => <span className="text-[10px] text-[var(--foreground)]">{value}</span>} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Product-level mix */}
      {productTotal > 0 && (
        <div className="glass-card p-5">
          <h4 className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider text-center mb-2">Mix vs Producto Viral</h4>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={productData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value" stroke="none">
                {productData.map((_, index) => <Cell key={`pr-${index}`} fill={PRODUCT_COLORS[index]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }} formatter={(value) => [`${Number(value)} (${productTotal > 0 ? ((Number(value) / productTotal) * 100).toFixed(0) : 0}%)`, '']} />
              <Legend verticalAlign="bottom" iconType="circle" iconSize={8} formatter={(value) => <span className="text-[10px] text-[var(--foreground)]">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
