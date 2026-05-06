import { Campaign } from './types';
import fs from 'fs';
import path from 'path';

let cachedCampaigns: Campaign[] | null = null;

export function parseCampaigns(): Campaign[] {
  if (cachedCampaigns) return cachedCampaigns;

  const csvPath = path.join(process.cwd(), 'Virales - Hoja 1.csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.trim().split('\n');

  // Skip header
  const campaigns: Campaign[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // CSV format: Fecha Inicio,Fecha Fin,Nombre,"sync1,sync2,..."
    // Handle quoted syncs field
    const match = line.match(/^([^,]+),([^,]+),([^,]+),\"?([^"]+)\"?$/);
    if (!match) continue;

    const [, fechaInicio, fechaFin, nombre, syncsRaw] = match;
    const syncIds = syncsRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));

    campaigns.push({
      id: `${nombre.trim()}_${fechaInicio.trim()}`,
      fechaInicio: fechaInicio.trim(),
      fechaFin: fechaFin.trim(),
      nombre: nombre.trim(),
      syncIds,
    });
  }

  cachedCampaigns = campaigns;
  return campaigns;
}

export function getCampaignById(id: string): Campaign | undefined {
  return parseCampaigns().find(c => c.id === id);
}

export function getCampaignsByNames(names: string[]): Campaign[] {
  const campaigns = parseCampaigns();
  return campaigns.filter(c => names.includes(c.nombre));
}
