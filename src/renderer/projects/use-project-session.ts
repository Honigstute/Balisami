import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { DOCUMENT_COMMAND_TYPES } from '../../domain';
import type { DesktopApi } from '../../shared/desktop-api';
import { ProjectSession } from './project-session';

interface UseProjectSessionOptions {
  readonly packagedProbeNote?: string;
  readonly packagedRecoveryRestore?: boolean;
}

export const useProjectSession = (desktop: DesktopApi, options: UseProjectSessionOptions = {}) => {
  const [session] = useState(() => new ProjectSession({ desktop }));
  const view = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const packagedProbeStarted = useRef(false);
  const packagedRecoveryStarted = useRef(false);

  useEffect(() => {
    const unbind = session.bindDesktopEvents();
    void session.start();
    return unbind;
  }, [session]);

  useEffect(() => {
    const note = options.packagedProbeNote;
    const firstBoardId = view.history?.document.boardIds[0];
    if (
      packagedProbeStarted.current ||
      note === undefined ||
      firstBoardId === undefined ||
      !view.isReady
    ) {
      return;
    }
    packagedProbeStarted.current = true;
    const changed = session.dispatch({
      type: DOCUMENT_COMMAND_TYPES.setBoardNote,
      boardId: firstBoardId,
      note: { text: note },
    });
    if (changed?.ok === true && changed.changed) {
      void session.save();
    }
  }, [options.packagedProbeNote, session, view.history, view.isReady]);

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
