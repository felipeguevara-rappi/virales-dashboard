const path = require('path');
const fs = require('fs');
const csvPath = path.join(__dirname, '..', 'catalogo_skus.csv');
const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.trim().split('\n');
const today = new Date().toISOString().slice(0, 10);

const groups = new Map();
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const parts = []; let current = '', inQ = false;
  for (const ch of line) { if (ch === '"') { inQ = !inQ; continue; } if (ch === ',' && !inQ) { parts.push(current.trim()); current = ''; continue; } current += ch; }
  parts.push(current.trim());
  if (parts.length < 5) continue;
  let producto, syncRaw, viral, fecha, status;
  if (parts.length >= 8) {
    [producto, syncRaw, viral, , , , fecha, status] = parts;
  } else {
    [producto, syncRaw, viral, fecha, status] = parts;
  }
  const syncId = parseInt(syncRaw, 10);
  if (isNaN(syncId) || !viral || !fecha) continue;
  const key = `${viral}|${fecha}`;
  if (!groups.has(key)) groups.set(key, { name: viral, date: fecha, ids: [], productos: [] });
  const g = groups.get(key);
  if (!g.ids.includes(syncId)) g.ids.push(syncId);
  if (producto && !g.productos.includes(producto)) g.productos.push(producto);
}

const campaigns = [];
const future = [];
for (const g of groups.values()) {
  if (g.date <= today) {
    campaigns.push({ name: g.name, date: g.date, ids: g.ids, productos: g.productos });
  } else {
    future.push({ name: g.name, date: g.date });
  }
}
campaigns.sort((a, b) => a.date.localeCompare(b.date));

// Classify with 90-day freeze logic
const FREEZE_DAYS = 90;
const todayDate = new Date();
const frozen = [];
const active = [];
for (const c of campaigns) {
  const age = Math.floor((todayDate - new Date(c.date + 'T00:00:00Z')) / 86400000);
  if (age > FREEZE_DAYS) frozen.push({ ...c, age });
  else active.push({ ...c, age });
}

console.log(`Today: ${today}`);
console.log(`Total lines in CSV: ${lines.length - 1}`);
console.log(`Campaigns (date <= today): ${campaigns.length}`);
console.log(`Future campaigns (date > today): ${future.length}`);
console.log(`\n--- CLASSIFICATION ---`);
console.log(`FINALIZADA/FROZEN (>90 days): ${frozen.length}`);
console.log(`ACTIVE (<= 90 days): ${active.length}`);
console.log(`\nFrozen campaigns:`);
frozen.forEach(c => console.log(`  [${c.age}d] ${c.name} (${c.date})`));
console.log(`\nActive campaigns to process:`);
active.forEach(c => console.log(`  [${c.age}d] ${c.name} (${c.date})`));
console.log(`\nFuture campaigns (not processed):`);
future.forEach(c => console.log(`  ${c.name} (${c.date})`));
