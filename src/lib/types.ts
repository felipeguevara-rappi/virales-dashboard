export interface Campaign {
  id: string;
  fechaInicio: string;
  fechaFin: string;
  nombre: string;
  syncIds: number[];
}

export interface KPIData {
  gmvTotal: number;
  unitsSold: number;
  discountSpend: number;
  uniqueUsers: number;
  totalOrders: number;
  newUsers: number;
  retainedUsers: number;
  reactivatedUsers: number;
  cac: number;
}

export interface CannibalizationPoint {
  day: string;
  units: number;
  gmv: number;
  orders: number;
  dayIndex: number;
}

export interface CannibalizationData {
  data: CannibalizationPoint[];
  baseline: { avgUnits: number; avgGmv: number };
  incrementalGmv: number;
  viralMultiplier: number;
  postViralVsBaseline: number;
}

export interface StockoutData {
  totalWarehouses: number;
  whWithStockout: number;
  totalProductsWithStock: number;
  totalProductsSoldOut: number;
  mixAffectedPct: number;
  mixFullCoveragePct: number;
  totalOpening: number;
  totalClosing: number;
  unitsSold: number;
  cityBreakdown: {
    city: string;
    whCount: number;
    stockBefore: number;
    stockAfter: number;
    stockDayAfter: number;
  }[];
}

export interface PortfolioItem {
  campaignName: string;
  date: string;
  gmv: number;
  discountInvestment: number;
  roi: number;
  orders: number;
  units: number;
}

export interface TrendItem {
  month: string;
  totalGmv: number;
  totalDiscount: number;
  avgRoi: number;
  campaigns: number;
}

export interface AIReportData {
  report: string;
  generatedAt: string;
}
