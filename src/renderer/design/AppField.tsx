import { useId, type ReactNode } from 'react';

export interface AppFieldAccessibility {
  readonly controlId: string;
  readonly describedBy: string;
  readonly invalid: boolean;
  readonly labelledBy: string;
}

interface AppFieldProps {
  readonly children: (accessibility: AppFieldAccessibility) => ReactNode;
  readonly grouped?: boolean;
  readonly hint?: string | undefined;
  readonly label: string;
  readonly mixed?: boolean;
  readonly validation?: string | undefined;
}

/** Compact field frame with a permanently reserved validation/help line. */
export const AppField = ({
  children,
  grouped = false,
  hint,
  label,
  mixed = false,
  validation,
}: AppFieldProps) => {
  const generatedId = useId();
  const controlId = `app-field-${generatedId}`;
  const labelId = `${controlId}-label`;
  const messageId = `${controlId}-message`;
  const invalid = validation !== undefined;

  return (
    <div
      className={`app-field${invalid ? ' app-field--invalid' : ''}${mixed ? ' app-field--mixed' : ''}`}
    >
      {grouped ? (
        <span className="app-field__label" id={labelId}>
          <span>{label}</span>
          {mixed ? <span className="app-field__mixed">Mixed</span> : null}
        </span>
      ) : (
        <label className="app-field__label" htmlFor={controlId} id={labelId}>
          <span>{label}</span>
          {mixed ? <span className="app-field__mixed">Mixed</span> : null}
        </label>
      )}
      {children({ controlId, describedBy: messageId, invalid, labelledBy: labelId })}
      <span
        aria-live={invalid ? 'polite' : undefined}
        className="app-field__message"
        id={messageId}
      >
        {validation ?? hint}
      </span>
    </div>
  );
};
