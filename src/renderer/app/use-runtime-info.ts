import { useEffect, useState } from 'react';

import type { RuntimeInfo } from '../../shared/desktop-api';

export type RuntimeState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: RuntimeInfo }
  | { readonly status: 'unavailable' };

export const useRuntimeInfo = (): RuntimeState => {
  const [state, setState] = useState<RuntimeState>({ status: 'loading' });

  useEffect(() => {
    let active = true;

    void window.balsamicDesktop
      .getRuntimeInfo()
      .then((value) => {
        if (active) {
          setState({ status: 'ready', value });
        }
      })
      .catch(() => {
        if (active) {
          setState({ status: 'unavailable' });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return state;
};
