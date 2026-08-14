import { Component, type ReactNode } from 'react';

import { AppButton } from './AppButton';
import type { NoticeCenterStore } from './notice-center';

interface RegionErrorBoundaryProps {
  readonly children: ReactNode;
  readonly noticeStore: NoticeCenterStore;
  readonly regionKey: 'canvas' | 'inspector' | 'navigator' | 'shelf';
  readonly regionName: string;
}

interface RegionErrorBoundaryState {
  readonly failed: boolean;
}

/** Contains a render failure inside its existing shell track and reports it once. */
export class RegionErrorBoundary extends Component<
  RegionErrorBoundaryProps,
  RegionErrorBoundaryState
> {
  override state: RegionErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): RegionErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(): void {
    this.props.noticeStore.report({
      key: `region:${this.props.regionKey}`,
      message: 'The rest of the editor is still available. Retry this region when ready.',
      title: `${this.props.regionName} was isolated`,
      tone: 'danger',
    });
  }

  override render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }
    return (
      <div className="region-failure" data-failed-region={this.props.regionKey} role="status">
        <strong>{this.props.regionName} unavailable</strong>
        <AppButton onClick={() => this.setState({ failed: false })}>Retry</AppButton>
      </div>
    );
  }
}
