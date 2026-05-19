/**
 * Validation tests for city filter, budget parsing, discount split, and warehouse CTE.
 * Run: node scripts/test-city-filter.js
 * Exit 0 on success, 1 on failure.
 */
const assert = require('assert');

// ─── City Map (mirrors the implementation from the plan) ──────────────────────
const CITY_MAP = {
  'cdmx': 'Ciudad de Mexico', 'ciudad de mexico': 'Ciudad de Mexico', 'cmx': 'Ciudad de Mexico', 'mexico': 'Ciudad de Mexico',
  'gdl': 'Guadalajara', 'guadalajara': 'Guadalajara',
  'mty': 'Monterrey', 'monterrey': 'Monterrey',
  'pue': 'Puebla', 'puebla': 'Puebla',
  'qro': 'Queretaro', 'queretaro': 'Queretaro', 'querétaro': 'Queretaro',
  'merida': 'Merida', 'mérida': 'Merida',
  'cuernavaca': 'Cuernavaca',
  'tijuana': 'Tijuana',
  'saltillo': 'Saltillo',
  'cancun': 'Cancún', 'cancún': 'Cancún',
  'hermosillo': 'Hermosillo',
};

function buildCityFilter(ciudadCSV) {
  if (!ciudadCSV || ciudadCSV.toLowerCase().includes('nacional')) return null;
  const parts = ciudadCSV.split(/[,·\/]/).map(s => s.replace(/solo pro users/gi, '').trim().toLowerCase()).filter(Boolean);
  const resolved = [...new Set(parts.map(p => CITY_MAP[p]).filter(Boolean))];
  return resolved.length > 0 ? resolved : null;
}

// ─── Budget Parser ────────────────────────────────────────────────────────────
function parseBudget(raw) {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[$,\s]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

// ─── Warehouse CTE Builder ────────────────────────────────────────────────────
function buildWarehouseCTE(ciudadFilter) {
  const cityClause = ciudadFilter ? `AND CITY IN (${ciudadFilter.map(c => `'${c}'`).join(',')})` : '';
  return `WITH wh AS (
    SELECT WAREHOUSE_ID, WAREHOUSE_NAME, CITY
    FROM RP_SILVER_DB_PROD.TURBO_CORE.MX_WAREHOUSE_NEW
    WHERE REAL_STATUS = 'Active' AND WAREHOUSE_NAME NOT ILIKE '%cedis%' ${cityClause}
    QUALIFY ROW_NUMBER() OVER (PARTITION BY WAREHOUSE_ID ORDER BY AIRFLOW_SYNCED DESC NULLS LAST) = 1
  )`;
}

// ─── Discount Split Logic ─────────────────────────────────────────────────────
function computeDiscountSplit(discountDetail) {
  const { rappi, makers, commercial, partners, shrinkage, blackbox, monetization } = discountDetail;
  const growthSpend = rappi + shrinkage;
  const makerSpend = makers + commercial + partners + blackbox + monetization;
  return { growthSpend, makerSpend, total: growthSpend + makerSpend };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL: ${name}`);
    console.error(`        ${e.message}`);
  }
}

console.log('\n=== 1. City Filter (buildCityFilter) ===\n');

test('"Nacional" returns null', () => {
  assert.strictEqual(buildCityFilter('Nacional'), null);
});

test('empty string returns null', () => {
  assert.strictEqual(buildCityFilter(''), null);
});

test('undefined returns null', () => {
  assert.strictEqual(buildCityFilter(undefined), null);
});

test('"CDMX" returns ["Ciudad de Mexico"]', () => {
  assert.deepStrictEqual(buildCityFilter('CDMX'), ['Ciudad de Mexico']);
});

test('"CDMX, QRO, PUE, MTY, GDL" returns 5 cities', () => {
  const result = buildCityFilter('CDMX, QRO, PUE, MTY, GDL');
  assert.deepStrictEqual(result, ['Ciudad de Mexico', 'Queretaro', 'Puebla', 'Monterrey', 'Guadalajara']);
});

test('"CDMX · Solo Pro Users" returns ["Ciudad de Mexico"]', () => {
  assert.deepStrictEqual(buildCityFilter('CDMX · Solo Pro Users'), ['Ciudad de Mexico']);
});

test('"Guadalajara" returns ["Guadalajara"]', () => {
  assert.deepStrictEqual(buildCityFilter('Guadalajara'), ['Guadalajara']);
});

test('Unknown city "Timbuctú" returns null', () => {
  assert.strictEqual(buildCityFilter('Timbuctú'), null);
});

console.log('\n=== 2. Budget Parsing ===\n');

test('"$50,000" parses to 50000', () => {
  assert.strictEqual(parseBudget('$50,000'), 50000);
});

test('"$120,000" parses to 120000', () => {
  assert.strictEqual(parseBudget('$120,000'), 120000);
});

test('"$0" parses to 0', () => {
  assert.strictEqual(parseBudget('$0'), 0);
});

test('empty string parses to 0', () => {
  assert.strictEqual(parseBudget(''), 0);
});

test('undefined parses to 0', () => {
  assert.strictEqual(parseBudget(undefined), 0);
});

console.log('\n=== 3. Discount Split Logic ===\n');

test('growthSpend = rappi + shrinkage', () => {
  const detail = { rappi: 1000, makers: 500, commercial: 800, partners: 200, shrinkage: 50, blackbox: 30, monetization: 100 };
  const { growthSpend } = computeDiscountSplit(detail);
  assert.strictEqual(growthSpend, 1050);
});

test('makerSpend = makers + commercial + partners + blackbox + monetization', () => {
  const detail = { rappi: 1000, makers: 500, commercial: 800, partners: 200, shrinkage: 50, blackbox: 30, monetization: 100 };
  const { makerSpend } = computeDiscountSplit(detail);
  assert.strictEqual(makerSpend, 1630);
});

test('growthSpend + makerSpend == total discountSpend', () => {
  const detail = { rappi: 2500, makers: 1200, commercial: 3000, partners: 400, shrinkage: 75, blackbox: 150, monetization: 600 };
  const { growthSpend, makerSpend, total } = computeDiscountSplit(detail);
  const expectedTotal = detail.rappi + detail.makers + detail.commercial + detail.partners + detail.shrinkage + detail.blackbox + detail.monetization;
  assert.strictEqual(total, expectedTotal);
  assert.strictEqual(growthSpend + makerSpend, expectedTotal);
});

test('all zeros gives zero total', () => {
  const detail = { rappi: 0, makers: 0, commercial: 0, partners: 0, shrinkage: 0, blackbox: 0, monetization: 0 };
  const { growthSpend, makerSpend, total } = computeDiscountSplit(detail);
  assert.strictEqual(growthSpend, 0);
  assert.strictEqual(makerSpend, 0);
  assert.strictEqual(total, 0);
});

console.log('\n=== 4. Warehouse CTE Generation ===\n');

test('No city filter → CTE has no AND CITY IN clause', () => {
  const cte = buildWarehouseCTE(null);
  assert.ok(!cte.includes('AND CITY IN'), `Expected no CITY IN clause but got: ${cte}`);
});

test('Single city filter → CTE contains AND CITY IN (\'Ciudad de Mexico\')', () => {
  const cte = buildWarehouseCTE(['Ciudad de Mexico']);
  assert.ok(cte.includes("AND CITY IN ('Ciudad de Mexico')"), `Expected CITY IN clause, got: ${cte}`);
});

test('Multiple cities → CTE contains proper IN list', () => {
  const cte = buildWarehouseCTE(['Ciudad de Mexico', 'Guadalajara']);
  assert.ok(cte.includes("AND CITY IN ('Ciudad de Mexico','Guadalajara')"), `Expected multi-city IN clause, got: ${cte}`);
});

test('CTE always includes base filters', () => {
  const cte = buildWarehouseCTE(['Monterrey']);
  assert.ok(cte.includes("REAL_STATUS = 'Active'"), 'Missing REAL_STATUS filter');
  assert.ok(cte.includes("WAREHOUSE_NAME NOT ILIKE '%cedis%'"), 'Missing CEDIS exclusion');
  assert.ok(cte.includes('QUALIFY ROW_NUMBER()'), 'Missing deduplication QUALIFY');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

console.log(`\n═══════════════════════════════════════════`);
console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`═══════════════════════════════════════════\n`);

process.exit(failed > 0 ? 1 : 0);
