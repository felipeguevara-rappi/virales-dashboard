'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { Users, AlertTriangle, TrendingUp, Target } from 'lucide-react';

interface SegmentData {
  userType: string;
  cohortSize: number;
  ret15dPct: number;
  ret30dPct: number;
  ret45dPct: number;
  ret60dPct: number;
  avgOrders60d: number;
  avgLtv60d: number;
}

interface RetentionBySegmentProps {
  segments: SegmentData[];
  totalCohort: number;
  trulyNewCount: number;
  existingActivePct: number;
  benchmark: { ret15d: number; ret30d: number };
  qualityGap: number;
  discountSpend: number;
  daysSinceViral: number;
  maturity15: boolean;
  maturity30: boolean;
  loading: boolean;
}

const SEGMENT_COLORS: Record<string, string> = { TRULY_NEW: '#F97316', NEW_TO_TURBO: '#F97316', REACTIVATED: '#8B5CF6', REACTIVATED_TURBO: '#8B5CF6', EXISTING_ACTIVE: '#10B981', EXISTING_TURBO: '#10B981' };
const SEGMENT_LABELS: Record<string, string> = { TRULY_NEW: 'Nuevos Turbo', NEW_TO_TURBO: 'Nuevos Turbo', REACTIVATED: 'Reactivados Turbo', REACTIVATED_TURBO: 'Reactivados Turbo', EXISTING_ACTIVE: 'Existentes Turbo', EXISTING_TURBO: 'Existentes Turbo' };

export default function RetentionBySegment({ segments, totalCohort, trulyNewCount, existingActivePct, benchmark, qualityGap, discountSpend, daysSinceViral, maturity15, maturity30, loading }: RetentionBySegmentProps) {
  if (loading) {
    return <div className="glass-card p-6 h-[500px] flex items-center justify-center"><div className="animate-pulse text-[var(--text-muted)]">Analizando cohortes...</div></div>;
  }
  if (segments.length === 0) {
    return <div className="glass-card p-6 h-[300px] flex items-center justify-center"><p className="text-[var(--text-muted)]">Selecciona una campaña para ver retención</p></div>;
  }

  const trulyNew = segments.find(s => s.userType === 'TRULY_NEW' || s.userType === 'NEW_TO_TURBO');
  const reactivated = segments.find(s => s.userType === 'REACTIVATED' || s.userType === 'REACTIVATED_TURBO');
  const existing = segments.find(s => s.userType === 'EXISTING_ACTIVE' || s.userType === 'EXISTING_TURBO');

  const retChartData = segments.filter(s => s.userType !== 'EXISTING_ACTIVE' && s.userType !== 'EXISTING_TURBO').map(seg => ({
    segment: SEGMENT_LABELS[seg.userType] || seg.userType,
    '15d': Math.round((seg.ret15dPct || 0) * 10) / 10,
    '30d': Math.round((seg.ret30dPct || 0) * 10) / 10,
    '45d': Math.round((seg.ret45dPct || 0) * 10) / 10,
    '60d': Math.round((seg.ret60dPct || 0) * 10) / 10,
  }));

  const newThatReturned = trulyNew ? Math.round((trulyNew.cohortSize || 0) * (trulyNew.ret30dPct || 0) / 100) : 0;
  const trueCAC = newThatReturned > 0 && discountSpend > 0 ? discountSpend / newThatReturned : 0;

  return (
    <div className="space-y-4">
      {/* Reality Check Banner */}
      <div className="glass-card p-5 border-l-4 border-l-[var(--accent-orange)]">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[var(--accent-orange)] mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-[var(--foreground)] mb-1">Reality Check: Composición de la Cohorte</h4>
            <p className="text-xs text-[var(--text-muted)]">
              El <span className="text-[var(--accent-green)] font-medium">{(existingActivePct || 0).toFixed(0)}%</span> de los compradores ya eran usuarios activos — su retención NO es mérito del viral.
              Solo <span className="text-[var(--accent-orange)] font-medium">{trulyNewCount}</span> usuarios son verdaderamente nuevos en la plataforma.
            </p>
          </div>
        </div>
      </div>

      {/* Segment Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-5" style={{ borderLeft: `3px solid ${SEGMENT_COLORS.TRULY_NEW}` }}>
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-[var(--accent-orange)]" />
            <span className="text-sm font-medium text-[var(--accent-orange)]">Nuevos (1ra vez)</span>
          </div>
          <p className="text-3xl font-bold text-[var(--foreground)]">{trulyNew?.cohortSize || 0}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-center">
            <div><p className="text-lg font-bold text-[var(--foreground)]">{(trulyNew?.ret30dPct || 0).toFixed(0)}%</p><p className="text-[10px] text-[var(--text-muted)]">Ret 30d</p></div>
            <div><p className="text-lg font-bold text-[var(--text-muted)]">{benchmark.ret30d}%</p><p className="text-[10px] text-[var(--text-muted)]">Benchmark</p></div>
          </div>
          <div className={`mt-2 text-xs p-2 rounded ${qualityGap >= 0 ? 'bg-[var(--accent-green)]/10 text-[var(--accent-green)]' : 'bg-[var(--accent-red)]/10 text-[var(--accent-red)]'}`}>
            {qualityGap >= 0 ? `+${qualityGap.toFixed(0)}pp vs benchmark` : `${qualityGap.toFixed(0)}pp vs benchmark`}
          </div>
        </div>

        <div className="glass-card p-5" style={{ borderLeft: `3px solid ${SEGMENT_COLORS.REACTIVATED}` }}>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-[var(--accent-purple)]" />
            <span className="text-sm font-medium text-[var(--accent-purple)]">Reactivados</span>
          </div>
          <p className="text-3xl font-bold text-[var(--foreground)]">{reactivated?.cohortSize || 0}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-center">
            <div><p className="text-lg font-bold text-[var(--foreground)]">{(reactivated?.ret30dPct || 0).toFixed(0)}%</p><p className="text-[10px] text-[var(--text-muted)]">Ret 30d</p></div>
            <div><p className="text-lg font-bold text-[var(--foreground)]">{(reactivated?.avgOrders60d || 0).toFixed(1)}</p><p className="text-[10px] text-[var(--text-muted)]">Órdenes/60d</p></div>
          </div>
        </div>

        <div className="glass-card p-5" style={{ borderLeft: `3px solid ${SEGMENT_COLORS.EXISTING_ACTIVE}` }}>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-[var(--accent-green)]" />
            <span className="text-sm font-medium text-[var(--accent-green)]">Activos Existentes</span>
          </div>
          <p className="text-3xl font-bold text-[var(--foreground)]">{(existing?.cohortSize || 0).toLocaleString()}</p>
          <p className="mt-2 text-sm text-center text-[var(--foreground)]">{(existing?.ret30dPct || 0).toFixed(0)}% ret 30d</p>
          <p className="text-[10px] text-[var(--text-muted)] italic text-center">Comportamiento normal — no atribuible</p>
        </div>
      </div>

      {/* Retention Chart: New + Reactivated */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider">Retención Real (solo segmentos atribuibles al viral)</h4>
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={retChartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="segment" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
            <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
            <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#F8FAFC' }} formatter={(value) => [`${Number(value)}%`, '']} />
            <Legend formatter={(value) => <span className="text-xs">{value}</span>} />
            <ReferenceLine y={benchmark.ret30d} stroke="rgba(255,255,255,0.4)" strokeDasharray="5 5" />
            <Bar dataKey="15d" fill="#FBBF24" radius={[3, 3, 0, 0]} opacity={maturity15 ? 1 : 0.4} />
            <Bar dataKey="30d" fill="#F97316" radius={[3, 3, 0, 0]} opacity={maturity30 ? 1 : 0.4} />
            <Bar dataKey="45d" fill="#8B5CF6" radius={[3, 3, 0, 0]} opacity={maturity30 ? 1 : 0.4} />
            <Bar dataKey="60d" fill="#10B981" radius={[3, 3, 0, 0]} opacity={maturity30 ? 1 : 0.4} />
          </BarChart>
        </ResponsiveContainer>
        {!maturity30 && <p className="text-xs text-[var(--text-muted)] mt-2 italic">* Campaña tiene {daysSinceViral} días — datos parciales</p>}
      </div>

      {/* True CAC */}
      {discountSpend > 0 && trulyNew && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-[var(--accent-purple)]" />
            <h4 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider">Costo Real de Adquisición</h4>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xl font-bold text-[var(--accent-orange)]">${trueCAC > 0 ? (trueCAC / 1000).toFixed(0) + 'K' : '--'}</p>
              <p className="text-[10px] text-[var(--text-muted)]">CAC por nuevo que retuvo</p>
            </div>
            <div>
              <p className="text-xl font-bold text-[var(--foreground)]">{newThatReturned}</p>
              <p className="text-[10px] text-[var(--text-muted)]">Nuevos que volvieron</p>
            </div>
            <div>
              <p className="text-xl font-bold text-[var(--foreground)]">${((trulyNew.avgLtv60d || 0) / 1000).toFixed(1)}K</p>
              <p className="text-[10px] text-[var(--text-muted)]">LTV 60d (nuevos)</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
