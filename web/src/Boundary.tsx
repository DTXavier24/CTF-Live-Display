import { Component, type ReactNode } from 'react';

/** Per-panel error boundary: a crash hides that panel only, then retries after 5s. */
export class Boundary extends Component<{ name: string; children: ReactNode; onError?: (err: unknown) => void }, { failed: boolean }> {
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
    return this.state.failed ? null : this.props.children;
  }
}
