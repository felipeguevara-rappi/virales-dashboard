'use client';

import { BookOpen, Zap, TrendingUp, AlertTriangle, RefreshCw, Package, Users, BarChart3 } from 'lucide-react';

export default function Playbook() {
  const sections = [
    {
      icon: Zap, color: '#F97316', title: '¿Qué es un Viral Deal?',
      content: 'Un Viral Deal es una campaña de descuento agresivo sobre un producto o grupo de productos, diseñada para generar un pico de demanda en un solo día. El objetivo es aumentar el GMV, adquirir nuevos usuarios y crear hábito de compra. El descuento es financiado por el maker/marca como parte de un acuerdo comercial.',
    },
    {
      icon: TrendingUp, color: '#10B981', title: 'Métricas Clave',
      content: `• GMV (sin IVA): Valor total de las ventas del viral, sin impuesto. Solo se cuenta COUNT_TO_GMV = TRUE.
• ROI: GMV / Descuento Invertido. Un ROI de 2x significa que por cada $1 de descuento se generaron $2 en ventas.
• Net Incremental: GMV del día viral - baseline promedio - canibalización post-viral. Es el valor REAL que genera el viral.
• Multiplicador: Cuántas veces vendió el viral vs un día normal (ej: 9x = vendió 9 veces más que el promedio).
• CAC: Costo de Adquisición por Cliente = Descuento total / Usuarios únicos.`,
    },
    {
      icon: AlertTriangle, color: '#8B5CF6', title: 'Canibalización e Incrementalidad',
      content: `La canibalización mide si el viral "robó" ventas de los días posteriores. Se calcula comparando las ventas T+1 a T+7 contra el baseline (promedio T-28 a T-8).

• Si post-viral > baseline → No hay canibalización, el viral generó demanda pura.
• Si post-viral < baseline → Hay canibalización, parte de la venta se hubiera dado de todos modos.
• Net Incremental = (GMV viral - baseline) - (baseline - post_viral) × días de dip.

El "Test de Stockeo" compara si los compradores del viral redujeron sus compras después (stockearon) vs un grupo control.`,
    },
    {
      icon: Users, color: '#3B82F6', title: 'Segmentación de Usuarios',
      content: `Se clasifican los compradores del viral en 3 grupos:

• TRULY NEW: Primera orden JAMÁS en la plataforma. Son el verdadero valor de adquisición del viral (~2% típico).
• REACTIVATED: Usuarios que no compraban hace >30 días. El viral los trajo de vuelta (~8%).
• EXISTING ACTIVE: Ya compraban regularmente. Su participación NO es mérito del viral (~90%).

La retención se compara contra un benchmark: nuevos usuarios normales retienen ~81% a 30d, mientras que los del viral retienen ~46%. Esto indica que los usuarios adquiridos por descuento son de menor calidad.`,
    },
    {
      icon: RefreshCw, color: '#EC4899', title: 'Repeat Purchase & Hábito',
      content: `Mide si el viral crea hábito de compra del mismo producto:

• Tasa de Recompra: % de compradores que volvieron a comprar el MISMO producto en 60d (~39% típico).
• Full Price %: De esas recompras, cuántas fueron sin descuento (~58%). Esto es valor PURO — el descuento generó demanda recurrente que se paga completa.
• Revenue Full-Price: El GMV total de recompras sin descuento. Es el long-term value real del viral.`,
    },
    {
      icon: Package, color: '#EF4444', title: 'Fricción Operativa y Stock',
      content: `Analiza si la operación estaba preparada para el viral:

• Cobertura: % de warehouses que tenían el producto viral en stock antes del día. Lo ideal es 100%.
• Sell-Through Rate: Unidades vendidas / Stock inicial. >80% = riesgo de ruptura. <40% = sobró.
• Lost GMV: Estimación de venta perdida por warehouses que no tenían stock. Se calcula: capacidad de WH sin stock × tasa de conversión de WH con stock × ticket promedio.
• Stock por Ciudad: Muestra cómo estaba el inventario antes, durante y después por cada ciudad.`,
    },
    {
      icon: BarChart3, color: '#FBBF24', title: 'Cross-Basket',
      content: `Mide qué más compraron los usuarios en la misma orden o después:

• Companion Basket: Productos NO-virales en la misma orden (ej: compraste cerveza viral + botana). Típicamente 30-40% de órdenes incluyen companions.
• True Cross-Sell: Del companion, solo cuenta como "nuevo" si el usuario NUNCA había comprado esa categoría antes (~34%).
• Habitual: El 66% del companion son categorías que el usuario ya compraba — no es mérito del viral.`,
    },
    {
      icon: BookOpen, color: '#6B7280', title: 'Executive Report: ¿Funcionan los Virales?',
      content: `El Executive Report analiza el programa completo desde 5 ángulos:

1. VENTAS: P&L del programa (GMV - Descuento - Canibalización = Net Value)
2. DEMANDA: Cuadrante de multiplicador vs dip post-viral. Clasifica campañas en: Generación Pura, Resultado Mixto, Bajo Impacto.
3. USUARIOS: Composición (~95% existentes), calidad de adquisición, gap vs benchmark.
4. TENDENCIA: Evolución mensual, ROI learning curve, proyección a 3 meses.
5. HÁBITO: Tasa de recompra, % full-price, timing óptimo (Thu-Fri, 12-5pm).

El veredicto final usa Cortex AI para analizar todos los datos y dar una recomendación ejecutiva.`,
    },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="glass-card p-6 text-center">
        <BookOpen className="w-8 h-8 mx-auto mb-3 text-[var(--accent-orange)]" />
        <h2 className="text-xl font-bold text-[var(--foreground)] mb-2">Playbook: Virales Dashboard</h2>
        <p className="text-sm text-[var(--text-muted)]">Guía completa de conceptos, métricas y cómo interpretar cada sección del dashboard.</p>
      </div>

      {sections.map((section, i) => (
        <div key={i} className="glass-card p-6" style={{ borderLeft: `3px solid ${section.color}` }}>
          <div className="flex items-center gap-3 mb-3">
            <section.icon className="w-5 h-5 flex-shrink-0" style={{ color: section.color }} />
            <h3 className="text-sm font-bold text-[var(--foreground)]">{section.title}</h3>
          </div>
          <div className="whitespace-pre-wrap text-xs text-[var(--text-muted)] leading-relaxed">{section.content}</div>
        </div>
      ))}
    </div>
  );
}
