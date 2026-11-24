import React from 'react';
import { attemptOneTimeChunkReload, isChunkLoadError } from '@/utils/chunk-recovery';
import { captureAndReportCrash } from '@/utils/crash-telemetry';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  scope?: 'root' | 'route';
  routeName?: string;
  onBack?: () => void;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
  componentStack: string;
  telemetrySent: boolean;
  sendingTelemetry: boolean;
}

export class AppErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      isChunkError: false,
      componentStack: '',
      telemetrySent: false,
      sendingTelemetry: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      isChunkError: isChunkLoadError(error),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const compStack = String(info?.componentStack || '').slice(0, 1400);
    this.setState({ componentStack: compStack });
    if (isChunkLoadError(error)) {
      attemptOneTimeChunkReload(this.props.routeName || this.props.scope || 'react-boundary');
    }
    void captureAndReportCrash({
      severity: 'critical',
      source: 'client_react',
      category: isChunkLoadError(error) ? 'REACT_CHUNK_ERROR' : 'REACT_RENDER_CRASH',
      title: `Crash em "${this.props.routeName || this.props.scope || 'Tela'}"`,
      message: error?.message || String(error),
      stack: error?.stack || '',
      componentStack: compStack,
      extra: {
        scope: this.props.scope || 'route',
        routeName: this.props.routeName || null,
      },
    }).then((ok) => {
      if (ok) this.setState({ telemetrySent: true });
    });
    if (typeof window !== 'undefined') {
      try {
        (window as unknown as { __cgLastUiCrash?: unknown }).__cgLastUiCrash = {
          at: new Date().toISOString(),
          scope: this.props.scope || 'route',
          routeName: this.props.routeName || null,
          message: error?.message || String(error),
          componentStack: compStack.slice(0, 600),
        };
      } catch {
        // Ignore diagnostic assignment failure
      }
    }
  }

  private handleNotifyAdmin = async () => {
    if (this.state.sendingTelemetry || !this.state.error) return;
    this.setState({ sendingTelemetry: true });
    const ok = await captureAndReportCrash({
      severity: 'critical',
      source: 'client_react',
      category: this.state.isChunkError ? 'REACT_CHUNK_ERROR' : 'REACT_RENDER_CRASH',
      title: `Reportado manualmente em "${this.props.routeName || this.props.scope || 'Tela'}"`,
      message: this.state.error?.message || String(this.state.error),
      stack: this.state.error?.stack || '',
      componentStack: this.state.componentStack,
      force: true,
      extra: { manualNotify: true, routeName: this.props.routeName || null },
    });
    this.setState({ sendingTelemetry: false, telemetrySent: ok || this.state.telemetrySent });
  };

  private handleResetAndRetry = () => {
    if (this.state.isChunkError) {
      const didReload = attemptOneTimeChunkReload(this.props.routeName || 'manual-retry');
      if (didReload) return;
    }
    this.setState({ hasError: false, error: null, isChunkError: false });
  };

  private handleHardReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }
    if (this.props.fallback) {
      return this.props.fallback;
    }

    const isRoot = this.props.scope === 'root';
    const label = this.props.routeName ? `do módulo "${this.props.routeName}"` : 'desta tela';
    const msg = this.state.isChunkError
      ? 'Uma atualização foi publicada enquanto o app estava aberto. Clique para atualizar os arquivos.'
      : this.state.error?.message || 'Ocorreu uma falha inesperada na renderização.';

    return (
      <div
        role="alert"
        data-testid={isRoot ? 'root-error-boundary-fallback' : 'route-error-boundary-fallback'}
        className={
          isRoot
            ? 'flex min-h-dvh w-full items-center justify-center bg-[#F8FAFC] p-6 text-[#0F172A]'
            : 'flex min-h-[280px] w-full items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-[#0F172A] shadow-xs'
        }
      >
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-1.5">
            <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
              Recuperação Segura
            </span>
            <h2 className="text-lg font-extrabold tracking-tight text-[#0F172A]">
              {this.state.isChunkError
                ? 'Atualização disponível'
                : `Não foi possível abrir ${label}`}
            </h2>
            <p className="text-xs leading-relaxed text-slate-600">{msg}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={this.handleResetAndRetry}
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-[#0F172A] px-4 text-xs font-bold text-white transition hover:bg-slate-800"
            >
              {this.state.isChunkError ? 'Atualizar Agora' : 'Tentar Novamente'}
            </button>

            {this.props.onBack ? (
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null, isChunkError: false });
                  this.props.onBack?.();
                }}
                className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Voltar ao Painel
              </button>
            ) : (
              <button
                type="button"
                onClick={this.handleHardReload}
                className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Recarregar Página
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem('cg_low_spec_mode');
                  sessionStorage.clear();
                } catch {}
                if (typeof window !== 'undefined') window.location.href = '/';
              }}
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Resetar Cache Local
            </button>
            <button
              type="button"
              onClick={() => void this.handleNotifyAdmin()}
              disabled={this.state.sendingTelemetry}
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
            >
              {this.state.telemetrySent
                ? 'Admin informado ✓'
                : this.state.sendingTelemetry
                  ? 'Enviando...'
                  : 'Informar Admin com Contexto'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export function RootErrorBoundary({ children }: { children: React.ReactNode }) {
  return <AppErrorBoundary scope="root">{children}</AppErrorBoundary>;
}

export function RouteErrorBoundary({
  children,
  routeName,
  onBack,
}: {
  children: React.ReactNode;
  routeName?: string;
  onBack?: () => void;
}) {
  return (
    <AppErrorBoundary scope="route" routeName={routeName} onBack={onBack}>
      {children}
    </AppErrorBoundary>
  );
}
