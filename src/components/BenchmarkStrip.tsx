import { ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import { BenchmarkQuote, MarketBenchmarkResponse } from '../types';
import { formatPct, getTrendColorClass } from '../utils/valuation';

interface BenchmarkStripProps {
  benchmark: MarketBenchmarkResponse | null;
  loading: boolean;
  refreshing: boolean;
  lastUpdated: number | null;
  onRefresh: () => void;
}

function marketStateText(state?: string): string {
  switch (state) {
    case 'REGULAR':
      return '美股交易中';
    case 'PRE':
      return '美股盘前';
    case 'POST':
    case 'POSTPOST':
      return '美股盘后';
    default:
      return '美股休市';
  }
}

function QuoteCell({
  quote,
  fallbackName,
  decimals = 2,
}: {
  quote: BenchmarkQuote | null;
  fallbackName: string;
  decimals?: number;
}) {
  if (!quote) {
    return (
      <div className="flex flex-col min-w-[130px]">
        <span className="text-xs text-[#64748B]">{fallbackName}</span>
        <span className="mt-0.5 text-sm tabular-num text-[#94A3B8]">--</span>
      </div>
    );
  }

  const isUp = quote.changePct > 0;
  const isDown = quote.changePct < 0;
  const color = getTrendColorClass(quote.changePct);

  return (
    <div className="flex flex-col min-w-[138px]">
      <span className="text-xs text-[#64748B] truncate">{quote.name}</span>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-sm font-semibold text-[#0F172A] tabular-num">
          {quote.price.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })}
        </span>
        <span className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-num ${color}`}>
          {isUp && <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />}
          {isDown && <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />}
          {formatPct(quote.changePct)}
        </span>
      </div>
    </div>
  );
}

export function BenchmarkStrip({
  benchmark,
  loading,
  refreshing,
  lastUpdated,
  onRefresh,
}: BenchmarkStripProps) {
  const timeText = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    : '--:--:--';

  return (
    <section
      aria-label="美股纳指与汇率基准"
      className="bg-white border border-[#E5E9F0] rounded-xl px-4 py-3 sm:px-5"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        {loading && !benchmark ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3 w-20 bg-[#F1F5F9] rounded animate-pulse" />
                <div className="h-4 w-28 bg-[#E2E8F0] rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 flex-1 sm:divide-x sm:divide-[#F1F5F9]">
            <QuoteCell quote={benchmark?.ndx ?? null} fallbackName="纳斯达克100" decimals={2} />
            <div className="sm:pl-5">
              <QuoteCell quote={benchmark?.qqq ?? null} fallbackName="纳指ETF (QQQ)" decimals={2} />
            </div>
            <div className="sm:pl-5">
              <QuoteCell
                quote={benchmark?.nqFutures ?? null}
                fallbackName="纳指100期货"
                decimals={2}
              />
            </div>
            <div className="sm:pl-5">
              <QuoteCell quote={benchmark?.usdcny ?? null} fallbackName="美元/人民币" decimals={4} />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between lg:justify-end gap-4 pt-2 lg:pt-0 border-t lg:border-t-0 border-[#F1F5F9] shrink-0">
          <div className="text-xs text-[#64748B] flex items-center gap-1.5 whitespace-nowrap">
            <span>{marketStateText(benchmark?.ndx?.marketState)}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-num">更新 {timeText}</span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 min-h-[36px] text-xs font-medium text-[#334155] hover:text-[#0F172A] bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E5E9F0] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? '刷新中' : '刷新行情'}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
