import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Calculator render failed", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="error-state">
        <span>未能完成估算</span>
        <h1>計算器暫時出了問題</h1>
        <p>你的資料未有送出。請重新載入頁面；如問題持續，請稍後再試。</p>
        <button type="button" onClick={() => window.location.reload()}>重新載入</button>
      </main>
    );
  }
}
