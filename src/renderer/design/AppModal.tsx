import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  '[href]',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface AppModalProps {
  readonly children: ReactNode;
  readonly describedBy?: string;
  readonly labelledBy: string;
  readonly onDismiss?: () => void;
  readonly role?: 'alertdialog' | 'dialog';
}

/** Focused overlay surface. It traps focus without changing shell layout. */
export const AppModal = ({
  children,
  describedBy,
  labelledBy,
  onDismiss,
  role = 'dialog',
}: AppModalProps) => {
  const surfaceRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const priorFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const surface = surfaceRef.current;
    const initial =
      surface?.querySelector<HTMLElement>('[data-modal-initial-focus="true"]:not(:disabled)') ??
      surface?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    initial?.focus();
    return () => priorFocus?.focus();
  }, [labelledBy]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape' && onDismiss !== undefined) {
      event.preventDefault();
      onDismiss();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const focusable = Array.from(
      surfaceRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) {
      event.preventDefault();
      surfaceRef.current?.focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="app-modal-backdrop">
      <section
        aria-describedby={describedBy}
        aria-labelledby={labelledBy}
        aria-modal="true"
        className="app-modal"
        onKeyDown={handleKeyDown}
        ref={surfaceRef}
        role={role}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
};

export const AppModalHeading = ({
  description,
  descriptionId,
  eyebrow,
  title,
  titleId,
}: {
  readonly description: ReactNode;
  readonly descriptionId?: string;
  readonly eyebrow: ReactNode;
  readonly title: ReactNode;
  readonly titleId: string;
}) => (
  <header className="app-modal__heading">
    <span className="app-modal__eyebrow">{eyebrow}</span>
    <h2 id={titleId}>{title}</h2>
    <p id={descriptionId}>{description}</p>
  </header>
);

export const AppModalNotice = ({ children }: { readonly children: ReactNode }) => (
  <p className="app-modal__notice">{children}</p>
);

export const AppModalList = ({ children }: { readonly children: ReactNode }) => (
  <ul className="app-modal__list">{children}</ul>
);

export const AppModalRow = ({
  actions,
  primary,
  secondary,
}: {
  readonly actions: ReactNode;
  readonly primary: ReactNode;
  readonly secondary: ReactNode;
}) => (
  <li className="app-modal__row">
    <div className="app-modal__row-copy">
      <strong>{primary}</strong>
      <span>{secondary}</span>
    </div>
    <div className="app-modal__row-actions">{actions}</div>
  </li>
);

export const AppModalActions = ({
  children,
  split = false,
}: {
  readonly children: ReactNode;
  readonly split?: boolean;
}) => (
  <footer className={`app-modal__actions${split ? ' app-modal__actions--split' : ''}`}>
    {children}
  </footer>
);
