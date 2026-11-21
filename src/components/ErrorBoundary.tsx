import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || '应用发生未知错误',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendly = '数据同步或页面渲染出现异常，请尝试刷新页面。';
      if (this.state.message.includes('Quota exceeded')) {
        friendly = '云端数据库当日免费读取额度已达上限，将于次日重置。';
      } else if (this.state.message.includes('Missing or insufficient permissions')) {
        friendly = '云端数据访问权限校验未通过，请重新登录您的 Google 账号。';
      }

      return (
        <div className="min-h-screen bg-[#F6F8FA] flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white border border-[#E5E9F0] rounded-xl p-6 text-center">
            <h2 className="text-lg font-semibold text-[#0F172A]">页面遇到了一点问题</h2>
            <p className="mt-2 text-sm text-[#64748B] leading-relaxed">{friendly}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 px-4 py-2.5 min-h-[44px] text-sm font-medium text-white bg-[#1D4ED8] rounded-lg hover:bg-[#1E40AF] transition-colors cursor-pointer"
            >
              重新加载页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
