/** Base campaign record parsed from the catalogo CSV. */
export interface Campaign {
  id: string;
  nombre: string;       // Viral column (brand name)
  fecha: string;        // Single date YYYY-MM-DD
  syncIds: number[];    // Array of Sync IDs for this campaign+date
  status: 'Pendiente' | 'Ejecutado';
  productos: string[];  // Product names in this campaign
}

/**
 * Extended campaign record that includes city-level targeting and budget metadata.
 * Populated when parsing the 8-column CSV format.
 */
export interface CampaignWithMeta extends Campaign {
  /** Target city filter string (e.g. "CDMX", "Nacional", "CDMX, QRO, PUE") */
  ciudad: string;
  /** Budget allocated to maker/brand partners (MXN) */
  budgetMaker: number;
  /** Budget allocated to growth/Rappi funding (MXN) */
  budgetGrowth: number;
}

/** Core KPI metrics for a campaign's impact analysis. */
export interface KPIData {
  gmvTotal: number;
  unitsSold: number;
  discountSpend: number;
  /** Discount spend funded by growth channels (Rappi + Shrinkage) */
  growthSpend: number;
  /** Discount spend funded by maker channels (Makers + Commercial + Partners + Blackbox + Monetization) */
  makerSpend: number;
  uniqueUsers: number;
  totalOrders: number;
  newUsers: number;
  retainedUsers: number;
  reactivatedUsers: number;
  cac: number;
}

/** Single data point for cannibalization/demand time-series analysis. */
export interface CannibalizationPoint {
  day: string;
  units: number;
  gmv: number;
  orders: number;
  dayIndex: number;
}


