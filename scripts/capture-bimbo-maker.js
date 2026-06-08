/**
 * Captures the Bimbo 2026-03-07 campaign as a FULLY STANDALONE HTML + PDF.
 * Inlines all CSS, removes script dependencies (charts are SVG from Recharts).
 * Removes: Investment Maker/Growth breakdown, Fricción Operativa, Executive Report, Playbook.
 * Changes background to white.
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const http = require('http');

const OUTPUT_DIR = path.join(__dirname, '..', 'public');
const BASE_URL = 'http://localhost:3847/static';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

const LIGHT_THEME_CSS = `
:root {
  --background: #ffffff !important;
  --foreground: #1a1a2e !important;
  --card-bg: rgba(0,0,0,0.02) !important;
  --card-border: rgba(0,0,0,0.1) !important;
  --accent-orange: #F97316 !important;
  --accent-purple: #8B5CF6 !important;
  --accent-green: #10B981 !important;
  --accent-red: #EF4444 !important;
  --text-muted: #6b7280 !important;
}
body, .min-h-screen { background: #ffffff !important; color: #1a1a2e !important; }
.glass-card {
  background: #f8fafc !important;
  border: 1px solid #e2e8f0 !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
.glass-card-hover:hover { background: #f1f5f9 !important; border-color: #cbd5e1 !important; }
h1, h2, h3, h4, h5, h6 { color: #1a1a2e !important; }
.text-gradient-orange { -webkit-text-fill-color: unset !important; background: none !important; color: #F97316 !important; background-clip: unset !important; -webkit-background-clip: unset !important; }
.text-gradient-purple { -webkit-text-fill-color: unset !important; background: none !important; color: #8B5CF6 !important; background-clip: unset !important; -webkit-background-clip: unset !important; }
.recharts-cartesian-grid line { stroke: rgba(0,0,0,0.08) !important; }
.recharts-xAxis line, .recharts-yAxis line { stroke: rgba(0,0,0,0.15) !important; }
.recharts-text, .recharts-cartesian-axis-tick-value { fill: #6b7280 !important; }
.recharts-legend-item-text { color: #4b5563 !important; }
.recharts-default-tooltip { background: #ffffff !important; border: 1px solid #e2e8f0 !important; border-radius: 8px !important; color: #1a1a2e !important; }
.recharts-tooltip-label { color: #1a1a2e !important; }
.recharts-tooltip-item { color: #4b5563 !important; }
.pulse-glow { animation: none !important; box-shadow: none !important; }
input { background: #f1f5f9 !important; border-color: #e2e8f0 !important; color: #1a1a2e !important; }
@media print {
  body { padding: 8px !important; }
  .glass-card { break-inside: avoid; }
  section { break-inside: avoid; page-break-inside: avoid; }
}
`;

async function main() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 4000 });

  console.log('Navigating to dashboard...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  // Select Bimbo campaign
  console.log('Selecting Bimbo campaign...');
  await page.evaluate(() => {
    const selector = document.querySelector('.relative.w-full.max-w-lg .glass-card.cursor-pointer');
    if (selector) selector.click();
  });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => {
    const input = document.querySelector('.relative.w-full.max-w-lg input[type="text"]');
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Bimbo');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => {
    const items = document.querySelectorAll('.relative.w-full.max-w-lg .cursor-pointer');
    for (const item of items) {
      if ((item.textContent || '').includes('Bimbo') && (item.textContent || '').includes('2026-03-07')) {
        item.click();
        return;
      }
    }
  });

  console.log('Waiting for all charts to render...');
  await new Promise(r => setTimeout(r, 12000));

  const campaignName = await page.evaluate(() => {
    const el = document.querySelector('.relative.w-full.max-w-lg .glass-card span');
    return el ? el.textContent : 'unknown';
  });
  console.log('Current campaign:', campaignName);

  // STEP 1: Apply light theme + remove sections (for both PDF and HTML)
  console.log('Applying modifications...');
  await page.evaluate((lightCSS) => {
    // Add light theme CSS
    const style = document.createElement('style');
    style.id = 'light-theme';
    style.textContent = lightCSS;
    document.head.appendChild(style);

    // Force light bg
    document.body.style.background = '#ffffff';
    const root = document.querySelector('.min-h-screen');
    if (root) root.style.background = '#ffffff';

    // Fix glass cards
    document.querySelectorAll('.glass-card').forEach(el => {
      el.style.background = '#f8fafc';
      el.style.borderColor = '#e2e8f0';
      el.style.backdropFilter = 'none';
    });

    // Fix SVG text fills for light mode
    document.querySelectorAll('svg text, svg .recharts-text').forEach(el => {
      const fill = el.getAttribute('fill');
      if (fill === '#9CA3AF' || (fill && fill.includes('255,255,255'))) {
        el.setAttribute('fill', '#6b7280');
      }
    });
    // Fix SVG grid lines
    document.querySelectorAll('svg line').forEach(el => {
      const stroke = el.getAttribute('stroke');
      if (stroke && stroke.includes('255,255,255')) {
        el.setAttribute('stroke', 'rgba(0,0,0,0.1)');
      }
    });

    // REMOVE: Tab bar (Executive Report / Playbook)
    document.querySelectorAll('.flex.gap-1.mb-6').forEach(el => el.remove());

    // REMOVE: Maker/Growth burn text
    document.querySelectorAll('p').forEach(el => {
      const t = el.textContent || '';
      if ((t.includes('Growth:') && t.includes('Burn:')) || (t.includes('Maker:') && t.includes('Burn:'))) {
        el.remove();
      }
    });

    // REMOVE: "Fricción Operativa: Stock por Ciudad" section
    document.querySelectorAll('h2').forEach(h2 => {
      if (h2.textContent && h2.textContent.includes('Fricción Operativa')) {
        const section = h2.closest('section') || h2.parentElement;
        if (section) section.remove();
      }
    });
  }, LIGHT_THEME_CSS);

  await new Promise(r => setTimeout(r, 1000));

  // STEP 2: Generate PDF
  console.log('Generating PDF...');
  const pdfPath = path.join(OUTPUT_DIR, 'bimbo-2026-03-07-maker.pdf');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' }
  });
  console.log('PDF saved:', pdfPath);

  // STEP 3: Build standalone HTML
  console.log('Building standalone HTML...');
  
  // Fetch the CSS from the dev server
  let appCSS = '';
  try {
    const cssHref = await page.evaluate(() => {
      const link = document.querySelector('link[rel="stylesheet"]');
      return link ? link.href : null;
    });
    if (cssHref) {
      appCSS = await fetchUrl(cssHref);
      console.log('App CSS fetched:', (appCSS.length / 1024).toFixed(0) + 'KB');
    }
  } catch (e) {
    console.log('CSS fetch failed, using inline styles only');
  }

  // Remove scripts and external links, then get body
  await page.evaluate(() => {
    document.querySelectorAll('script').forEach(el => el.remove());
    document.querySelectorAll('link[href*="/_next/"]').forEach(el => el.remove());
    document.querySelectorAll('link[rel="preload"]').forEach(el => el.remove());
    document.querySelectorAll('[data-next-hide-fouc]').forEach(el => el.remove());
    // Remove Next.js internal elements
    const nextData = document.getElementById('__NEXT_DATA__');
    if (nextData) nextData.remove();
  });

  const bodyHTML = await page.evaluate(() => document.body.innerHTML);

  const standaloneHTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bimbo — Viral Campaign Report | 7 Marzo 2026</title>
  <style>
    ${appCSS}
  </style>
  <style>
    ${LIGHT_THEME_CSS}
  </style>
</head>
<body>
  ${bodyHTML}
</body>
</html>`;

  const htmlPath = path.join(OUTPUT_DIR, 'bimbo-2026-03-07-maker.html');
  fs.writeFileSync(htmlPath, standaloneHTML, 'utf-8');
  console.log('HTML saved:', htmlPath, '(' + (standaloneHTML.length / 1024).toFixed(0) + 'KB)');

  await browser.close();
  console.log('\nDone! Files in:', OUTPUT_DIR);
  console.log('  - bimbo-2026-03-07-maker.html');
  console.log('  - bimbo-2026-03-07-maker.pdf');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
