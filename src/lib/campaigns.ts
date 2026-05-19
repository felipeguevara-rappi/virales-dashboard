import { CampaignWithMeta } from './types';
import fs from 'fs';
import path from 'path';

let cachedCampaigns: CampaignWithMeta[] | null = null;

/**
 * Strips currency formatting from a budget string (e.g. "$50,000" → 50000).
 * Returns 0 for invalid or empty values.
 */
function parseBudget(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Parses the catalogo_skus.csv file and groups rows into campaign records.
 *
 * Supports two CSV formats:
 * - 5-column (legacy): Nombre, Sync, Viral, Fecha, Status
 * - 8-column (current): Nombre, Sync, Viral, Ciudad, Budget Maker, Budget Growth, Fecha, Status
 *
 * Rows are grouped by (Viral, Fecha) to produce one campaign per brand+date combination.
 * Results are cached after first parse for the lifetime of the process.
 */
export function parseCampaigns(): CampaignWithMeta[] {
  if (cachedCampaigns) return cachedCampaigns;

  const csvPath = path.join(process.cwd(), 'catalogo_skus.csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.trim().split('\n');

  // Group by (Viral, Fecha)
  const groups = new Map<string, {
    nombre: string;
    fecha: string;
    syncIds: Set<number>;
    productos: Set<string>;
    statuses: string[];
    ciudad: string;
    budgetMaker: number;
    budgetGrowth: number;
  }>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV line respecting quoted fields
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { parts.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    parts.push(current.trim());

    if (parts.length < 5) continue;

    // Destructure based on column count (8-col vs legacy 5-col format)
    let producto: string;
    let syncRaw: string;
    let viral: string;
    let fecha: string;
    let status: string;
    let ciudad = '';
    let budgetMaker = 0;
    let budgetGrowth = 0;

    if (parts.length >= 8) {
      let budgetMakerRaw: string;
      let budgetGrowthRaw: string;
      [producto, syncRaw, viral, ciudad, budgetMakerRaw, budgetGrowthRaw, fecha, status] = parts;
      budgetMaker = parseBudget(budgetMakerRaw);
      budgetGrowth = parseBudget(budgetGrowthRaw);
    } else {
      [producto, syncRaw, viral, fecha, status] = parts;
    }

    const syncId = parseInt(syncRaw, 10);
    if (isNaN(syncId) || !viral || !fecha) continue;

    const key = `${viral}|${fecha}`;
    if (!groups.has(key)) {
      groups.set(key, {
        nombre: viral,
        fecha,
        syncIds: new Set<number>(),
        productos: new Set<string>(),
        statuses: [],
        ciudad,
        budgetMaker,
        budgetGrowth,
      });
    }
    const group = groups.get(key)!;
    group.syncIds.add(syncId);
    if (producto) group.productos.add(producto);
    group.statuses.push(status);

    // Update ciudad/budget if not yet set (first row with values wins)
    if (!group.ciudad && ciudad) group.ciudad = ciudad;
    if (!group.budgetMaker && budgetMaker) group.budgetMaker = budgetMaker;
    if (!group.budgetGrowth && budgetGrowth) group.budgetGrowth = budgetGrowth;
  }

  // Convert groups to campaigns
  // Date-based status: if fecha <= today, consider it executed regardless of CSV status
  const today = new Date().toISOString().slice(0, 10);
  const campaigns: CampaignWithMeta[] = [];
  for (const group of groups.values()) {
    campaigns.push({
      id: `${group.nombre}_${group.fecha}`,
      nombre: group.nombre,
      fecha: group.fecha,
      syncIds: [...group.syncIds],
      status: (group.fecha <= today || group.statuses.every(s => s === 'Ejecutado'))
        ? 'Ejecutado'
        : 'Pendiente',
      productos: [...group.productos],
      ciudad: group.ciudad,
      budgetMaker: group.budgetMaker,
      budgetGrowth: group.budgetGrowth,
    });
  }

  // Sort by fecha descending (newest first)
  campaigns.sort((a, b) => b.fecha.localeCompare(a.fecha));

  cachedCampaigns = campaigns;
  return campaigns;
}


