import type { ReactNode } from 'react';

export const AppEmptyState = ({
  action,
  description,
  title,
}: {
  readonly action?: ReactNode;
  readonly description: ReactNode;
  readonly title: ReactNode;
}) => (
  <div className="app-empty-state">
    <strong>{title}</strong>
    <p>{description}</p>
    {action}
  </div>
);

export const AppScroller = ({ children }: { readonly children: ReactNode }) => (
  <div className="app-scroller">{children}</div>
);
