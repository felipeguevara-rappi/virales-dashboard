import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/snowflake';

export async function POST(request: NextRequest) {
  try {
    const { portfolioData } = await request.json();

    if (!portfolioData?.length) {
      return NextResponse.json({ error: 'portfolioData required' }, { status: 400 });
    }

    const metricsText = portfolioData.slice(0, 25).map((d: { campaignName: string; date: string; gmv: number; discountInvestment: number; roi: number }) =>
      `- ${d.campaignName.replace('VIRAL_DEAL_', '')} (${d.date}): GMV $${Math.round(d.gmv / 1000)}K, Desc $${Math.round(d.discountInvestment / 1000)}K, ROI ${d.roi.toFixed(1)}x`
    ).join('\n');

    const prompt = `Eres un analista senior de Growth en e-commerce (quick-commerce/turbo). Analiza este portafolio de campañas "Viral Deals" de México y genera un reporte estratégico conciso en español:

1. RESUMEN EJECUTIVO (2-3 líneas): estado general del programa
2. TOP 3 CAMPAÑAS más eficientes (ROI alto + GMV relevante) y por qué funcionaron
3. CAMPAÑAS PROBLEMÁTICAS (ROI < 2x): qué las hizo ineficientes
4. TENDENCIA: ¿la eficiencia del programa mejora o empeora?
5. 3 RECOMENDACIONES concretas para el próximo mes

Datos:
${metricsText}

ROI = GMV/Descuento. GMV sin IVA. Sé directo, ejecutivo y accionable. Máximo 400 palabras.`;

    const aiSql = `SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large2', '${prompt.replace(/'/g, "''")}') AS REPORT`;
    const aiRows = await executeQuery(aiSql);
    const aiRow = aiRows[0] as Record<string, string> || {};

    return NextResponse.json({
      report: aiRow.REPORT || 'No se pudo generar el reporte.',
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('AI Report error:', error);
    return NextResponse.json({ error: 'AI Report generation failed' }, { status: 500 });
  }
}
