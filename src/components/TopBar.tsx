import { User } from 'firebase/auth';
import { BarChart3, LayoutGrid, LogIn, LogOut, Wallet } from 'lucide-react';
import { NavTab } from '../types';

interface TopBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  user: User | null;
  authLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

const NAV_ITEMS: Array<{ id: NavTab; label: string; mobileLabel: string }> = [
  { id: 'overview', label: '总览与行情', mobileLabel: '总览' },
  { id: 'analysis', label: '走势对比', mobileLabel: '走势' },
  { id: 'holdings', label: '持仓账本', mobileLabel: '持仓' },
];

export function TopBar({
  activeTab,
  onSelectTab,
  user,
  authLoading,
  onSignIn,
  onSignOut,
}: TopBarProps) {
  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E5E9F0]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 h-[52px] md:h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => onSelectTab('overview')}
            className="text-lg font-bold tracking-tight text-[#0F172A] whitespace-nowrap shrink-0 cursor-pointer"
          >
            纳指精选
          </button>

          {/* Zone 2: Clean Single-Line Nav Links (Desktop) */}
          <nav
            aria-label="主导航"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`relative py-5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'text-[#0F172A] font-semibold'
                      : 'text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-[#1D4ED8]" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Account Action */}
          <div className="flex items-center shrink-0">
            {authLoading ? (
              <div className="h-9 w-24 rounded-lg bg-[#F1F5F9] animate-pulse" />
            ) : user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2 min-w-0">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || '用户头像'}
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 rounded-full object-cover border border-[#E5E9F0] shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[#EFF6FF] text-[#1D4ED8] text-xs font-semibold flex items-center justify-center shrink-0">
                      {(user.displayName || user.email || 'U').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-medium text-[#334155] max-w-[110px] truncate">
                    {user.displayName || user.email?.split('@')[0]}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="inline-flex items-center gap-1.5 px-3 min-h-[40px] md:min-h-[36px] text-xs font-medium text-[#475569] hover:text-[#0F172A] border border-[#E5E9F0] rounded-lg hover:bg-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>退出</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onSignIn}
                className="inline-flex items-center gap-1.5 px-4 min-h-[40px] md:min-h-[38px] text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>登录云同步</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Fixed Bottom Thumb Navigation Bar */}
      <nav
        aria-label="移动端底部导航"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E5E9F0] pb-safe"
      >
        <div className="grid grid-cols-3 h-[58px]">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id;
            const Icon =
              item.id === 'overview'
                ? LayoutGrid
                : item.id === 'analysis'
                ? BarChart3
                : Wallet;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors cursor-pointer ${
                  active ? 'text-[#1D4ED8]' : 'text-[#64748B]'
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.2 : 1.8} />
                <span className="text-[11px] font-medium tracking-tight">
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
