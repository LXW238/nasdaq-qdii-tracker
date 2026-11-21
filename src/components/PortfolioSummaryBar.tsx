import { ArrowDownRight, ArrowUpRight, Plus, Wallet } from 'lucide-react';
import { PortfolioSummary, formatCurrency, formatPct, getTrendColorClass } from '../utils/valuation';

interface PortfolioSummaryBarProps {
  summary: PortfolioSummary;
  isCloudSynced: boolean;
  onOpenSearch: () => void;
  onOpenQuickHolding: () => void;
}

export function PortfolioSummaryBar({
  summary,
  isCloudSynced,
  onOpenSearch,
  onOpenQuickHolding,
}: PortfolioSummaryBarProps) {
  const hasHoldings = summary.holdingCount > 0;
  const todayColor = getTrendColorClass(summary.todayPnL);
  const totalColor = getTrendColorClass(summary.totalPnL);

  return (
    <section
      aria-label="资产与持仓盈亏总览"
      className="bg-white border border-[#E5E9F0] rounded-xl p-5 sm:p-6"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-5 border-b border-[#F1F5F9]">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#64748B]">
            <span>持仓资产总览</span>
            <span aria-hidden="true">·</span>
            <span>{hasHoldings ? `已持有 ${summary.holdingCount} 只基金` : '暂未录入持仓份额'}</span>
            <span aria-hidden="true">·</span>
            <span>{isCloudSynced ? '云端实时同步' : '本地暂存模式'}</span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-3 flex-wrap">
            <h1 className="text-3xl sm:text-[34px] font-bold tracking-tight text-[#0F172A] tabular-num leading-none">
              {formatCurrency(summary.totalMarketValue)}
            </h1>
            {hasHoldings && (
              <span className="text-xs text-[#64748B] tabular-num">
                投入本金 {formatCurrency(summary.totalCost)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenSearch}
            className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] sm:min-h-[40px] text-sm font-medium text-[#0F172A] bg-white hover:bg-[#F8FAFC] border border-[#E5E9F0] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#475569]" />
            <span>添加基金</span>
          </button>
          <button
            type="button"
            onClick={onOpenQuickHolding}
            className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] sm:min-h-[40px] text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Wallet className="w-4 h-4" />
            <span>{hasHoldings ? '更新持仓' : '录入首笔持仓'}</span>
          </button>
        </div>
      </div>

      {/* 3-Column Metric Row separated by subtle hairlines */}
      <div className="pt-5 grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-0 sm:divide-x sm:divide-[#F1F5F9]">
        <div className="sm:pr-6">
          <p className="text-xs text-[#64748B]">今日估算盈亏（纳指映射）</p>
          <div className={`mt-1.5 flex items-baseline gap-2 ${todayColor}`}>
            <span className="text-xl font-semibold tabular-num">
              {hasHoldings ? formatCurrency(summary.todayPnL, true) : '¥0.00'}
            </span>
            {hasHoldings && (
              <span className="inline-flex items-center gap-0.5 text-xs font-medium tabular-num">
                {summary.todayPnL > 0 && <ArrowUpRight className="w-3.5 h-3.5" />}
                {summary.todayPnL < 0 && <ArrowDownRight className="w-3.5 h-3.5" />}
                {formatPct(summary.todayPnLPct)}
              </span>
            )}
          </div>
        </div>

        <div className="sm:px-6">
          <p className="text-xs text-[#64748B]">累计持有盈亏</p>
          <div className={`mt-1.5 flex items-baseline gap-2 ${totalColor}`}>
            <span className="text-xl font-semibold tabular-num">
              {hasHoldings ? formatCurrency(summary.totalPnL, true) : '¥0.00'}
            </span>
            {hasHoldings && (
              <span className="inline-flex items-center gap-0.5 text-xs font-medium tabular-num">
                {summary.totalPnL > 0 && <ArrowUpRight className="w-3.5 h-3.5" />}
                {summary.totalPnL < 0 && <ArrowDownRight className="w-3.5 h-3.5" />}
                {formatPct(summary.totalPnLPct)}
              </span>
            )}
          </div>
        </div>

        <div className="sm:pl-6">
          <p className="text-xs text-[#64748B]">估值口径说明</p>
          <p className="mt-1.5 text-xs text-[#475569] leading-relaxed">
            结合东方财富最新确认净值、纳斯达克100实时波动与美元/人民币汇率映射估算，点击单只基金可微调弹性系数 β。
          </p>
        </div>
      </div>
    </section>
  );
}
