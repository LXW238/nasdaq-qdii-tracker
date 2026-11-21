import { ArrowDownRight, ArrowUpRight, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORY_LABELS } from '../constants/defaultFunds';
import {
  FundSnapshot,
  FundSparkPoint,
  HoldingRecord,
  MarketBenchmarkResponse,
  WatchlistItem,
} from '../types';
import {
  computeEstimatedValuation,
  computeHoldingPnL,
  formatCurrency,
  formatPct,
  getTrendColorClass,
} from '../utils/valuation';

type ListFilter = 'all' | 'held' | 'index_ndx' | 'global_active';

interface FundListPanelProps {
  watchlist: WatchlistItem[];
  holdings: Record<string, HoldingRecord>;
  snapshots: Record<string, FundSnapshot>;
  benchmark: MarketBenchmarkResponse | null;
  selectedCode: string;
  loadingBatch: boolean;
  onSelectFund: (fundCode: string) => void;
  onOpenSearch: () => void;
  onEditHolding: (fundCode: string) => void;
}

function MiniSparkline({ points, isUp }: { points: FundSparkPoint[]; isUp: boolean }) {
  if (!points || points.length < 2) {
    return <div className="w-14 h-6" />;
  }
  const values = points.map((p) => p.nav);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 56;
  const h = 24;
  const coords = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - 2 - ((v - min) / range) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <polyline
        fill="none"
        stroke={isUp ? '#DC2626' : '#16A34A'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords}
      />
    </svg>
  );
}

export function FundListPanel({
  watchlist,
  holdings,
  snapshots,
  benchmark,
  selectedCode,
  loadingBatch,
  onSelectFund,
  onOpenSearch,
  onEditHolding,
}: FundListPanelProps) {
  const [filter, setFilter] = useState<ListFilter>('all');
  const [quickQuery, setQuickQuery] = useState('');

  const filtered = useMemo(() => {
    const q = quickQuery.trim().toLowerCase();
    return watchlist.filter((item) => {
      if (filter === 'held' && !holdings[item.fundCode]) return false;
      if (filter === 'index_ndx' && item.category !== 'index_ndx') return false;
      if (filter === 'global_active' && item.category !== 'global_active') return false;
      if (q) {
        const snapName = snapshots[item.fundCode]?.name || item.name;
        return (
          item.fundCode.includes(q) ||
          snapName.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [watchlist, holdings, snapshots, filter, quickQuery]);

  const filterButtons: Array<{ id: ListFilter; label: string }> = [
    { id: 'all', label: `全部 (${watchlist.length})` },
    { id: 'held', label: `持仓 (${Object.keys(holdings).length})` },
    { id: 'index_ndx', label: '纳指指数' },
    { id: 'global_active', label: '全球精选' },
  ];

  return (
    <section
      aria-label="自选与关注基金列表"
      className="bg-white border border-[#E5E9F0] rounded-xl overflow-hidden flex flex-col"
    >
      {/* Header Controls */}
      <div className="p-4 border-b border-[#F1F5F9] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-[#0F172A]">自选基金行情</h2>
          <button
            type="button"
            onClick={onOpenSearch}
            className="inline-flex items-center gap-1 px-2.5 min-h-[34px] text-xs font-medium text-[#1D4ED8] hover:bg-[#EFF6FF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>添加代码</span>
          </button>
        </div>

        {/* Filter Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg overflow-x-auto">
          {filterButtons.map((btn) => {
            const active = filter === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => setFilter(btn.id)}
                className={`flex-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {btn.label}
              </button>
            );
          })}
        </div>

        {/* Inline Filter Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={quickQuery}
            onChange={(e) => setQuickQuery(e.target.value)}
            placeholder="筛选列表中的基金名称或6位代码..."
            className="w-full h-9 pl-9 pr-3 text-xs bg-[#F8FAFC] border border-[#E5E9F0] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:bg-white focus:border-[#1D4ED8] focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Column Subheader */}
      <div className="px-4 py-2 bg-[#F8FAFC] border-b border-[#F1F5F9] flex items-center justify-between text-[11px] font-medium text-[#64748B]">
        <span>基金名称 / 净值日期</span>
        <div className="flex items-center gap-5">
          <span className="hidden sm:inline w-14 text-center">近30日</span>
          <span className="w-16 text-right">估算净值</span>
          <span className="w-[74px] text-right">估算涨跌</span>
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-[#F1F5F9]">
        {loadingBatch && Object.keys(snapshots).length === 0 ? (
          Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="px-4 py-3.5 flex items-center justify-between gap-3">
              <div className="space-y-2 flex-1">
                <div className="h-4 w-44 bg-[#F1F5F9] rounded animate-pulse" />
                <div className="h-3 w-32 bg-[#F8FAFC] rounded animate-pulse" />
              </div>
              <div className="h-5 w-16 bg-[#F1F5F9] rounded animate-pulse" />
              <div className="h-5 w-16 bg-[#F1F5F9] rounded animate-pulse" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-[#334155]">
              {filter === 'held' ? '当前暂无持仓基金' : '未找到匹配的基金'}
            </p>
            <p className="mt-1 text-xs text-[#64748B]">
              {filter === 'held'
                ? '选中任意一只自选基金即可录入持有份额与成本价。'
                : '可以点击右上角「添加代码」搜索全市场 QDII 基金。'}
            </p>
            <button
              type="button"
              onClick={filter === 'held' ? () => setFilter('all') : onOpenSearch}
              className="mt-4 px-4 py-2 min-h-[40px] text-xs font-medium text-[#1D4ED8] bg-[#EFF6FF] hover:bg-[#DBEAFE] rounded-lg transition-colors cursor-pointer"
            >
              {filter === 'held' ? '查看全部自选' : '搜索并添加基金'}
            </button>
          </div>
        ) : (
          filtered.map((item) => {
            const snap = snapshots[item.fundCode];
            const est = computeEstimatedValuation(item, snap, benchmark);
            const holding = holdings[item.fundCode];
            const pnl = holding ? computeHoldingPnL(holding, snap, est) : null;
            const isSelected = selectedCode === item.fundCode;

            const displayName = snap?.name || item.name;
            const changePct = est ? est.estimatedChangePct : snap?.officialChangePct ?? null;
            const navDisplay = est ? est.estimatedNav : snap?.officialNav ?? null;
            const changeColor = getTrendColorClass(changePct);
            const sparkUp =
              snap && snap.sparkline.length >= 2
                ? snap.sparkline[snap.sparkline.length - 1].nav >= snap.sparkline[0].nav
                : (changePct ?? 0) >= 0;

            return (
              <div
                key={item.fundCode}
                role="button"
                tabIndex={0}
                onClick={() => onSelectFund(item.fundCode)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectFund(item.fundCode);
                  }
                }}
                className={`px-4 py-3.5 min-h-[68px] flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                  isSelected ? 'bg-[#EFF6FF]/65' : 'hover:bg-[#F8FAFC]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`text-sm font-medium truncate ${
                        isSelected ? 'text-[#1D4ED8] font-semibold' : 'text-[#0F172A]'
                      }`}
                    >
                      {displayName}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#64748B] truncate">
                    <span className="tabular-num">{item.fundCode}</span>
                    <span aria-hidden="true">·</span>
                    <span>{CATEGORY_LABELS[item.category]}</span>
                    {snap?.navDate && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-num">净值 {snap.navDate.slice(5)}</span>
                      </>
                    )}
                    {pnl && (
                      <>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditHolding(item.fundCode);
                          }}
                          className={`tabular-num font-medium hover:underline cursor-pointer ${getTrendColorClass(
                            pnl.totalPnL
                          )}`}
                        >
                          持有 {formatCurrency(pnl.totalPnL, true)}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-5 shrink-0">
                  <div className="hidden sm:flex items-center justify-center w-14">
                    <MiniSparkline points={snap?.sparkline || []} isUp={sparkUp} />
                  </div>

                  <div className="w-16 text-right">
                    <div className="text-sm font-semibold text-[#0F172A] tabular-num">
                      {navDisplay && navDisplay > 0 ? navDisplay.toFixed(4) : '--'}
                    </div>
                    <div className="text-[11px] text-[#94A3B8] tabular-num">
                      {snap && snap.officialNav > 0 ? `官 ${snap.officialNav.toFixed(4)}` : '--'}
                    </div>
                  </div>

                  <div className="w-[74px] text-right">
                    <div
                      className={`inline-flex items-center justify-end gap-0.5 text-sm font-semibold tabular-num ${changeColor}`}
                    >
                      {changePct !== null && changePct > 0 && (
                        <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                      )}
                      {changePct !== null && changePct < 0 && (
                        <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{formatPct(changePct)}</span>
                    </div>
                    <div className="text-[11px] text-[#94A3B8] tabular-num">
                      {snap ? `官 ${formatPct(snap.officialChangePct)}` : '--'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
