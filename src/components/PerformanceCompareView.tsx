import { ArrowDownRight, ArrowUpDown, ArrowUpRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORY_LABELS } from '../constants/defaultFunds';
import {
  FundHistoryResponse,
  FundSnapshot,
  HoldingRecord,
  MarketBenchmarkResponse,
  WatchlistItem,
} from '../types';
import { computeEstimatedValuation, formatPct, getTrendColorClass } from '../utils/valuation';
import { FundDetailPanel } from './FundDetailPanel';

type SortKey = 'est' | 'm1' | 'm3' | 'm6' | 'y1';

interface PerformanceCompareViewProps {
  watchlist: WatchlistItem[];
  holdings: Record<string, HoldingRecord>;
  snapshots: Record<string, FundSnapshot>;
  benchmark: MarketBenchmarkResponse | null;
  selectedCode: string;
  history: FundHistoryResponse | null;
  historyLoading: boolean;
  historyError: string | null;
  onSelectFund: (fundCode: string) => void;
  onEditHolding: (fundCode: string) => void;
  onRemoveHolding: (fundCode: string) => void;
  onRemoveFromWatchlist: (fundCode: string) => void;
  onUpdateBeta: (fundCode: string, nextBeta: number) => void;
  onRetryHistory: (fundCode: string) => void;
}

export function PerformanceCompareView({
  watchlist,
  holdings,
  snapshots,
  benchmark,
  selectedCode,
  history,
  historyLoading,
  historyError,
  onSelectFund,
  onEditHolding,
  onRemoveHolding,
  onRemoveFromWatchlist,
  onUpdateBeta,
  onRetryHistory,
}: PerformanceCompareViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('y1');
  const [sortDesc, setSortDesc] = useState(true);

  const selectedItem = watchlist.find((w) => w.fundCode === selectedCode) || watchlist[0];

  const rows = useMemo(() => {
    const mapped = watchlist.map((item) => {
      const snap = snapshots[item.fundCode];
      const est = computeEstimatedValuation(item, snap, benchmark);
      return {
        item,
        snap,
        est,
        estPct: est?.estimatedChangePct ?? snap?.officialChangePct ?? null,
        m1: snap?.returns.m1 ?? null,
        m3: snap?.returns.m3 ?? null,
        m6: snap?.returns.m6 ?? null,
        y1: snap?.returns.y1 ?? null,
      };
    });

    mapped.sort((a, b) => {
      const valA =
        sortKey === 'est' ? a.estPct : a[sortKey];
      const valB =
        sortKey === 'est' ? b.estPct : b[sortKey];
      const numA = valA ?? -9999;
      const numB = valB ?? -9999;
      return sortDesc ? numB - numA : numA - numB;
    });

    return mapped;
  }, [watchlist, snapshots, benchmark, sortKey, sortDesc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Horizontal Fund Switcher Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {watchlist.map((w) => {
          const active = w.fundCode === selectedItem?.fundCode;
          const name = snapshots[w.fundCode]?.name || w.name;
          return (
            <button
              key={w.fundCode}
              type="button"
              onClick={() => onSelectFund(w.fundCode)}
              className={`px-3.5 min-h-[38px] text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-[#0F172A] text-white border-[#0F172A]'
                  : 'bg-white text-[#475569] border-[#E5E9F0] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
              }`}
            >
              <span className="tabular-num mr-1.5 opacity-75">{w.fundCode}</span>
              <span>{name.length > 14 ? `${name.slice(0, 14)}…` : name}</span>
            </button>
          );
        })}
      </div>

      {/* Full-Width Interactive Chart & Valuation Panel */}
      <FundDetailPanel
        item={selectedItem}
        snapshot={selectedItem ? snapshots[selectedItem.fundCode] : undefined}
        history={history}
        historyLoading={historyLoading}
        historyError={historyError}
        benchmark={benchmark}
        holding={selectedItem ? holdings[selectedItem.fundCode] : undefined}
        onEditHolding={onEditHolding}
        onRemoveHolding={onRemoveHolding}
        onRemoveFromWatchlist={onRemoveFromWatchlist}
        onUpdateBeta={onUpdateBeta}
        onRetryHistory={onRetryHistory}
        canRemoveWatchlist={watchlist.length > 1}
      />

      {/* Multi-Fund Period Performance Comparison Table */}
      <section className="bg-white border border-[#E5E9F0] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F1F5F9] flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[#0F172A]">自选基金阶段业绩横向对比</h3>
            <p className="mt-0.5 text-xs text-[#64748B]">
              点击列标题排序，点击任意基金行切换上方走势图
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[680px]">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#F1F5F9] text-[11px] font-medium text-[#64748B]">
                <th className="py-2.5 px-5">基金名称</th>
                <th className="py-2.5 px-3 text-right">官方净值</th>
                {(
                  [
                    ['est', '今日估算'],
                    ['m1', '近1月'],
                    ['m3', '近3月'],
                    ['m6', '近6月'],
                    ['y1', '近1年'],
                  ] as Array<[SortKey, string]>
                ).map(([key, label]) => (
                  <th key={key} className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className={`inline-flex items-center gap-1 hover:text-[#0F172A] cursor-pointer ${
                        sortKey === key ? 'text-[#1D4ED8] font-semibold' : ''
                      }`}
                    >
                      <span>{label}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9] text-xs">
              {rows.map(({ item, snap, estPct, m1, m3, m6, y1 }) => {
                const isSelected = item.fundCode === selectedItem?.fundCode;
                return (
                  <tr
                    key={item.fundCode}
                    onClick={() => onSelectFund(item.fundCode)}
                    className={`transition-colors cursor-pointer ${
                      isSelected ? 'bg-[#EFF6FF]/60' : 'hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <td className="py-3.5 px-5">
                      <div
                        className={`font-medium ${
                          isSelected ? 'text-[#1D4ED8]' : 'text-[#0F172A]'
                        }`}
                      >
                        {snap?.name || item.name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#64748B]">
                        <span className="tabular-num">{item.fundCode}</span>
                        <span className="mx-1.5">·</span>
                        <span>{CATEGORY_LABELS[item.category]}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-right tabular-num text-[#0F172A] font-medium">
                      {snap && snap.officialNav > 0 ? snap.officialNav.toFixed(4) : '--'}
                    </td>
                    <td
                      className={`py-3.5 px-3 text-right tabular-num font-semibold ${getTrendColorClass(
                        estPct
                      )}`}
                    >
                      <span className="inline-flex items-center justify-end gap-0.5">
                        {estPct !== null && estPct > 0 && <ArrowUpRight className="w-3 h-3" />}
                        {estPct !== null && estPct < 0 && <ArrowDownRight className="w-3 h-3" />}
                        {formatPct(estPct)}
                      </span>
                    </td>
                    <td className={`py-3.5 px-3 text-right tabular-num font-medium ${getTrendColorClass(m1)}`}>
                      {formatPct(m1)}
                    </td>
                    <td className={`py-3.5 px-3 text-right tabular-num font-medium ${getTrendColorClass(m3)}`}>
                      {formatPct(m3)}
                    </td>
                    <td className={`py-3.5 px-3 text-right tabular-num font-medium ${getTrendColorClass(m6)}`}>
                      {formatPct(m6)}
                    </td>
                    <td className={`py-3.5 px-3 text-right tabular-num font-semibold ${getTrendColorClass(y1)}`}>
                      {formatPct(y1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
