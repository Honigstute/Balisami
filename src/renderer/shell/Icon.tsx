import type { ReactNode } from 'react';

export type IconName =
  'chevron' | 'close' | 'more' | 'presentation' | 'redo' | 'search' | 'undo' | 'zoomIn' | 'zoomOut';

const getIconPath = (name: IconName): ReactNode => {
  switch (name) {
    case 'chevron':
      return <path d="m5 8 3 3 3-3" />;
    case 'close':
      return <path d="m4 4 8 8m0-8-8 8" />;
    case 'more':
      return (
        <>
          <circle cx="4" cy="8" r="1" fill="currentColor" stroke="none" />
          <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" />
        </>
      );
    case 'presentation':
      return (
        <>
          <rect x="2.5" y="3" width="11" height="8" rx="1" />
          <path d="m6 13 2-2 2 2" />
        </>
      );
    case 'redo':
      return <path d="M13 5v4H9M13 9a5 5 0 1 0-1.2 3.2" />;
    case 'search':
      return (
        <>
          <circle cx="7" cy="7" r="4" />
          <path d="m10 10 3 3" />
        </>
      );
    case 'undo':
      return <path d="M3 5v4h4M3 9a5 5 0 1 1 1.2 3.2" />;
    case 'zoomIn':
      return (
        <>
          <circle cx="7" cy="7" r="4" />
          <path d="M7 5v4M5 7h4m1.9 3.9L14 14" />
        </>
      );
    case 'zoomOut':
      return (
        <>
          <circle cx="7" cy="7" r="4" />
          <path d="M5 7h4m1.9 3.9L14 14" />
        </>
      );
  }
};

export const Icon = ({ name }: { readonly name: IconName }) => (
  <svg aria-hidden="true" className="icon" viewBox="0 0 16 16">
    {getIconPath(name)}
  </svg>
);

export const FoundationMark = () => (
  <svg aria-hidden="true" className="foundation-mark" viewBox="0 0 24 24">
    <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4z" />
    <path className="foundation-mark__accent" d="M13 13h7v7h-7z" />
  </svg>
);
