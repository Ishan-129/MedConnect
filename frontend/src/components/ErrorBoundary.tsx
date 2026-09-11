import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleTryRecover = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[50vh] flex items-center justify-center p-6">
          <div className="max-w-md w-full p-6 bg-paper border border-red-500/30 rounded-2xl shadow-xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-mono font-bold text-ink">
                {this.props.fallbackTitle || 'Component Error Recovered'}
              </h2>
              <p className="text-xs font-mono text-ink-muted">
                A rendering issue occurred. MedConnect recovered safely without crashing your session.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 bg-paper-subtle rounded-lg border border-rule text-left text-[11px] font-mono text-red-600 overflow-x-auto max-h-32">
                {this.state.error.message}
              </div>
            )}

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleTryRecover}
                className="px-4 py-2 rounded-lg bg-accent text-white text-xs font-mono font-bold hover:bg-accent/90 transition-all flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Try Recovering View
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 rounded-lg bg-paper-2 border border-rule text-ink text-xs font-mono hover:border-ink-muted transition-all flex items-center gap-1.5"
              >
                <Home className="w-3.5 h-3.5" />
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
