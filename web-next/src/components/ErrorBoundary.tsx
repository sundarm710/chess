import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Catches render errors so one bad view shows a message instead of blanking the whole app.
 *  Reset it by changing its `key` (App keys it on view+slug, so navigating recovers). */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('View error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-w/40 bg-white p-4 text-sm">
          <p className="font-semibold text-w">This view hit an error.</p>
          <p className="mt-1 text-ink2">{this.state.error.message}</p>
          <p className="mt-2 text-[11px] text-ink2">
            Switch tabs/tournaments to retry. If it persists, hard-refresh (⌘⇧R).
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
