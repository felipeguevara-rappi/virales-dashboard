/**
 * Capture ALL endpoint data for ALL campaigns from the running local server.
 * This produces a full-data.json that is IDENTICAL to what the dashboard shows.
 * 
 * Prerequisites: localhost:3000 must be running with Snowflake authenticated.
 * Run: node scripts/capture-all.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE = 'http://localhost:3000';

function fetchJson(url, body = null) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    const reqOpts = { hostname: opts.hostname, port: opts.port, path: opts.pathname, method: body ? 'POST' : 'GET', headers: {} };
    if (body) { reqOpts.headers['Content-Type'] = 'application/json'; }
    
    const req = http.request(reqOpts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(180000, () => { req.destroy(); resolve(null); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== Capturing ALL data from localhost:3000 ===\n');

  // 1. Get campaign list
  console.log('Fetching campaign list...');
  const campData = await fetchJson(`${BASE}/api/campaigns`);
  if (!campData || !campData.campaigns) { console.error('Failed to get campaigns!'); process.exit(1); }
  const campaigns = campData.campaigns;
  console.log(`Found ${campaigns.length} campaigns.\n`);

  // 2. For each campaign, fetch all endpoints
  const allCampaignData = {};
  
  for (let i = 0; i < campaigns.length; i++) {
    const camp = campaigns[i];
    const body = { syncIds: camp.syncIds, viralDate: camp.fechaInicio };
    console.log(`[${i + 1}/${campaigns.length}] ${camp.nombre}...`);

    const results = {};

    results.impact = await fetchJson(`${BASE}/api/impact`, body);
    results.cannibalization = await fetchJson(`${BASE}/api/cannibalization`, body);
    results.retention = await fetchJson(`${BASE}/api/retention`, body);
    results.postDemand = await fetchJson(`${BASE}/api/post-demand`, body);
    results.crossBasket = await fetchJson(`${BASE}/api/cross-basket`, body);
    results.stockout = await fetchJson(`${BASE}/api/stockout`, body);
    results.productAnalysis = await fetchJson(`${BASE}/api/product-analysis`, body);
    results.repeatPurchase = await fetchJson(`${BASE}/api/repeat-purchase`, body);
    results.demandShift = await fetchJson(`${BASE}/api/demand-shift`, body);

    const ok = Object.values(results).filter(v => v !== null).length;
    console.log(`  ${ok}/9 endpoints OK`);

    allCampaignData[camp.id] = { ...camp, ...results };
  }

  // 3. Fetch executive report last (it's slow)
  console.log('\nFetching Executive Report...');
  const executive = await fetchJson(`${BASE}/api/executive`);
  console.log(executive ? '  ✓ Executive OK' : '  ✗ Executive FAILED (will use null)');

  // 4. Write full-data.json
  const output = {
    generatedAt: new Date().toISOString(),
    campaigns: campaigns,
    executive: executive,
    campaignData: allCampaignData,
  };

  const outPath = path.join(__dirname, '..', 'public', 'full-data.json');
  fs.writeFileSync(outPath, JSON.stringify(output));
  
  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
  console.log(`\n=== DONE ===`);
  console.log(`Output: ${outPath} (${sizeMB} MB)`);
  console.log(`Campaigns: ${campaigns.length}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
