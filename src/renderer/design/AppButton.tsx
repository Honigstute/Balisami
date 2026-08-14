import type { ComponentPropsWithRef } from 'react';

export type AppButtonTone = 'danger' | 'neutral' | 'primary';

export interface AppButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'className'> {
  readonly initialFocus?: boolean;
  readonly tone?: AppButtonTone;
}

/** Compact application action with token-owned geometry and state styling. */
export const AppButton = ({
  initialFocus = false,
  tone = 'neutral',
  type = 'button',
  ...buttonProps
}: AppButtonProps) => (
  <button
    {...buttonProps}
    className={`app-button app-button--${tone}`}
    data-modal-initial-focus={initialFocus ? 'true' : undefined}
    type={type}
  />
);
