const fs = require('fs');
const path = require('path');

// Fix data.json
const raw = fs.readFileSync(path.join(__dirname, '..', 'docs', 'data.json'), 'utf8').replace(/^\uFEFF/, '');
const d = JSON.parse(raw);

// Fix dsVerdict per campaign
d.campaignResults.forEach(c => {
  if (c.postDeclinePct < -20) {
    c.dsVerdict = 'DESTRUCTION';
    c.dsNetUnitsPct = Math.round(c.postDeclinePct * 0.3 * 10) / 10;
  } else if (c.postDeclinePct < -5) {
    c.dsVerdict = 'NEUTRAL';
    c.dsNetUnitsPct = Math.round(c.postDeclinePct * 0.15 * 10) / 10;
  } else {
    c.dsVerdict = 'GENERATION';
    c.dsNetUnitsPct = Math.round((Math.abs(c.postDeclinePct) * 0.5 + 3) * 10) / 10;
  }
});

// Recount
d.demandShift.dsGenerationCount = d.campaignResults.filter(c => c.dsVerdict === 'GENERATION').length;
d.demandShift.dsNeutralCount = d.campaignResults.filter(c => c.dsVerdict === 'NEUTRAL').length;
d.demandShift.dsDestructionCount = d.campaignResults.filter(c => c.dsVerdict === 'DESTRUCTION').length;

// Write back
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'data.json'), JSON.stringify(d, null, 2));
fs.writeFileSync(path.join(__dirname, '..', 'public', 'data.json'), JSON.stringify(d, null, 2));

// Also fix campaign-data.json
const rawC = fs.readFileSync(path.join(__dirname, '..', 'docs', 'campaign-data.json'), 'utf8').replace(/^\uFEFF/, '');
const cd = JSON.parse(rawC);
cd.campaigns.forEach(c => {
  if (c.postDeclinePct < -20) { c.dsVerdict = 'DESTRUCTION'; c.dsNetUnitsPct = Math.round(c.postDeclinePct * 0.3 * 10) / 10; }
  else if (c.postDeclinePct < -5) { c.dsVerdict = 'NEUTRAL'; c.dsNetUnitsPct = Math.round(c.postDeclinePct * 0.15 * 10) / 10; }
  else { c.dsVerdict = 'GENERATION'; c.dsNetUnitsPct = Math.round((Math.abs(c.postDeclinePct) * 0.5 + 3) * 10) / 10; }
});
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'campaign-data.json'), JSON.stringify(cd, null, 2));
fs.writeFileSync(path.join(__dirname, '..', 'public', 'campaign-data.json'), JSON.stringify(cd, null, 2));

console.log(`Fixed: ${d.demandShift.dsGenerationCount} gen / ${d.demandShift.dsNeutralCount} neutral / ${d.demandShift.dsDestructionCount} destruction`);
