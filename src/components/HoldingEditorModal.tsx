import { X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { FundSnapshot, HoldingRecord, WatchlistItem } from '../types';
import { formatCurrency, formatPct, getTrendColorClass } from '../utils/valuation';

interface HoldingEditorModalProps {
  open: boolean;
  initialFundCode: string | null;
  watchlist: WatchlistItem[];
  holdings: Record<string, HoldingRecord>;
  snapshots: Record<string, FundSnapshot>;
  onClose: () => void;
  onSave: (holding: HoldingRecord) => Promise<void>;
  onDelete: (fundCode: string) => Promise<void>;
}

export function HoldingEditorModal({
  open,
  initialFundCode,
  watchlist,
  holdings,
  snapshots,
  onClose,
  onSave,
  onDelete,
}: HoldingEditorModalProps) {
  const [fundCode, setFundCode] = useState('');
  const [inputMode, setInputMode] = useState<'shares' | 'amount'>('shares');
  const [sharesStr, setSharesStr] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [costNavStr, setCostNavStr] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const targetCode = initialFundCode || watchlist[0]?.fundCode || '';
    setFundCode(targetCode);
    setInputMode('shares');
    setError(null);
  }, [open, initialFundCode, watchlist]);

  useEffect(() => {
    if (!open || !fundCode) return;
    const existing = holdings[fundCode];
    const snap = snapshots[fundCode];
    if (existing) {
      setSharesStr(String(existing.shares));
      setCostNavStr(String(existing.costNav));
      setAmountStr((existing.shares * existing.costNav).toFixed(2));
      setNote(existing.note || '');
    } else {
      setSharesStr('');
      setAmountStr('');
      setCostNavStr(snap && snap.officialNav > 0 ? snap.officialNav.toFixed(4) : '');
      setNote('');
    }
    setError(null);
  }, [open, fundCode, holdings, snapshots]);

  const currentSnap = snapshots[fundCode];
  const currentWatch = watchlist.find((w) => w.fundCode === fundCode);
  const existingHolding = holdings[fundCode];

  const computed = useMemo(() => {
    const costNav = Number(costNavStr);
    const shares =
      inputMode === 'shares'
        ? Number(sharesStr)
        : costNav > 0
        ? Number(amountStr) / costNav
        : 0;
    const totalCost =
      inputMode === 'amount' ? Number(amountStr) : shares * costNav;

    const latestNav = currentSnap?.officialNav || costNav;
    const estValue = shares > 0 && latestNav > 0 ? shares * latestNav : 0;
    const estPnL = estValue - totalCost;
    const estPct = totalCost > 0 ? (estPnL / totalCost) * 100 : 0;

    return {
      shares: Number.isFinite(shares) ? shares : 0,
      costNav: Number.isFinite(costNav) ? costNav : 0,
      totalCost: Number.isFinite(totalCost) ? totalCost : 0,
      estValue: Number.isFinite(estValue) ? estValue : 0,
      estPnL: Number.isFinite(estPnL) ? estPnL : 0,
      estPct: Number.isFinite(estPct) ? estPct : 0,
    };
  }, [inputMode, sharesStr, amountStr, costNavStr, currentSnap]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!/^[0-9]{6}$/.test(fundCode)) {
      setError('请选择有效的基金');
      return;
    }
    if (!Number.isFinite(computed.costNav) || computed.costNav <= 0 || computed.costNav > 100000) {
      setError('请输入有效的持仓成本单价（大于 0）');
      return;
    }
    if (!Number.isFinite(computed.shares) || computed.shares <= 0 || computed.shares > 1_000_000_000) {
      setError(inputMode === 'shares' ? '请输入大于 0 的持有份额' : '请输入大于 0 的投入金额');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        fundCode,
        name: currentSnap?.name || currentWatch?.name || `基金 ${fundCode}`,
        shares: Number(computed.shares.toFixed(4)),
        costNav: Number(computed.costNav.toFixed(4)),
        note: note.trim().slice(0, 200),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingHolding) return;
    setSaving(true);
    try {
      await onDelete(fundCode);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="录入与编辑持仓"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0F172A]/45 backdrop-blur-[2px] p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-xl border border-[#E5E9F0] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-[#CBD5E1]" />
        </div>

        <div className="px-5 py-3.5 border-b border-[#F1F5F9] flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#0F172A]">
            {existingHolding ? '编辑持仓份额' : '录入基金持仓'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭弹窗"
            className="w-9 h-9 flex items-center justify-center text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Fund Selector */}
          <div>
            <label htmlFor="holding-fund-select" className="block text-xs font-medium text-[#334155]">
              选择基金
            </label>
            <select
              id="holding-fund-select"
              value={fundCode}
              onChange={(e) => setFundCode(e.target.value)}
              className="mt-1.5 w-full h-11 px-3 text-sm bg-[#F8FAFC] border border-[#E5E9F0] rounded-lg text-[#0F172A] focus:bg-white focus:border-[#1D4ED8] focus:outline-none"
            >
              {watchlist.map((w) => (
                <option key={w.fundCode} value={w.fundCode}>
                  {w.fundCode} · {snapshots[w.fundCode]?.name || w.name}
                </option>
              ))}
            </select>
          </div>

          {/* Mode Toggle */}
          <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg">
            <button
              type="button"
              onClick={() => setInputMode('shares')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                inputMode === 'shares'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              按持有份额录入
            </button>
            <button
              type="button"
              onClick={() => setInputMode('amount')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                inputMode === 'amount'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              按投入本金换算
            </button>
          </div>

          {/* Shares or Amount Input */}
          {inputMode === 'shares' ? (
            <div>
              <label htmlFor="holding-shares" className="block text-xs font-medium text-[#334155]">
                持有份额（份）
              </label>
              <input
                id="holding-shares"
                type="number"
                step="any"
                min="0.0001"
                required
                value={sharesStr}
                onChange={(e) => setSharesStr(e.target.value)}
                placeholder="例如 3500.50"
                className="mt-1.5 w-full h-11 px-3.5 text-sm tabular-num bg-[#F8FAFC] border border-[#E5E9F0] rounded-lg text-[#0F172A] focus:bg-white focus:border-[#1D4ED8] focus:outline-none"
              />
            </div>
          ) : (
            <div>
              <label htmlFor="holding-amount" className="block text-xs font-medium text-[#334155]">
                总投入本金（元）
              </label>
              <input
                id="holding-amount"
                type="number"
                step="any"
                min="0.01"
                required
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="例如 20000"
                className="mt-1.5 w-full h-11 px-3.5 text-sm tabular-num bg-[#F8FAFC] border border-[#E5E9F0] rounded-lg text-[#0F172A] focus:bg-white focus:border-[#1D4ED8] focus:outline-none"
              />
            </div>
          )}

          {/* Cost NAV Input */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="holding-cost-nav" className="text-xs font-medium text-[#334155]">
                持仓成本单价（元/份）
              </label>
              {currentSnap && currentSnap.officialNav > 0 && (
                <button
                  type="button"
                  onClick={() => setCostNavStr(currentSnap.officialNav.toFixed(4))}
                  className="text-[11px] font-medium text-[#1D4ED8] hover:underline cursor-pointer tabular-num"
                >
                  填入最新净值 {currentSnap.officialNav.toFixed(4)}
                </button>
              )}
            </div>
            <input
              id="holding-cost-nav"
              type="number"
              step="0.0001"
              min="0.0001"
              required
              value={costNavStr}
              onChange={(e) => setCostNavStr(e.target.value)}
              placeholder="例如 3.0535"
              className="mt-1.5 w-full h-11 px-3.5 text-sm tabular-num bg-[#F8FAFC] border border-[#E5E9F0] rounded-lg text-[#0F172A] focus:bg-white focus:border-[#1D4ED8] focus:outline-none"
            />
          </div>

          {/* Note Input */}
          <div>
            <label htmlFor="holding-note" className="block text-xs font-medium text-[#334155]">
              持仓备注（选填，如定投账户）
            </label>
            <input
              id="holding-note"
              type="text"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如 支付宝定投、招行场外"
              className="mt-1.5 w-full h-10 px-3.5 text-xs bg-[#F8FAFC] border border-[#E5E9F0] rounded-lg text-[#0F172A] focus:bg-white focus:border-[#1D4ED8] focus:outline-none"
            />
          </div>

          {/* Live Calculation Preview */}
          {computed.shares > 0 && computed.costNav > 0 && (
            <div className="p-3.5 bg-[#F8FAFC] border border-[#E5E9F0] rounded-lg grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[#64748B]">折算份额 / 本金</span>
                <div className="mt-0.5 font-semibold text-[#0F172A] tabular-num">
                  {computed.shares.toFixed(2)} 份 · {formatCurrency(computed.totalCost)}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[#64748B]">按最新净值试算盈亏</span>
                <div
                  className={`mt-0.5 font-semibold tabular-num ${getTrendColorClass(
                    computed.estPnL
                  )}`}
                >
                  {formatCurrency(computed.estPnL, true)} ({formatPct(computed.estPct)})
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-[#DC2626]">{error}</p>}

          <div className="pt-2 flex items-center gap-2.5">
            {existingHolding && (
              <button
                type="button"
                disabled={saving}
                onClick={handleDelete}
                className="px-4 min-h-[44px] text-xs font-medium text-[#DC2626] bg-[#FEF2F2] hover:bg-[#FEE2E2] rounded-lg transition-colors cursor-pointer disabled:opacity-60"
              >
                清空持仓
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="flex-1 min-h-[44px] text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors cursor-pointer disabled:opacity-60"
            >
              {saving ? '保存中...' : '保存持仓并计算盈亏'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
