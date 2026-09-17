import { Component, type ReactNode } from 'react';

import { ErrorState } from './ui/ErrorState';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Unhandled render error caught by ErrorBoundary:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorState
          message="Something went wrong. Try reloading the app."
          onRetry={() => this.setState({ hasError: false })}
        />
      );
    }

    return this.props.children;
  }
}
