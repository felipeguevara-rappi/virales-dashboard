'use client';

import { Sparkles } from 'lucide-react';
import { AIReportData } from '@/lib/types';

interface AIReportProps {
  data: AIReportData | null;
  loading: boolean;
  onGenerate: () => void;
}

export default function AIReport({ data, loading, onGenerate }: AIReportProps) {
  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--accent-purple)]" />
          <h3 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider">
            Análisis IA (Cortex)
          </h3>
        </div>
        <button
          onClick={onGenerate}
          disabled={loading}
          className="px-4 py-2 rounded-lg text-xs font-medium gradient-purple text-white transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Generando...' : 'Generar Reporte'}
        </button>
      </div>

      {loading && (
        <div className="space-y-3 animate-pulse">
          <div className="h-3 bg-white/10 rounded w-full" />
          <div className="h-3 bg-white/10 rounded w-5/6" />
          <div className="h-3 bg-white/10 rounded w-4/6" />
          <div className="h-3 bg-white/10 rounded w-full" />
          <div className="h-3 bg-white/10 rounded w-3/4" />
        </div>
      )}

      {!loading && data && (
        <div className="prose prose-invert prose-sm max-w-none">
          <div className="whitespace-pre-wrap text-sm text-[var(--foreground)] leading-relaxed">
            {data.report}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-4 border-t border-white/5 pt-3">
            Generado: {new Date(data.generatedAt).toLocaleString('es-MX')}
          </p>
        </div>
      )}

      {!loading && !data && (
        <p className="text-sm text-[var(--text-muted)]">
          Haz clic en &quot;Generar Reporte&quot; para obtener un análisis estratégico impulsado por IA del portafolio completo.
        </p>
      )}
    </div>
  );
}
