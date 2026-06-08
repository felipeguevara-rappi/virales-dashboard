const fs = require('fs');
const html = fs.readFileSync('C:/Users/v-andresgue/Downloads/private_projects/virales/public/bimbo-2026-03-07-maker.html', 'utf-8');
const matches = html.match(/\/_next\/[^\s'"]+/g);
console.log('_next refs:', matches ? matches.length : 0);
if (matches) matches.slice(0, 10).forEach(m => console.log(' ', m));
// Check if there are script tags
const scripts = html.match(/<script[^>]*src="[^"]*"[^>]*>/g);
console.log('\nScript tags with src:', scripts ? scripts.length : 0);
if (scripts) scripts.forEach(s => console.log(' ', s));
const links = html.match(/<link[^>]*href="[^"]*"[^>]*>/g);
console.log('\nLink tags:', links ? links.length : 0);
if (links) links.forEach(l => console.log(' ', l));
