import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { DOCUMENT_COMMAND_TYPES } from '../../domain';
import type { DesktopApi } from '../../shared/desktop-api';
import { ProjectSession } from './project-session';

interface UseProjectSessionOptions {
  readonly packagedProbeNote?: string;
}

export const useProjectSession = (desktop: DesktopApi, options: UseProjectSessionOptions = {}) => {
  const [session] = useState(() => new ProjectSession({ desktop }));
  const view = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const packagedProbeStarted = useRef(false);

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

  return view;
};
