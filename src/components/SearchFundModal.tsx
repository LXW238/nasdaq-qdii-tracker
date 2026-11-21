import { Check, Loader2, Plus, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { QUICK_SEARCH_PRESETS } from '../constants/defaultFunds';
import { FundSearchResult, WatchlistItem } from '../types';

interface SearchFundModalProps {
  open: boolean;
  existingCodes: Set<string>;
  onClose: () => void;
  onAddFund: (item: WatchlistItem, openHoldingAfter?: boolean) => void;
}

export function SearchFundModal({
  open,
  existingCodes,
  onClose,
  onAddFund,
}: SearchFundModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FundSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/funds/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('搜索请求失败');
        const data = (await res.json()) as { results?: FundSearchResult[]; error?: string };
        setResults(data.results || []);
        if (data.error) setError(data.error);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError('暂时无法连接基金搜索服务，请稍后重试');
        }
      } finally {
        setLoading(false);
      }
    }, 260);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="搜索并添加基金"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0F172A]/45 backdrop-blur-[2px] p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-xl border border-[#E5E9F0] max-h-[86vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile grab handle */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-[#CBD5E1]" />
        </div>

        <div className="px-5 py-3.5 border-b border-[#F1F5F9] flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#0F172A]">搜索并添加 QDII / 场外基金</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭搜索窗口"
            className="w-9 h-9 flex items-center justify-center text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b border-[#F1F5F9]">
          <div className="relative">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="输入6位基金代码（如 012920）或名称（如 纳斯达克、广发全球）"
              className="w-full h-11 pl-10 pr-10 text-sm bg-[#F8FAFC] border border-[#E5E9F0] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:bg-white focus:border-[#1D4ED8] focus:outline-none"
            />
            {loading && (
              <Loader2 className="w-4 h-4 text-[#1D4ED8] animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
            )}
          </div>

          {!query.trim() && (
            <div className="mt-3">
              <p className="text-[11px] text-[#64748B] mb-2">热门纳指与全球精选快速检索：</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_SEARCH_PRESETS.map((preset) => (
                  <button
                    key={preset.code}
                    type="button"
                    onClick={() => setQuery(preset.code)}
                    className="px-2.5 py-1.5 text-xs text-[#334155] bg-[#F8FAFC] hover:bg-[#EFF6FF] hover:text-[#1D4ED8] border border-[#E5E9F0] rounded-md transition-colors cursor-pointer"
                  >
                    {preset.label} ({preset.code})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#F1F5F9] min-h-[240px]">
          {error ? (
            <div className="p-8 text-center text-xs text-[#DC2626]">{error}</div>
          ) : !query.trim() ? (
            <div className="p-8 text-center text-xs text-[#64748B]">
              支持实时检索东方财富全市场场外基金与 QDII 基金代码
            </div>
          ) : loading && results.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">正在搜索全市场基金...</div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">
              未找到与「{query}」匹配的基金，请检查代码或更换关键词
            </div>
          ) : (
            results.map((fund) => {
              const added = existingCodes.has(fund.fundCode);
              const watchItem: WatchlistItem = {
                fundCode: fund.fundCode,
                name: fund.name,
                category: fund.category,
                beta: fund.defaultBeta,
              };
              return (
                <div
                  key={fund.fundCode}
                  className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-[#F8FAFC]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[#0F172A] truncate">{fund.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[#64748B]">
                      <span className="tabular-num font-medium text-[#334155]">{fund.fundCode}</span>
                      {fund.fundType && (
                        <>
                          <span>·</span>
                          <span>{fund.fundType}</span>
                        </>
                      )}
                      {fund.latestNav !== null && (
                        <>
                          <span>·</span>
                          <span className="tabular-num">净值 {fund.latestNav.toFixed(4)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {added ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#64748B]">
                        <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                        已自选
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAddFund(watchItem, false)}
                        className="inline-flex items-center gap-1 px-3 min-h-[36px] text-xs font-medium text-[#1D4ED8] bg-[#EFF6FF] hover:bg-[#DBEAFE] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>加自选</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onAddFund(watchItem, true)}
                      className="px-3 min-h-[36px] text-xs font-medium text-[#334155] bg-white hover:bg-[#F1F5F9] border border-[#E5E9F0] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      记持仓
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
