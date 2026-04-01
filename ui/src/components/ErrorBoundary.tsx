import { AlertTriangle } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  level: "page" | "section";
  resetKey?: string;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  prevResetKey?: string;
};

function PageFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useTranslation("common");
  return (
    <div className="flex items-center justify-center py-20">
      <div className="rounded-2xl glass-panel p-8 max-w-lg w-full text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-orange-600 mx-auto" />
        <h2 className="text-lg font-semibold text-neutral-100">
          {t("errorBoundary.heading", "Something went wrong")}
        </h2>
        <details className="text-sm text-neutral-500">
          <summary className="cursor-pointer hover:text-neutral-300 transition-colors">
            {t("errorBoundary.details", "Details")}
          </summary>
          <pre className="mt-2 text-left text-xs bg-neutral-900/60 rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap break-words">
            {error.message}
          </pre>
        </details>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border border-[var(--glass-border)] transition-colors cursor-pointer"
          >
            {t("errorBoundary.reload", "Reload page")}
          </button>
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-orange-600 text-neutral-100 hover:bg-orange-500 transition-colors cursor-pointer"
          >
            {t("errorBoundary.retry", "Try again")}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useTranslation("common");
  return (
    <div className="rounded-xl glass-panel p-4 flex items-center gap-3">
      <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />
      <p className="text-sm text-neutral-500 flex-1 truncate">{error.message}</p>
      <button
        onClick={onRetry}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-600 text-neutral-100 hover:bg-orange-500 transition-colors shrink-0 cursor-pointer"
      >
        {t("errorBoundary.retry", "Try again")}
      </button>
    </div>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState) {
    if (props.resetKey !== undefined && props.resetKey !== state.prevResetKey) {
      return { hasError: false, error: null, prevResetKey: props.resetKey };
    }
    return { prevResetKey: props.resetKey };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return this.props.level === "page" ? (
        <PageFallback error={this.state.error} onRetry={this.handleRetry} />
      ) : (
        <SectionFallback error={this.state.error} onRetry={this.handleRetry} />
      );
    }
    return this.props.children;
  }
}
