import {
  ArrowDownRight,
  ArrowUpRight,
  Edit3,
  Minus,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CATEGORY_LABELS } from '../constants/defaultFunds';
import {
  ChartRange,
  FundHistoryResponse,
  FundSnapshot,
  HoldingRecord,
  MarketBenchmarkResponse,
  WatchlistItem,
} from '../types';
import {
  buildChartSeries,
  computeEstimatedValuation,
  computeHoldingPnL,
  formatCurrency,
  formatPct,
  getTrendColorClass,
  sliceHistoryByRange,
} from '../utils/valuation';

interface FundDetailPanelProps {
  item: WatchlistItem | undefined;
  snapshot: FundSnapshot | undefined;
  history: FundHistoryResponse | null;
  historyLoading: boolean;
  historyError: string | null;
  benchmark: MarketBenchmarkResponse | null;
  holding: HoldingRecord | undefined;
  onEditHolding: (fundCode: string) => void;
  onRemoveHolding: (fundCode: string) => void;
  onRemoveFromWatchlist: (fundCode: string) => void;
  onUpdateBeta: (fundCode: string, nextBeta: number) => void;
  onRetryHistory: (fundCode: string) => void;
  canRemoveWatchlist: boolean;
}

const RANGE_OPTIONS: Array<{ id: ChartRange; label: string }> = [
  { id: '1M', label: '近1月' },
  { id: '3M', label: '近3月' },
  { id: '6M', label: '近6月' },
  { id: '1Y', label: '近1年' },
  { id: 'ALL', label: '成立以来' },
];

export function FundDetailPanel({
  item,
  snapshot,
  history,
  historyLoading,
  historyError,
  benchmark,
  holding,
  onEditHolding,
  onRemoveHolding,
  onRemoveFromWatchlist,
  onUpdateBeta,
  onRetryHistory,
  canRemoveWatchlist,
}: FundDetailPanelProps) {
  const [range, setRange] = useState<ChartRange>('6M');
  const [chartMode, setChartMode] = useState<'nav' | 'compare'>('compare');
  const [showBetaConfig, setShowBetaConfig] = useState(false);

  const estimate = useMemo(
    () => (item ? computeEstimatedValuation(item, snapshot, benchmark) : null),
    [item, snapshot, benchmark]
  );

  const pnl = useMemo(
    () => (holding ? computeHoldingPnL(holding, snapshot, estimate) : null),
    [holding, snapshot, estimate]
  );

  const chartData = useMemo(() => {
    const raw = history?.history || [];
    const sliced = sliceHistoryByRange(raw, range);
    return buildChartSeries(sliced, benchmark?.ndxHistory || []);
  }, [history, range, benchmark]);

  if (!item) {
    return (
      <section className="bg-white border border-[#E5E9F0] rounded-xl p-10 text-center">
        <p className="text-sm font-medium text-[#334155]">请选择左侧任意一只基金查看走势与估算详情</p>
      </section>
    );
  }

  const displayName = snapshot?.name || history?.name || item.name;
  const estPct = estimate?.estimatedChangePct ?? snapshot?.officialChangePct ?? null;
  const estNav = estimate?.estimatedNav ?? snapshot?.officialNav ?? null;
  const hasNdxOverlay = chartData.series.some((pt) => pt.ndxReturnPct !== null);
  const strokeColor = chartData.periodReturnPct >= 0 ? '#DC2626' : '#16A34A';

  return (
    <section
      aria-label="基金详情与走势分析"
      className="bg-white border border-[#E5E9F0] rounded-xl overflow-hidden"
    >
      {/* Top Identity Header */}
      <div className="p-5 sm:p-6 border-b border-[#F1F5F9]">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-[#0F172A] leading-snug">
              {displayName}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#64748B]">
              <span className="tabular-num font-medium text-[#334155]">{item.fundCode}</span>
              <span aria-hidden="true">·</span>
              <span>{CATEGORY_LABELS[item.category]}</span>
              {(snapshot?.managerName || history?.managerName) && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>经理 {snapshot?.managerName || history?.managerName}</span>
                </>
              )}
              {snapshot?.navDate && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-num">最新净值日 {snapshot.navDate}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onEditHolding(item.fundCode)}
              className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{holding ? '编辑持仓' : '记持仓'}</span>
            </button>
            {canRemoveWatchlist && (
              <button
                type="button"
                onClick={() => onRemoveFromWatchlist(item.fundCode)}
                title="移出自选"
                className="inline-flex items-center justify-center w-10 min-h-[40px] text-[#64748B] hover:text-[#DC2626] border border-[#E5E9F0] hover:border-[#FECACA] hover:bg-[#FEF2F2] rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 4-Column Metric Strip (No Nested Boxes) */}
        <div className="mt-5 pt-5 border-t border-[#F1F5F9] grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-0 sm:divide-x sm:divide-[#F1F5F9]">
          <div className="sm:pr-4">
            <p className="text-xs text-[#64748B]">盘中映射估算净值</p>
            <p className="mt-1 text-xl font-bold text-[#0F172A] tabular-num">
              {estNav && estNav > 0 ? estNav.toFixed(4) : '--'}
            </p>
            <p
              className={`mt-0.5 inline-flex items-center gap-0.5 text-xs font-semibold tabular-num ${getTrendColorClass(
                estPct
              )}`}
            >
              {estPct !== null && estPct > 0 && <ArrowUpRight className="w-3.5 h-3.5" />}
              {estPct !== null && estPct < 0 && <ArrowDownRight className="w-3.5 h-3.5" />}
              <span>{formatPct(estPct)}</span>
            </p>
          </div>

          <div className="sm:px-4">
            <p className="text-xs text-[#64748B]">官方确认净值</p>
            <p className="mt-1 text-xl font-bold text-[#0F172A] tabular-num">
              {snapshot && snapshot.officialNav > 0 ? snapshot.officialNav.toFixed(4) : '--'}
            </p>
            <p
              className={`mt-0.5 text-xs font-medium tabular-num ${getTrendColorClass(
                snapshot?.officialChangePct
              )}`}
            >
              日涨跌 {formatPct(snapshot?.officialChangePct)}
            </p>
          </div>

          <div className="sm:px-4">
            <p className="text-xs text-[#64748B]">近1年官方收益</p>
            <p
              className={`mt-1 text-xl font-bold tabular-num ${getTrendColorClass(
                snapshot?.returns.y1 ?? history?.returns.y1
              )}`}
            >
              {formatPct(snapshot?.returns.y1 ?? history?.returns.y1)}
            </p>
            <p className="mt-0.5 text-xs text-[#64748B] tabular-num">
              近3月 {formatPct(snapshot?.returns.m3 ?? history?.returns.m3)}
            </p>
          </div>

          <div className="sm:pl-4">
            <p className="text-xs text-[#64748B]">我的持有盈亏</p>
            {pnl ? (
              <>
                <p
                  className={`mt-1 text-xl font-bold tabular-num ${getTrendColorClass(
                    pnl.totalPnL
                  )}`}
                >
                  {formatCurrency(pnl.totalPnL, true)}
                </p>
                <p
                  className={`mt-0.5 text-xs font-medium tabular-num ${getTrendColorClass(
                    pnl.totalReturnPct
                  )}`}
                >
                  收益率 {formatPct(pnl.totalReturnPct)}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-base font-medium text-[#94A3B8]">未录入</p>
                <button
                  type="button"
                  onClick={() => onEditHolding(item.fundCode)}
                  className="mt-0.5 text-xs font-medium text-[#1D4ED8] hover:underline cursor-pointer"
                >
                  点击添加份额
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Trend Chart Section */}
      <div className="p-5 sm:p-6 border-b border-[#F1F5F9]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Chart Mode Switch */}
          <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg w-fit">
            <button
              type="button"
              onClick={() => setChartMode('compare')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                chartMode === 'compare'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              收益率对比（叠加纳指100）
            </button>
            <button
              type="button"
              onClick={() => setChartMode('nav')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                chartMode === 'nav'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              单位净值曲线
            </button>
          </div>

          {/* Period Selector */}
          <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg overflow-x-auto">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRange(opt.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  range === opt.id
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Period Quantitative Stats */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <span className="text-[#64748B]">
              区间涨跌{' '}
              <strong
                className={`tabular-num font-semibold ${getTrendColorClass(
                  chartData.periodReturnPct
                )}`}
              >
                {formatPct(chartData.periodReturnPct)}
              </strong>
            </span>
            <span className="text-[#64748B]">
              区间最大回撤{' '}
              <strong className="tabular-num font-semibold text-[#16A34A]">
                {formatPct(chartData.maxDrawdownPct)}
              </strong>
            </span>
            <span className="text-[#64748B]">
              区间高/低{' '}
              <strong className="tabular-num font-medium text-[#334155]">
                {chartData.highNav > 0 ? chartData.highNav.toFixed(4) : '--'} /{' '}
                {chartData.lowNav > 0 ? chartData.lowNav.toFixed(4) : '--'}
              </strong>
            </span>
          </div>

          {chartMode === 'compare' && (
            <div className="flex items-center gap-4 text-[11px] text-[#64748B]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-[2px] bg-[#1D4ED8] inline-block" />
                本基金收益率
              </span>
              {hasNdxOverlay && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-[2px] bg-[#94A3B8] border-t border-dashed border-[#64748B] inline-block" />
                  纳斯达克100基准
                </span>
              )}
            </div>
          )}
        </div>

        {/* Chart Canvas */}
        <div className="mt-4 h-[280px] sm:h-[310px] w-full">
          {historyLoading ? (
            <div className="h-full w-full bg-[#F8FAFC] rounded-lg flex items-center justify-center text-xs text-[#64748B]">
              正在加载历史净值走势...
            </div>
          ) : historyError ? (
            <div className="h-full w-full bg-[#F8FAFC] rounded-lg flex flex-col items-center justify-center gap-3 text-center px-4">
              <p className="text-xs text-[#64748B]">{historyError}</p>
              <button
                type="button"
                onClick={() => onRetryHistory(item.fundCode)}
                className="px-3.5 py-2 text-xs font-medium text-[#1D4ED8] bg-white border border-[#E5E9F0] rounded-lg hover:bg-[#EFF6FF] cursor-pointer"
              >
                重新加载走势
              </button>
            </div>
          ) : chartData.series.length < 2 ? (
            <div className="h-full w-full bg-[#F8FAFC] rounded-lg flex items-center justify-center text-xs text-[#64748B]">
              暂无足够的历史净值数据
            </div>
          ) : chartMode === 'compare' ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData.series}
                margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
              >
                <CartesianGrid stroke="#F1F5F9" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#94A3B8' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E5E9F0' }}
                  minTickGap={36}
                  tickFormatter={(v: string) => (range === 'ALL' ? v.slice(0, 7) : v.slice(5))}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94A3B8' }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
                />
                <ReferenceLine y={0} stroke="#CBD5E1" strokeDasharray="3 3" />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const pt = payload[0].payload as {
                      date: string;
                      nav: number;
                      dailyReturn: number;
                      fundReturnPct: number;
                      ndxReturnPct: number | null;
                    };
                    return (
                      <div className="bg-white border border-[#E5E9F0] rounded-lg px-3.5 py-2.5 shadow-md text-xs space-y-1">
                        <div className="font-medium text-[#0F172A] tabular-num">{label}</div>
                        <div className="flex items-center justify-between gap-5">
                          <span className="text-[#64748B]">单位净值</span>
                          <span className="font-semibold text-[#0F172A] tabular-num">
                            {pt.nav.toFixed(4)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-5">
                          <span className="text-[#64748B]">当日涨跌</span>
                          <span
                            className={`font-semibold tabular-num ${getTrendColorClass(
                              pt.dailyReturn
                            )}`}
                          >
                            {formatPct(pt.dailyReturn)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-5">
                          <span className="text-[#1D4ED8]">本基金区间收益</span>
                          <span
                            className={`font-semibold tabular-num ${getTrendColorClass(
                              pt.fundReturnPct
                            )}`}
                          >
                            {formatPct(pt.fundReturnPct)}
                          </span>
                        </div>
                        {pt.ndxReturnPct !== null && (
                          <div className="flex items-center justify-between gap-5">
                            <span className="text-[#64748B]">纳斯达克100</span>
                            <span
                              className={`font-medium tabular-num ${getTrendColorClass(
                                pt.ndxReturnPct
                              )}`}
                            >
                              {formatPct(pt.ndxReturnPct)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="fundReturnPct"
                  stroke="#1D4ED8"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#1D4ED8', stroke: '#FFFFFF', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
                {hasNdxOverlay && (
                  <Line
                    type="monotone"
                    dataKey="ndxReturnPct"
                    stroke="#94A3B8"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    connectNulls
                    activeDot={{ r: 3.5, fill: '#64748B', stroke: '#FFFFFF', strokeWidth: 1.5 }}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData.series}
                margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
              >
                <defs>
                  <linearGradient id="navAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={strokeColor} stopOpacity={0.14} />
                    <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#F1F5F9" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#94A3B8' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E5E9F0' }}
                  minTickGap={36}
                  tickFormatter={(v: string) => (range === 'ALL' ? v.slice(0, 7) : v.slice(5))}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 11, fill: '#94A3B8' }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={(v: number) => v.toFixed(2)}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const pt = payload[0].payload as {
                      date: string;
                      nav: number;
                      dailyReturn: number;
                    };
                    return (
                      <div className="bg-white border border-[#E5E9F0] rounded-lg px-3.5 py-2.5 shadow-md text-xs space-y-1">
                        <div className="font-medium text-[#0F172A] tabular-num">{label}</div>
                        <div className="flex items-center justify-between gap-5">
                          <span className="text-[#64748B]">单位净值</span>
                          <span className="font-semibold text-[#0F172A] tabular-num">
                            {pt.nav.toFixed(4)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-5">
                          <span className="text-[#64748B]">当日涨跌</span>
                          <span
                            className={`font-semibold tabular-num ${getTrendColorClass(
                              pt.dailyReturn
                            )}`}
                          >
                            {formatPct(pt.dailyReturn)}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="nav"
                  stroke={strokeColor}
                  strokeWidth={2}
                  fill="url(#navAreaFill)"
                  dot={false}
                  activeDot={{ r: 4, fill: strokeColor, stroke: '#FFFFFF', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Intraday Mapping Formula Breakdown + Beta Fine-Tuning */}
      {estimate && !estimate.isOfficialIntraday && (
        <div className="p-5 sm:p-6 border-b border-[#F1F5F9] bg-[#F8FAFC]/60">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold text-[#0F172A]">
                盘中美股映射估算拆解 · {estimate.basisName}
              </h3>
              <p className="mt-1 text-xs text-[#64748B] tabular-num">
                基准涨跌 ({formatPct(estimate.basisChangePct)}) × 弹性系数 β (
                {estimate.betaUsed.toFixed(2)})
                {snapshot?.isUsdClass
                  ? '（美元份额不含人民币汇率变动）'
                  : ` + 汇率影响 (${formatPct(estimate.fxImpactPct)})`}
                {' = '}
                <span
                  className={`font-semibold ${getTrendColorClass(estimate.estimatedChangePct)}`}
                >
                  {formatPct(estimate.estimatedChangePct)}
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowBetaConfig((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 min-h-[36px] text-xs font-medium text-[#334155] bg-white hover:bg-[#F1F5F9] border border-[#E5E9F0] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>调节 β ({item.beta.toFixed(2)})</span>
            </button>
          </div>

          {showBetaConfig && (
            <div className="mt-4 pt-3.5 border-t border-[#E5E9F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-[#64748B]">
                指数型 QDII 通常约 0.92–0.96，主动全球精选基金可依据实际美股科技仓位微调：
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onUpdateBeta(item.fundCode, Math.max(0.2, Number((item.beta - 0.05).toFixed(2))))}
                  aria-label="降低弹性系数"
                  className="w-9 h-9 flex items-center justify-center bg-white border border-[#E5E9F0] rounded-lg hover:bg-[#F1F5F9] cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5 text-[#334155]" />
                </button>
                <span className="w-14 text-center text-sm font-semibold tabular-num text-[#0F172A]">
                  {item.beta.toFixed(2)}
                </span>
                <button
                  type="button"
                  onClick={() => onUpdateBeta(item.fundCode, Math.min(1.5, Number((item.beta + 0.05).toFixed(2))))}
                  aria-label="提高弹性系数"
                  className="w-9 h-9 flex items-center justify-center bg-white border border-[#E5E9F0] rounded-lg hover:bg-[#F1F5F9] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-[#334155]" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Holding Position Detail Section */}
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[#0F172A]">该基金持仓盈亏明细</h3>
          {holding && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onEditHolding(item.fundCode)}
                className="text-xs font-medium text-[#1D4ED8] hover:underline cursor-pointer"
              >
                修改份额/加减仓
              </button>
              <button
                type="button"
                onClick={() => onRemoveHolding(item.fundCode)}
                className="text-xs font-medium text-[#64748B] hover:text-[#DC2626] cursor-pointer"
              >
                清空持仓
              </button>
            </div>
          )}
        </div>

        {holding && pnl ? (
          <div className="mt-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6 text-xs">
              <div>
                <p className="text-[#64748B]">持有份额</p>
                <p className="mt-1 text-sm font-semibold text-[#0F172A] tabular-num">
                  {holding.shares.toLocaleString('zh-CN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  份
                </p>
              </div>
              <div>
                <p className="text-[#64748B]">持仓成本单价</p>
                <p className="mt-1 text-sm font-semibold text-[#0F172A] tabular-num">
                  {holding.costNav.toFixed(4)}
                </p>
              </div>
              <div>
                <p className="text-[#64748B]">投入本金</p>
                <p className="mt-1 text-sm font-semibold text-[#0F172A] tabular-num">
                  {formatCurrency(pnl.costTotal)}
                </p>
              </div>
              <div>
                <p className="text-[#64748B]">估算持仓市值</p>
                <p className="mt-1 text-sm font-semibold text-[#0F172A] tabular-num">
                  {formatCurrency(pnl.marketValue)}
                </p>
              </div>
              <div>
                <p className="text-[#64748B]">今日预估盈亏</p>
                <p
                  className={`mt-1 text-sm font-semibold tabular-num ${getTrendColorClass(
                    pnl.todayPnL
                  )}`}
                >
                  {formatCurrency(pnl.todayPnL, true)} ({formatPct(pnl.todayPct)})
                </p>
              </div>
              <div>
                <p className="text-[#64748B]">累计持有盈亏</p>
                <p
                  className={`mt-1 text-sm font-semibold tabular-num ${getTrendColorClass(
                    pnl.totalPnL
                  )}`}
                >
                  {formatCurrency(pnl.totalPnL, true)} ({formatPct(pnl.totalReturnPct)})
                </p>
              </div>
            </div>
            {holding.note && (
              <p className="mt-4 pt-3 border-t border-[#F1F5F9] text-xs text-[#64748B]">
                备注：{holding.note}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 text-xs text-[#64748B]">
            <span>您尚未记录「{displayName}」的持有份额，录入后将自动追踪每日估算收益与累计盈亏。</span>
            <button
              type="button"
              onClick={() => onEditHolding(item.fundCode)}
              className="px-3.5 py-2 min-h-[38px] text-xs font-medium text-[#1D4ED8] bg-[#EFF6FF] hover:bg-[#DBEAFE] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              立即录入份额
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
