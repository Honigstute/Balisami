import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { DesktopApi } from '../../shared/desktop-api';
import { ProjectSession } from './project-session';

interface UseProjectSessionOptions {
  readonly packagedRecoveryRestore?: boolean;
}

export const useProjectSession = (desktop: DesktopApi, options: UseProjectSessionOptions = {}) => {
  const [session] = useState(() => new ProjectSession({ desktop }));
  const view = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const packagedRecoveryStarted = useRef(false);

  useEffect(() => {
    const unbind = session.bindDesktopEvents();
    void session.start();
    return unbind;
  }, [session]);

  useEffect(() => {
    const recovery =
      view.dialog?.kind === 'startup-recovery' ? view.dialog.recoveries[0] : undefined;
    if (
      packagedRecoveryStarted.current ||
      options.packagedRecoveryRestore !== true ||
      recovery === undefined
    ) {
      return;
    }
    packagedRecoveryStarted.current = true;
    void session.restoreRecovery(recovery.id);
  }, [options.packagedRecoveryRestore, session, view.dialog]);

  return Object.freeze({ session, view });
};
