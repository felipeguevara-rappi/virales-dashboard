/**
 * Generates a BEAUTIFUL PDF for the Bimbo 2026-03-07 maker report.
 * Captures from the live Next.js server with proper print-optimized styling.
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.join(__dirname, '..', 'public');
const BASE_URL = 'http://localhost:3847/static';

const PDF_PRINT_CSS = `
@page { margin: 8mm; }

/* Force compact layout for PDF */
body, .min-h-screen { 
  background: #ffffff !important; 
  color: #1a1a2e !important; 
  padding: 0 !important;
}

/* Override CSS variables */
:root {
  --background: #ffffff !important;
  --foreground: #1a1a2e !important;
  --text-muted: #6b7280 !important;
  --card-bg: #f8fafc !important;
  --card-border: #e2e8f0 !important;
}

/* Compact spacing */
.min-h-screen { padding: 16px !important; }
.space-y-8 > * + * { margin-top: 20px !important; }
.space-y-4 > * + * { margin-top: 10px !important; }
section { margin-bottom: 16px !important; }
.mb-8 { margin-bottom: 12px !important; }
.mb-6 { margin-bottom: 10px !important; }
.mb-4 { margin-bottom: 8px !important; }
.p-6 { padding: 12px !important; }
.p-5 { padding: 10px !important; }
.p-4 { padding: 8px !important; }

/* Glass cards - clean light style */
.glass-card {
  background: #f8fafc !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 10px !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

/* Force grids to stay horizontal */
.grid.grid-cols-2 { grid-template-columns: repeat(2, 1fr) !important; display: grid !important; }
.grid.grid-cols-1.md\\:grid-cols-2 { grid-template-columns: repeat(2, 1fr) !important; display: grid !important; }
.grid.grid-cols-1.md\\:grid-cols-3 { grid-template-columns: repeat(3, 1fr) !important; display: grid !important; }
.grid.grid-cols-2.md\\:grid-cols-4 { grid-template-columns: repeat(4, 1fr) !important; display: grid !important; }
.grid.grid-cols-2.sm\\:grid-cols-3.lg\\:grid-cols-5 { grid-template-columns: repeat(5, 1fr) !important; display: grid !important; }
.grid.grid-cols-1.lg\\:grid-cols-2 { grid-template-columns: repeat(2, 1fr) !important; display: grid !important; }
.gap-4 { gap: 8px !important; }
.gap-3 { gap: 6px !important; }

/* Text colors for light mode */
h1, h2, h3, h4, h5, h6 { color: #1a1a2e !important; }
.text-gradient-orange { -webkit-text-fill-color: unset !important; background: none !important; color: #F97316 !important; background-clip: unset !important; -webkit-background-clip: unset !important; }
.text-gradient-purple { -webkit-text-fill-color: unset !important; background: none !important; color: #8B5CF6 !important; background-clip: unset !important; -webkit-background-clip: unset !important; }

/* Charts - fix for light mode */
.recharts-cartesian-grid line { stroke: rgba(0,0,0,0.06) !important; }
.recharts-xAxis line, .recharts-yAxis line { stroke: rgba(0,0,0,0.12) !important; }
.recharts-text, .recharts-cartesian-axis-tick-value, svg text { fill: #6b7280 !important; }
.recharts-legend-item-text { color: #4b5563 !important; }

/* Charts - ensure they don't overflow */
.recharts-wrapper { overflow: hidden !important; }

/* Kill animations and glows */
.pulse-glow { animation: none !important; box-shadow: none !important; }
.animate-fade-in { animation: none !important; }

/* Hide campaign selector arrow and make it static */
.relative.w-full.max-w-lg .glass-card { cursor: default !important; }

/* Page break control - prevent overlapping */
section { break-inside: avoid; page-break-inside: avoid; overflow: hidden !important; position: relative !important; }
.glass-card { break-inside: avoid; page-break-inside: avoid; overflow: hidden !important; }
.space-y-8 > section { clear: both !important; }

/* Header more compact */
header { margin-bottom: 12px !important; padding-bottom: 8px !important; }
header h1 { font-size: 18px !important; }

/* Section headers */
section > h2 { 
  font-size: 14px !important; 
  margin-bottom: 8px !important;
  padding-bottom: 4px !important;
  border-bottom: 1px solid #e2e8f0 !important;
}

/* KPI cards compact */
.kpi-card .value, .text-3xl { font-size: 20px !important; }
.text-xl { font-size: 16px !important; }
.text-lg { font-size: 14px !important; }

/* Tables compact */
table { font-size: 11px !important; }
table th, table td { padding: 4px 6px !important; }

/* Border-left accents */
.border-l-4 { border-left-width: 3px !important; }
`;

async function main() {
  // Check if server is running
  const http = require('http');
  await new Promise((resolve, reject) => {
    http.get('http://localhost:3847/', (r) => { r.resume(); resolve(); })
      .on('error', () => reject(new Error('Dev server not running on port 3847. Start it first: npm run dev -- --port 3847')));
  });

  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  // A4 width at 96dpi is ~794px, minus 16mm margins (~60px) = ~734px content width
  // But we want a good balance between readable charts and fitting the page
  await page.setViewport({ width: 850, height: 5000 });

  console.log('Navigating to dashboard...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  // Select Bimbo campaign
  console.log('Selecting Bimbo campaign...');
  await page.evaluate(() => {
    document.querySelector('.relative.w-full.max-w-lg .glass-card.cursor-pointer')?.click();
  });
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => {
    const input = document.querySelector('.relative.w-full.max-w-lg input[type="text"]');
    if (input) {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'Bimbo');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => {
    const items = document.querySelectorAll('.relative.w-full.max-w-lg .cursor-pointer');
    for (const item of items) {
      if ((item.textContent || '').includes('Bimbo') && (item.textContent || '').includes('2026-03-07')) {
        item.click(); return;
      }
    }
  });

  console.log('Waiting for charts...');
  await new Promise(r => setTimeout(r, 12000));

  // Verify
  const name = await page.evaluate(() => {
    const el = document.querySelector('.relative.w-full.max-w-lg .glass-card span');
    return el?.textContent || 'unknown';
  });
  console.log('Campaign:', name);

  // Apply modifications
  console.log('Applying print styles...');
  await page.evaluate((css) => {
    // Inject print CSS
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    // Remove tab bar
    document.querySelectorAll('.flex.gap-1.mb-6').forEach(el => el.remove());

    // Remove Maker/Growth burn text
    document.querySelectorAll('p').forEach(el => {
      const t = el.textContent || '';
      if ((t.includes('Growth:') && t.includes('Burn:')) || (t.includes('Maker:') && t.includes('Burn:'))) {
        el.remove();
      }
    });

    // Remove Fricción Operativa
    document.querySelectorAll('h2').forEach(h2 => {
      if (h2.textContent?.includes('Fricción Operativa')) {
        (h2.closest('section') || h2.parentElement)?.remove();
      }
    });

    // Fix SVG colors for light mode
    document.querySelectorAll('svg text').forEach(el => {
      const fill = el.getAttribute('fill');
      if (fill === '#9CA3AF' || (fill && fill.includes('255,255,255'))) {
        el.setAttribute('fill', '#6b7280');
      }
    });
    document.querySelectorAll('svg line').forEach(el => {
      const stroke = el.getAttribute('stroke');
      if (stroke && stroke.includes('255,255,255')) {
        el.setAttribute('stroke', 'rgba(0,0,0,0.08)');
      }
    });
    // Fix reference lines (dashed)
    document.querySelectorAll('svg line[stroke-dasharray]').forEach(el => {
      const stroke = el.getAttribute('stroke');
      if (stroke && stroke.includes('255,255,255')) {
        el.setAttribute('stroke', 'rgba(0,0,0,0.2)');
      }
    });

    // Remove chevron icon from campaign selector
    document.querySelectorAll('.relative.w-full.max-w-lg svg.lucide-chevron-down').forEach(el => el.remove());

  }, PDF_PRINT_CSS);

  await new Promise(r => setTimeout(r, 1000));

  // Generate PDF
  console.log('Generating PDF...');
  const pdfPath = path.join(OUTPUT_DIR, 'bimbo-2026-03-07-maker.pdf');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: false,
    margin: { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' }
  });

  const size = fs.statSync(pdfPath).size;
  console.log(`PDF saved: ${pdfPath} (${(size/1024).toFixed(0)}KB)`);

  await browser.close();
  console.log('Done!');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
