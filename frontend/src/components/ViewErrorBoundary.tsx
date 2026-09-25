import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

const CHUNK_RETRY_KEY_PREFIX = 'z_chunk_retry_';

const inMemoryRetryStore = new Set<string>();

function hasRetryMarker(viewKey: string): boolean {
  try {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(CHUNK_RETRY_KEY_PREFIX + viewKey) === '1';
    }
  } catch {
    // In private browsing or restricted environments, gracefully fall back to memory
  }
  return inMemoryRetryStore.has(viewKey);
}

function setRetryMarker(viewKey: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(CHUNK_RETRY_KEY_PREFIX + viewKey, '1');
      return;
    }
  } catch {
    // In private browsing or restricted environments, gracefully fall back to memory
  }
  inMemoryRetryStore.add(viewKey);
}

function clearRetryMarker(viewKey: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(CHUNK_RETRY_KEY_PREFIX + viewKey);
    }
  } catch {
    // ignore
  }
  inMemoryRetryStore.delete(viewKey);
}

interface Props {
  children: ReactNode;
  viewName?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isRepeatedFailure: boolean;
}

export class ViewErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    isRepeatedFailure: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { 
      hasError: true, 
      error,
      isRepeatedFailure: false,
    };
  }

  public componentDidMount() {
    (this as any)._isMounted = true;
  }

  public componentWillUnmount() {
    (this as any)._isMounted = false;
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ViewErrorBoundary] Failed to load view chunk:', error, errorInfo);
    }

    // Check if a retry was already attempted for this view during this session
    const viewKey = this.props.viewName || 'unknown';
    if (hasRetryMarker(viewKey)) {
      this.state = { ...this.state, isRepeatedFailure: true };
      if ((this as any)._isMounted) {
        this.setState({ isRepeatedFailure: true });
      }
    }
  }

  public componentDidUpdate(prevProps: Props) {
    // If the active view changed while in error state, reset error to allow normal view rendering
    if (prevProps.viewName !== this.props.viewName && this.state.hasError) {
      this.state = { hasError: false, error: null, isRepeatedFailure: false };
      if ((this as any)._isMounted) {
        this.setState({ hasError: false, error: null, isRepeatedFailure: false });
      }
    }
  }

  private handleRetry = () => {
    const viewKey = this.props.viewName || 'unknown';

    // If this is already a repeated failure, clear marker and force reload window
    if (this.state.isRepeatedFailure) {
      clearRetryMarker(viewKey);
      this.state = { hasError: false, error: null, isRepeatedFailure: false };
      if ((this as any)._isMounted) {
        this.setState({ hasError: false, error: null, isRepeatedFailure: false });
      }
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
      return;
    }

    // First failure: mark attempt to prevent continuous automatic loops
    setRetryMarker(viewKey);

    // Clear state
    this.state = { hasError: false, error: null, isRepeatedFailure: false };
    if ((this as any)._isMounted) {
      this.setState({ hasError: false, error: null, isRepeatedFailure: false });
    }

    // Trigger controlled reload
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleGoHome = () => {
    const viewKey = this.props.viewName || 'unknown';
    clearRetryMarker(viewKey);
    this.state = { hasError: false, error: null, isRepeatedFailure: false };
    if ((this as any)._isMounted) {
      this.setState({ hasError: false, error: null, isRepeatedFailure: false });
    }
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      const viewKey = this.props.viewName || 'unknown';
      const isRepeated = this.state.isRepeatedFailure || hasRetryMarker(viewKey);

      return (
        <div 
          role="alert" 
          aria-live="assertive"
          className="min-h-[400px] flex items-center justify-center p-6 animate-in fade-in duration-200"
        >
          <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-2xl p-6 text-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 to-amber-500" />
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4 text-red-400">
              <AlertTriangle className="w-6 h-6" aria-hidden="true" />
            </div>
            <span className="font-mono text-xs uppercase tracking-widest text-red-400 font-bold block mb-1">
              {isRepeated ? 'Persistent Load Error' : 'Chunk Load Error'}
            </span>
            <h3 className="text-lg font-bold text-white mb-2 font-outfit">
              {isRepeated ? 'Unable to load section' : 'Failed to load view'}
            </h3>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              {isRepeated
                ? 'Repeated attempts to load this section failed. A network disruption or cached asset issue may be present.'
                : 'A network disruption or newer version prevented this section from loading. Please retry.'}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleRetry}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95 cursor-pointer font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                {isRepeated ? 'Force Reload' : 'Reload View'}
              </button>
              {this.props.onReset && (
                <button
                  type="button"
                  onClick={this.handleGoHome}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all border border-slate-700 active:scale-95 cursor-pointer font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <Home className="w-3.5 h-3.5" aria-hidden="true" />
                  Dashboard
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ViewErrorBoundary;

