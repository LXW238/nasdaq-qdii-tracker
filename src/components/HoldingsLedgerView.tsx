import { Edit3, Plus, Trash2, Wallet } from 'lucide-react';
import { useMemo } from 'react';
import {
  FundSnapshot,
  HoldingRecord,
  MarketBenchmarkResponse,
  WatchlistItem,
} from '../types';
import {
  PortfolioSummary,
  computeEstimatedValuation,
  computeHoldingPnL,
  formatCurrency,
  formatPct,
  getTrendColorClass,
} from '../utils/valuation';

interface HoldingsLedgerViewProps {
  watchlist: WatchlistItem[];
  holdings: Record<string, HoldingRecord>;
  snapshots: Record<string, FundSnapshot>;
  benchmark: MarketBenchmarkResponse | null;
  summary: PortfolioSummary;
  onSelectFund: (fundCode: string) => void;
  onEditHolding: (fundCode: string) => void;
  onRemoveHolding: (fundCode: string) => void;
  onOpenQuickHolding: () => void;
}

const ALLOC_COLORS = ['#1D4ED8', '#0284C7', '#0D9488', '#4F46E5', '#D97706', '#64748B'];

export function HoldingsLedgerView({
  watchlist,
  holdings,
  snapshots,
  benchmark,
  summary,
  onSelectFund,
  onEditHolding,
  onRemoveHolding,
  onOpenQuickHolding,
}: HoldingsLedgerViewProps) {
  const rows = useMemo(() => {
    const watchMap = new Map(watchlist.map((w) => [w.fundCode, w]));
    const list = Object.values(holdings)
      .filter((h) => h.shares > 0 && h.costNav > 0)
      .map((holding) => {
        const snap = snapshots[holding.fundCode];
        const watch = watchMap.get(holding.fundCode) || {
          fundCode: holding.fundCode,
          name: holding.name,
          category: 'qdii_other' as const,
          beta: 0.9,
        };
        const est = computeEstimatedValuation(watch, snap, benchmark);
        const pnl = computeHoldingPnL(holding, snap, est);
        const weight =
          summary.totalMarketValue > 0 ? (pnl.marketValue / summary.totalMarketValue) * 100 : 0;
        return {
          holding,
          snap,
          est,
          pnl,
          weight,
        };
      });

    list.sort((a, b) => b.pnl.marketValue - a.pnl.marketValue);
    return list;
  }, [holdings, watchlist, snapshots, benchmark, summary.totalMarketValue]);

  if (rows.length === 0) {
    return (
      <section className="bg-white border border-[#E5E9F0] rounded-xl p-10 sm:p-14 text-center">
        <div className="w-12 h-12 rounded-xl bg-[#EFF6FF] text-[#1D4ED8] flex items-center justify-center mx-auto">
          <Wallet className="w-6 h-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-[#0F172A]">尚未录入任何持仓份额</h2>
        <p className="mt-1.5 text-sm text-[#64748B] max-w-md mx-auto leading-relaxed">
          记录您持有的易方达全球成长精选、广发全球精选或纳斯达克100基金份额与持仓成本价，系统将结合美股盘中实时走势为您自动测算每日盈亏与累计收益率。
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={onOpenQuickHolding}
            className="inline-flex items-center gap-1.5 px-5 min-h-[44px] text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>录入首笔持仓</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Position Allocation Bar */}
      <section className="bg-white border border-[#E5E9F0] rounded-xl p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#0F172A]">持仓仓位分布</h2>
            <p className="mt-0.5 text-xs text-[#64748B]">
              按当前估算市值占比统计，共持有 {rows.length} 只基金
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenQuickHolding}
            className="inline-flex items-center gap-1.5 px-3.5 min-h-[38px] text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新增持仓</span>
          </button>
        </div>

        <div className="mt-4 h-3 w-full rounded-full overflow-hidden bg-[#F1F5F9] flex">
          {rows.map((r, idx) => (
            <div
              key={r.holding.fundCode}
              style={{
                width: `${Math.max(1.5, r.weight)}%`,
                backgroundColor: ALLOC_COLORS[idx % ALLOC_COLORS.length],
              }}
              title={`${r.snap?.name || r.holding.name}: ${r.weight.toFixed(1)}%`}
              className="h-full first:rounded-l-full last:rounded-r-full transition-all"
            />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
          {rows.map((r, idx) => (
            <div key={r.holding.fundCode} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0"
                style={{ backgroundColor: ALLOC_COLORS[idx % ALLOC_COLORS.length] }}
              />
              <span className="text-[#334155] truncate max-w-[180px]">
                {r.snap?.name || r.holding.name}
              </span>
              <span className="tabular-num font-medium text-[#0F172A]">
                {r.weight.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Holdings Ledger Table */}
      <section className="bg-white border border-[#E5E9F0] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F1F5F9]">
          <h3 className="text-base font-semibold text-[#0F172A]">持仓盈亏明细账本</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[780px]">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#F1F5F9] text-[11px] font-medium text-[#64748B]">
                <th className="py-2.5 px-5">基金名称</th>
                <th className="py-2.5 px-3 text-right">持有份额</th>
                <th className="py-2.5 px-3 text-right">成本价 / 估算价</th>
                <th className="py-2.5 px-3 text-right">估算市值</th>
                <th className="py-2.5 px-3 text-right">今日预估盈亏</th>
                <th className="py-2.5 px-3 text-right">累计持有盈亏</th>
                <th className="py-2.5 px-5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9] text-xs">
              {rows.map(({ holding, snap, pnl, weight }) => (
                <tr key={holding.fundCode} className="hover:bg-[#F8FAFC] transition-colors">
                  <td className="py-4 px-5">
                    <button
                      type="button"
                      onClick={() => onSelectFund(holding.fundCode)}
                      className="text-left group cursor-pointer"
                    >
                      <div className="font-medium text-[#0F172A] group-hover:text-[#1D4ED8] transition-colors">
                        {snap?.name || holding.name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#64748B]">
                        <span className="tabular-num">{holding.fundCode}</span>
                        <span className="mx-1.5">·</span>
                        <span className="tabular-num">仓位 {weight.toFixed(1)}%</span>
                        {holding.note && (
                          <>
                            <span className="mx-1.5">·</span>
                            <span>{holding.note}</span>
                          </>
                        )}
                      </div>
                    </button>
                  </td>
                  <td className="py-4 px-3 text-right tabular-num text-[#0F172A] font-medium">
                    {holding.shares.toLocaleString('zh-CN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="py-4 px-3 text-right tabular-num">
                    <div className="text-[#0F172A] font-medium">{pnl.estimatedNav.toFixed(4)}</div>
                    <div className="text-[11px] text-[#64748B]">成本 {holding.costNav.toFixed(4)}</div>
                  </td>
                  <td className="py-4 px-3 text-right tabular-num">
                    <div className="text-[#0F172A] font-semibold">
                      {formatCurrency(pnl.marketValue)}
                    </div>
                    <div className="text-[11px] text-[#64748B]">
                      本金 {formatCurrency(pnl.costTotal)}
                    </div>
                  </td>
                  <td
                    className={`py-4 px-3 text-right tabular-num font-semibold ${getTrendColorClass(
                      pnl.todayPnL
                    )}`}
                  >
                    <div>{formatCurrency(pnl.todayPnL, true)}</div>
                    <div className="text-[11px] font-medium">{formatPct(pnl.todayPct)}</div>
                  </td>
                  <td
                    className={`py-4 px-3 text-right tabular-num font-semibold ${getTrendColorClass(
                      pnl.totalPnL
                    )}`}
                  >
                    <div>{formatCurrency(pnl.totalPnL, true)}</div>
                    <div className="text-[11px] font-medium">{formatPct(pnl.totalReturnPct)}</div>
                  </td>
                  <td className="py-4 px-5 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onEditHolding(holding.fundCode)}
                        title="编辑持仓"
                        className="inline-flex items-center justify-center w-9 h-9 text-[#475569] hover:text-[#1D4ED8] hover:bg-[#EFF6FF] rounded-lg transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveHolding(holding.fundCode)}
                        title="删除持仓"
                        className="inline-flex items-center justify-center w-9 h-9 text-[#64748B] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
