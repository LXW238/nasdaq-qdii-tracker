import {
  BenchmarkHistoryPoint,
  ChartRange,
  EstimatedValuation,
  FundHistoryPoint,
  FundSnapshot,
  HoldingRecord,
  MarketBenchmarkResponse,
  WatchlistItem,
} from '../types';

export function computeEstimatedValuation(
  item: WatchlistItem,
  snapshot: FundSnapshot | undefined,
  benchmark: MarketBenchmarkResponse | null
): EstimatedValuation | null {
  if (!snapshot || snapshot.officialNav <= 0) return null;

  // If official intraday estimation exists (typically domestic funds) and no QDII keyword
  if (snapshot.officialIntraday && item.category === 'qdii_other' && !/QDII|纳斯达克|纳指|全球|标普/i.test(snapshot.name)) {
    return {
      estimatedNav: snapshot.officialIntraday.gsz,
      estimatedChangePct: snapshot.officialIntraday.gszzl,
      sourceLabel: `盘中估值 ${snapshot.officialIntraday.gztime.slice(5)}`,
      basisName: '天天基金实时估值',
      basisChangePct: snapshot.officialIntraday.gszzl,
      fxImpactPct: 0,
      betaUsed: 1,
      isOfficialIntraday: true,
    };
  }

  const ndx = benchmark?.ndx ?? null;
  const nq = benchmark?.nqFutures ?? null;
  const usdcny = benchmark?.usdcny ?? null;
  const beta = Number.isFinite(item.beta) ? Math.min(2, Math.max(0.1, item.beta)) : 0.9;

  // Determine the freshest Nasdaq-100 move relative to fund's last published official navDate
  let basisName = '纳指100最新交易日';
  let basisChangePct = ndx?.changePct ?? 0;

  if (ndx && snapshot.navDate && ndx.tradeDate > snapshot.navDate) {
    // Check if there is a multi-day gap between fund's official NAV date and latest NDX price
    const hist = benchmark?.ndxHistory || [];
    const baseBar = [...hist].reverse().find((pt) => pt.date <= snapshot.navDate);
    if (baseBar && baseBar.close > 0 && ndx.price > 0) {
      basisChangePct = Number((((ndx.price - baseBar.close) / baseBar.close) * 100).toFixed(2));
      basisName =
        ndx.marketState === 'REGULAR'
          ? '纳指100盘中映射'
          : `纳指100 (${snapshot.navDate.slice(5)}→${ndx.tradeDate.slice(5)})`;
    } else {
      basisChangePct = ndx.changePct;
      basisName = ndx.marketState === 'REGULAR' ? '纳指100盘中映射' : '纳指100隔夜映射';
    }
  } else if (nq && Math.abs(nq.changePct) > 0.01 && ndx?.marketState !== 'REGULAR') {
    basisChangePct = nq.changePct;
    basisName = '纳指100期货盘前映射';
  } else if (ndx) {
    basisChangePct = ndx.changePct;
    basisName = ndx.marketState === 'REGULAR' ? '纳指100盘中映射' : '纳指100最新映射';
  }

  // USD-denominated QDII share classes do not have CNY FX impact
  const fxWeight = snapshot.isUsdClass ? 0 : 0.9;
  const rawFxPct = usdcny ? usdcny.changePct : 0;
  const fxImpactPct = Number((rawFxPct * fxWeight).toFixed(2));

  const estimatedChangePct = Number((basisChangePct * beta + fxImpactPct).toFixed(2));
  const estimatedNav = Number(
    (snapshot.officialNav * (1 + estimatedChangePct / 100)).toFixed(4)
  );

  return {
    estimatedNav,
    estimatedChangePct,
    sourceLabel: basisName,
    basisName,
    basisChangePct,
    fxImpactPct,
    betaUsed: beta,
    isOfficialIntraday: false,
  };
}

export interface HoldingPnL {
  fundCode: string;
  shares: number;
  costNav: number;
  costTotal: number;
  officialNav: number;
  estimatedNav: number;
  marketValue: number;
  todayPnL: number;
  todayPct: number;
  totalPnL: number;
  totalReturnPct: number;
}

export function computeHoldingPnL(
  holding: HoldingRecord,
  snapshot: FundSnapshot | undefined,
  estimate: EstimatedValuation | null
): HoldingPnL {
  const officialNav = snapshot && snapshot.officialNav > 0 ? snapshot.officialNav : holding.costNav;
  const estimatedNav = estimate ? estimate.estimatedNav : officialNav;
  const todayPct = estimate ? estimate.estimatedChangePct : snapshot?.officialChangePct ?? 0;

  const costTotal = holding.shares * holding.costNav;
  const marketValue = holding.shares * estimatedNav;
  const prevValue = holding.shares * officialNav;
  const todayPnL = estimate ? marketValue - prevValue : prevValue * (todayPct / 100);
  const totalPnL = marketValue - costTotal;
  const totalReturnPct = costTotal > 0 ? (totalPnL / costTotal) * 100 : 0;

  return {
    fundCode: holding.fundCode,
    shares: holding.shares,
    costNav: holding.costNav,
    costTotal,
    officialNav,
    estimatedNav,
    marketValue,
    todayPnL,
    todayPct,
    totalPnL,
    totalReturnPct,
  };
}

export interface PortfolioSummary {
  totalMarketValue: number;
  totalCost: number;
  todayPnL: number;
  todayPnLPct: number;
  totalPnL: number;
  totalPnLPct: number;
  holdingCount: number;
}

export function computePortfolioSummary(
  holdings: Record<string, HoldingRecord>,
  watchlist: WatchlistItem[],
  snapshots: Record<string, FundSnapshot>,
  benchmark: MarketBenchmarkResponse | null
): PortfolioSummary {
  const watchMap = new Map(watchlist.map((w) => [w.fundCode, w]));
  let totalMarketValue = 0;
  let totalCost = 0;
  let todayPnL = 0;
  let holdingCount = 0;

  for (const h of Object.values(holdings)) {
    if (h.shares <= 0 || h.costNav <= 0) continue;
    holdingCount++;
    const snap = snapshots[h.fundCode];
    const watch = watchMap.get(h.fundCode) || {
      fundCode: h.fundCode,
      name: h.name,
      category: 'qdii_other' as const,
      beta: 0.9,
    };
    const est = computeEstimatedValuation(watch, snap, benchmark);
    const pnl = computeHoldingPnL(h, snap, est);
    totalMarketValue += pnl.marketValue;
    totalCost += pnl.costTotal;
    todayPnL += pnl.todayPnL;
  }

  const totalPnL = totalMarketValue - totalCost;
  const prevTotalValue = totalMarketValue - todayPnL;
  const todayPnLPct = prevTotalValue > 0 ? (todayPnL / prevTotalValue) * 100 : 0;
  const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  return {
    totalMarketValue,
    totalCost,
    todayPnL,
    todayPnLPct,
    totalPnL,
    totalPnLPct,
    holdingCount,
  };
}

export function sliceHistoryByRange(
  history: FundHistoryPoint[],
  range: ChartRange
): FundHistoryPoint[] {
  if (history.length === 0 || range === 'ALL') return history;
  const lastDate = new Date(`${history[history.length - 1].date}T00:00:00Z`);
  const cutoff = new Date(lastDate);
  if (range === '1M') cutoff.setUTCMonth(cutoff.getUTCMonth() - 1);
  else if (range === '3M') cutoff.setUTCMonth(cutoff.getUTCMonth() - 3);
  else if (range === '6M') cutoff.setUTCMonth(cutoff.getUTCMonth() - 6);
  else if (range === '1Y') cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);

  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const sliced = history.filter((pt) => pt.date >= cutoffStr);
  return sliced.length >= 2 ? sliced : history.slice(-30);
}

export interface ChartSeriesPoint {
  date: string;
  nav: number;
  dailyReturn: number;
  fundReturnPct: number;
  ndxReturnPct: number | null;
}

export function buildChartSeries(
  sliced: FundHistoryPoint[],
  ndxHistory: BenchmarkHistoryPoint[]
): {
  series: ChartSeriesPoint[];
  periodReturnPct: number;
  maxDrawdownPct: number;
  highNav: number;
  lowNav: number;
} {
  if (sliced.length === 0) {
    return { series: [], periodReturnPct: 0, maxDrawdownPct: 0, highNav: 0, lowNav: 0 };
  }

  // Downsample gently if ALL range has > 450 points so Recharts stays silky smooth
  const step = sliced.length > 450 ? Math.ceil(sliced.length / 400) : 1;
  const sampled: FundHistoryPoint[] = [];
  for (let i = 0; i < sliced.length; i += step) {
    sampled.push(sliced[i]);
  }
  if (sampled[sampled.length - 1] !== sliced[sliced.length - 1]) {
    sampled.push(sliced[sliced.length - 1]);
  }

  const startNav = sliced[0].nav;
  const endNav = sliced[sliced.length - 1].nav;
  const periodReturnPct = startNav > 0 ? ((endNav - startNav) / startNav) * 100 : 0;

  let peak = sliced[0].nav;
  let maxDrawdown = 0;
  let highNav = sliced[0].nav;
  let lowNav = sliced[0].nav;
  for (const pt of sliced) {
    if (pt.nav > peak) peak = pt.nav;
    if (pt.nav > highNav) highNav = pt.nav;
    if (pt.nav < lowNav) lowNav = pt.nav;
    const dd = peak > 0 ? ((pt.nav - peak) / peak) * 100 : 0;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }

  // Build NDX lookup by closest date <= fund date
  const sortedNdx = [...ndxHistory].sort((a, b) => a.date.localeCompare(b.date));
  const findNdxClose = (targetDate: string): number | null => {
    if (sortedNdx.length === 0) return null;
    if (targetDate < sortedNdx[0].date) return null;
    let lo = 0;
    let hi = sortedNdx.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sortedNdx[mid].date <= targetDate) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans >= 0 ? sortedNdx[ans].close : null;
  };

  const baseNdx = findNdxClose(sampled[0].date);

  const series: ChartSeriesPoint[] = sampled.map((pt) => {
    const fundReturnPct = startNav > 0 ? Number((((pt.nav - startNav) / startNav) * 100).toFixed(2)) : 0;
    let ndxReturnPct: number | null = null;
    if (baseNdx && baseNdx > 0) {
      const currentNdx = findNdxClose(pt.date);
      if (currentNdx && currentNdx > 0) {
        ndxReturnPct = Number((((currentNdx - baseNdx) / baseNdx) * 100).toFixed(2));
      }
    }
    return {
      date: pt.date,
      nav: pt.nav,
      dailyReturn: pt.dailyReturn,
      fundReturnPct,
      ndxReturnPct,
    };
  });

  return {
    series,
    periodReturnPct: Number(periodReturnPct.toFixed(2)),
    maxDrawdownPct: Number(maxDrawdown.toFixed(2)),
    highNav,
    lowNav,
  };
}

export function formatCurrency(val: number, showSign = false): string {
  const abs = Math.abs(val);
  const formatted = abs.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (showSign) {
    if (val > 0.004) return `+¥${formatted}`;
    if (val < -0.004) return `-¥${formatted}`;
    return `¥0.00`;
  }
  return val < 0 ? `-¥${formatted}` : `¥${formatted}`;
}

export function formatPct(val: number | null | undefined, showSign = true): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '--';
  const sign = showSign && val > 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

export function getTrendColorClass(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val) || Math.abs(val) < 0.0001) {
    return 'text-[#64748B]';
  }
  // Red Rise / Green Fall (Chinese financial convention)
  return val > 0 ? 'text-[#DC2626]' : 'text-[#16A34A]';
}

export function getTrendSoftBgClass(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val) || Math.abs(val) < 0.0001) {
    return 'bg-[#F1F5F9] text-[#475569]';
  }
  return val > 0 ? 'bg-[#FEF2F2] text-[#DC2626]' : 'bg-[#F0FDF4] text-[#16A34A]';
}
