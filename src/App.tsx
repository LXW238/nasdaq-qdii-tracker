import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BenchmarkStrip } from './components/BenchmarkStrip';
import { FundDetailPanel } from './components/FundDetailPanel';
import { FundListPanel } from './components/FundListPanel';
import { HoldingEditorModal } from './components/HoldingEditorModal';
import { HoldingsLedgerView } from './components/HoldingsLedgerView';
import { PerformanceCompareView } from './components/PerformanceCompareView';
import { PortfolioSummaryBar } from './components/PortfolioSummaryBar';
import { SearchFundModal } from './components/SearchFundModal';
import { TopBar } from './components/TopBar';
import { auth, googleProvider } from './firebase';
import {
  ensureUserProfileAndMigrate,
  loadLocalHoldings,
  loadLocalWatchlist,
  removeHoldingCloud,
  removeWatchlistItemCloud,
  saveLocalHoldings,
  saveLocalWatchlist,
  subscribeUserHoldings,
  subscribeUserWatchlist,
  upsertHoldingCloud,
  upsertWatchlistItemCloud,
} from './services/portfolioStore';
import {
  FundHistoryResponse,
  FundSnapshot,
  HoldingRecord,
  MarketBenchmarkResponse,
  NavTab,
  WatchlistItem,
} from './types';
import { computePortfolioSummary } from './utils/valuation';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(() => loadLocalWatchlist());
  const [holdings, setHoldings] = useState<Record<string, HoldingRecord>>(() =>
    loadLocalHoldings()
  );
  const [selectedCode, setSelectedCode] = useState<string>(() => {
    const initial = loadLocalWatchlist();
    return initial[0]?.fundCode || '012920';
  });

  const [benchmark, setBenchmark] = useState<MarketBenchmarkResponse | null>(null);
  const [snapshots, setSnapshots] = useState<Record<string, FundSnapshot>>({});
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const [historyCache, setHistoryCache] = useState<Record<string, FundHistoryResponse>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [holdingModalCode, setHoldingModalCode] = useState<string | null>(null);
  const [holdingModalOpen, setHoldingModalOpen] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3200);
  }, []);

  // Auth + Cloud Firestore Sync Lifecycle
  useEffect(() => {
    let unsubWatchlist: (() => void) | null = null;
    let unsubHoldings: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (unsubWatchlist) {
        unsubWatchlist();
        unsubWatchlist = null;
      }
      if (unsubHoldings) {
        unsubHoldings();
        unsubHoldings = null;
      }

      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        try {
          const guestWl = loadLocalWatchlist();
          const guestHoldings = loadLocalHoldings();
          await ensureUserProfileAndMigrate(currentUser, guestWl, guestHoldings);

          unsubWatchlist = subscribeUserWatchlist(currentUser.uid, (cloudList) => {
            if (cloudList.length > 0) {
              setWatchlist(cloudList);
              setSelectedCode((prev) =>
                cloudList.some((item) => item.fundCode === prev)
                  ? prev
                  : cloudList[0].fundCode
              );
            }
          });

          unsubHoldings = subscribeUserHoldings(currentUser.uid, (cloudHoldings) => {
            setHoldings(cloudHoldings);
          });
        } catch (err) {
          console.error('Cloud sync setup failed:', err);
          showToast('云端数据同步初始化失败，请检查网络连接');
        }
      } else {
        const localWl = loadLocalWatchlist();
        setWatchlist(localWl);
        setHoldings(loadLocalHoldings());
        setSelectedCode((prev) =>
          localWl.some((item) => item.fundCode === prev)
            ? prev
            : localWl[0]?.fundCode || '012920'
        );
      }
    });

    return () => {
      unsubAuth();
      if (unsubWatchlist) unsubWatchlist();
      if (unsubHoldings) unsubHoldings();
    };
  }, [showToast]);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('已登录 Google 账号，持仓与自选将自动云端同步');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('popup-closed-by-user')) {
        showToast('登录未完成，请允许弹窗后重试');
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      showToast('已退出登录，切换回本地浏览模式');
    } catch {
      showToast('退出登录失败，请重试');
    }
  };

  // Fetch Market Benchmark + Batch Fund Snapshots
  const watchlistCodesKey = useMemo(
    () =>
      Array.from(
        new Set([...watchlist.map((w) => w.fundCode), ...Object.keys(holdings)])
      )
        .sort()
        .join(','),
    [watchlist, holdings]
  );

  const fetchMarketAndFunds = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        const requests: [Promise<Response>, Promise<Response> | null] = [
          fetch('/api/market/benchmark'),
          watchlistCodesKey
            ? fetch(`/api/funds/batch?codes=${encodeURIComponent(watchlistCodesKey)}`)
            : null,
        ];

        const [benchRes, batchRes] = await Promise.all(requests);
        if (benchRes.ok) {
          const benchJson = (await benchRes.json()) as MarketBenchmarkResponse;
          setBenchmark(benchJson);
        }
        if (batchRes && batchRes.ok) {
          const batchJson = (await batchRes.json()) as {
            funds?: Record<string, FundSnapshot>;
          };
          if (batchJson.funds) {
            setSnapshots((prev) => ({ ...prev, ...batchJson.funds }));
          }
        }
        setLastUpdated(Date.now());
        if (isManual) showToast('已刷新最新美股基准与基金净值');
      } catch (err) {
        console.error('Market fetch error:', err);
        if (isManual) showToast('行情刷新失败，请稍后重试');
      } finally {
        setLoadingMarket(false);
        setRefreshing(false);
      }
    },
    [watchlistCodesKey, showToast]
  );

  useEffect(() => {
    void fetchMarketAndFunds(false);
    const interval = window.setInterval(() => {
      void fetchMarketAndFunds(false);
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [fetchMarketAndFunds]);

  // Fetch Detailed NAV History for Selected Fund
  const loadFundHistory = useCallback(async (code: string, force = false) => {
    if (!code) return;
    if (!force && historyCache[code]) {
      setHistoryError(null);
      return;
    }
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch(`/api/funds/${encodeURIComponent(code)}/history`);
      if (!res.ok) {
        throw new Error('历史净值接口暂时不可用');
      }
      const data = (await res.json()) as FundHistoryResponse;
      setHistoryCache((prev) => ({ ...prev, [code]: data }));
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : '加载历史净值失败');
    } finally {
      setHistoryLoading(false);
    }
  }, [historyCache]);

  useEffect(() => {
    if (selectedCode) {
      void loadFundHistory(selectedCode, false);
    }
  }, [selectedCode, loadFundHistory]);

  // Portfolio Summary
  const summary = useMemo(
    () => computePortfolioSummary(holdings, watchlist, snapshots, benchmark),
    [holdings, watchlist, snapshots, benchmark]
  );

  // Watchlist & Holdings Mutations
  const handleAddFund = async (item: WatchlistItem, openHoldingAfter = false) => {
    const exists = watchlist.some((w) => w.fundCode === item.fundCode);
    if (!exists) {
      if (user) {
        await upsertWatchlistItemCloud(user.uid, item);
      } else {
        const next = [...watchlist, item];
        setWatchlist(next);
        saveLocalWatchlist(next);
      }
      showToast(`已将「${item.name}」加入自选`);
    }

    setSelectedCode(item.fundCode);
    setSearchModalOpen(false);
    if (openHoldingAfter) {
      setHoldingModalCode(item.fundCode);
      setHoldingModalOpen(true);
    }
  };

  const handleRemoveFromWatchlist = async (fundCode: string) => {
    if (watchlist.length <= 1) return;
    if (user) {
      await removeWatchlistItemCloud(user.uid, fundCode);
    } else {
      const next = watchlist.filter((w) => w.fundCode !== fundCode);
      setWatchlist(next);
      saveLocalWatchlist(next);
      if (selectedCode === fundCode && next[0]) {
        setSelectedCode(next[0].fundCode);
      }
    }
    showToast(`已移出基金 ${fundCode}`);
  };

  const handleUpdateBeta = async (fundCode: string, nextBeta: number) => {
    const target = watchlist.find((w) => w.fundCode === fundCode);
    if (!target) return;
    const updated: WatchlistItem = { ...target, beta: nextBeta };
    if (user) {
      await upsertWatchlistItemCloud(user.uid, updated);
    } else {
      const next = watchlist.map((w) => (w.fundCode === fundCode ? updated : w));
      setWatchlist(next);
      saveLocalWatchlist(next);
    }
  };

  const handleSaveHolding = async (holding: HoldingRecord) => {
    if (user) {
      await upsertHoldingCloud(user.uid, holding);
      showToast('持仓已保存并同步至云端');
    } else {
      const next = { ...holdings, [holding.fundCode]: holding };
      setHoldings(next);
      saveLocalHoldings(next);
      showToast('持仓已保存到本地（登录账号可多端云同步）');
    }
  };

  const handleRemoveHolding = async (fundCode: string) => {
    if (user) {
      await removeHoldingCloud(user.uid, fundCode);
    } else {
      const next = { ...holdings };
      delete next[fundCode];
      setHoldings(next);
      saveLocalHoldings(next);
    }
    showToast('已清空该基金持仓记录');
  };

  const openEditHolding = (fundCode: string) => {
    setHoldingModalCode(fundCode);
    setHoldingModalOpen(true);
  };

  const handleSelectFundFromList = (fundCode: string) => {
    setSelectedCode(fundCode);
    // On narrow mobile screens when in overview tab, jump cleanly to analysis tab so user sees the chart immediately
    if (window.innerWidth < 1024 && activeTab === 'overview') {
      setActiveTab('analysis');
    }
  };

  const selectedItem = watchlist.find((w) => w.fundCode === selectedCode) || watchlist[0];
  const existingCodes = useMemo(() => new Set(watchlist.map((w) => w.fundCode)), [watchlist]);

  return (
    <div className="min-h-screen bg-[#F6F8FA] text-[#0F172A] pb-20 md:pb-12">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        user={user}
        authLoading={authLoading}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />

      <main className="max-w-[1360px] mx-auto px-4 sm:px-6 pt-5 space-y-5">
        {/* Live Nasdaq-100 & FX Benchmark Strip */}
        <BenchmarkStrip
          benchmark={benchmark}
          loading={loadingMarket}
          refreshing={refreshing}
          lastUpdated={lastUpdated}
          onRefresh={() => void fetchMarketAndFunds(true)}
        />

        {/* Portfolio Asset Summary Banner */}
        <PortfolioSummaryBar
          summary={summary}
          isCloudSynced={Boolean(user)}
          onOpenSearch={() => setSearchModalOpen(true)}
          onOpenQuickHolding={() => openEditHolding(selectedItem?.fundCode || watchlist[0]?.fundCode || '012920')}
        />

        {/* Main Content Views */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-5">
              <FundListPanel
                watchlist={watchlist}
                holdings={holdings}
                snapshots={snapshots}
                benchmark={benchmark}
                selectedCode={selectedItem?.fundCode || ''}
                loadingBatch={loadingMarket}
                onSelectFund={handleSelectFundFromList}
                onOpenSearch={() => setSearchModalOpen(true)}
                onEditHolding={openEditHolding}
              />
            </div>

            <div className="hidden lg:block lg:col-span-7">
              <FundDetailPanel
                item={selectedItem}
                snapshot={selectedItem ? snapshots[selectedItem.fundCode] : undefined}
                history={selectedItem ? historyCache[selectedItem.fundCode] || null : null}
                historyLoading={historyLoading}
                historyError={historyError}
                benchmark={benchmark}
                holding={selectedItem ? holdings[selectedItem.fundCode] : undefined}
                onEditHolding={openEditHolding}
                onRemoveHolding={handleRemoveHolding}
                onRemoveFromWatchlist={handleRemoveFromWatchlist}
                onUpdateBeta={handleUpdateBeta}
                onRetryHistory={(code) => void loadFundHistory(code, true)}
                canRemoveWatchlist={watchlist.length > 1}
              />
            </div>
          </div>
        )}

        {activeTab === 'analysis' && (
          <PerformanceCompareView
            watchlist={watchlist}
            holdings={holdings}
            snapshots={snapshots}
            benchmark={benchmark}
            selectedCode={selectedItem?.fundCode || ''}
            history={selectedItem ? historyCache[selectedItem.fundCode] || null : null}
            historyLoading={historyLoading}
            historyError={historyError}
            onSelectFund={setSelectedCode}
            onEditHolding={openEditHolding}
            onRemoveHolding={handleRemoveHolding}
            onRemoveFromWatchlist={handleRemoveFromWatchlist}
            onUpdateBeta={handleUpdateBeta}
            onRetryHistory={(code) => void loadFundHistory(code, true)}
          />
        )}

        {activeTab === 'holdings' && (
          <HoldingsLedgerView
            watchlist={watchlist}
            holdings={holdings}
            snapshots={snapshots}
            benchmark={benchmark}
            summary={summary}
            onSelectFund={(code) => {
              setSelectedCode(code);
              setActiveTab('analysis');
            }}
            onEditHolding={openEditHolding}
            onRemoveHolding={handleRemoveHolding}
            onOpenQuickHolding={() => openEditHolding(selectedItem?.fundCode || watchlist[0]?.fundCode || '012920')}
          />
        )}

        {/* Quiet Footer Note */}
        <footer className="pt-4 pb-2 text-center text-[11px] text-[#94A3B8]">
          官方净值源自东方财富公开披露，盘中估值基于纳斯达克100指数与美元/人民币汇率映射测算，仅供参考，不构成投资建议。
        </footer>
      </main>

      {/* Modals / Mobile Bottom Sheets */}
      <SearchFundModal
        open={searchModalOpen}
        existingCodes={existingCodes}
        onClose={() => setSearchModalOpen(false)}
        onAddFund={handleAddFund}
      />

      <HoldingEditorModal
        open={holdingModalOpen}
        initialFundCode={holdingModalCode}
        watchlist={watchlist}
        holdings={holdings}
        snapshots={snapshots}
        onClose={() => setHoldingModalOpen(false)}
        onSave={handleSaveHolding}
        onDelete={handleRemoveHolding}
      />

      {/* Non-intrusive Toast Feedback */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-[#0F172A] text-white text-xs font-medium rounded-lg shadow-lg whitespace-nowrap"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
