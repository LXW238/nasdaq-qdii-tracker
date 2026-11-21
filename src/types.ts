export type FundCategory = 'index_ndx' | 'global_active' | 'qdii_other';

export interface WatchlistItem {
  fundCode: string;
  name: string;
  category: FundCategory;
  beta: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface HoldingRecord {
  fundCode: string;
  name: string;
  shares: number;
  costNav: number;
  note: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface BenchmarkQuote {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePct: number;
  marketState: string;
  tradeDate: string;
  updatedAt: number;
}

export interface BenchmarkHistoryPoint {
  date: string;
  close: number;
}

export interface MarketBenchmarkResponse {
  ndx: BenchmarkQuote | null;
  qqq: BenchmarkQuote | null;
  nqFutures: BenchmarkQuote | null;
  usdcny: BenchmarkQuote | null;
  ndxHistory: BenchmarkHistoryPoint[];
  fetchedAt: number;
}

export interface FundSparkPoint {
  date: string;
  nav: number;
}

export interface FundSnapshot {
  fundCode: string;
  name: string;
  officialNav: number;
  acNav: number | null;
  officialChangePct: number;
  navDate: string;
  returns: {
    m1: number | null;
    m3: number | null;
    m6: number | null;
    y1: number | null;
  };
  managerName: string;
  officialIntraday?: {
    gsz: number;
    gszzl: number;
    gztime: string;
  } | null;
  sparkline: FundSparkPoint[];
  isUsdClass: boolean;
  error?: string;
}

export interface FundHistoryPoint {
  date: string;
  nav: number;
  dailyReturn: number;
  acNav: number | null;
}

export interface FundHistoryResponse {
  fundCode: string;
  name: string;
  managerName: string;
  sourceRate: string;
  rate: string;
  minPurchase: string;
  returns: {
    m1: number | null;
    m3: number | null;
    m6: number | null;
    y1: number | null;
  };
  history: FundHistoryPoint[];
}

export interface FundSearchResult {
  fundCode: string;
  name: string;
  company: string;
  fundType: string;
  manager: string;
  latestNav: number | null;
  navDate: string;
  category: FundCategory;
  defaultBeta: number;
}

export interface EstimatedValuation {
  estimatedNav: number;
  estimatedChangePct: number;
  sourceLabel: string;
  basisName: string;
  basisChangePct: number;
  fxImpactPct: number;
  betaUsed: number;
  isOfficialIntraday: boolean;
}

export type ChartRange = '1M' | '3M' | '6M' | '1Y' | 'ALL';
export type NavTab = 'overview' | 'analysis' | 'holdings';
