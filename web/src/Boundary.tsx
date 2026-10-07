import { Component, type ReactNode } from 'react';

/** Error boundary: a crash shows the fallback (nothing, for a panel) and retries after 5s. */
export class Boundary extends Component<
  { name: string; children: ReactNode; onError?: (err: unknown) => void; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  private retry?: ReturnType<typeof setTimeout>;

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err: unknown) {
    console.error(`[${this.props.name}] crashed`, err);
    this.props.onError?.(err);
    this.retry = setTimeout(() => this.setState({ failed: false }), 5000);
  }

  componentWillUnmount() {
    clearTimeout(this.retry);
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
