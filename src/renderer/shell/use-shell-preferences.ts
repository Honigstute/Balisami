import { useCallback, useRef, useState } from 'react';

import {
  loadShellPreferences,
  saveShellPreferences,
  setShellPaneCollapsed,
  setShellPaneWidth,
  type ShellPane,
  type ShellPreferences,
  type ShellPreferenceStorage,
} from './shell-preferences';

const getBrowserStorage = (): ShellPreferenceStorage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

export interface ShellPreferenceController {
  readonly preferences: ShellPreferences;
  readonly cancelPaneWidthPreview: (pane: ShellPane, originalWidth: number) => void;
  readonly commitPaneWidth: (pane: ShellPane, width?: number) => void;
  readonly previewPaneWidth: (pane: ShellPane, width: number) => void;
  readonly setPaneCollapsed: (pane: ShellPane, collapsed: boolean) => void;
}

/** Owns the one renderer-side source for non-document shell preferences. */
export const useShellPreferences = (): ShellPreferenceController => {
  const storageRef = useRef<ShellPreferenceStorage | undefined>(undefined);
  const storageInitializedRef = useRef(false);
  if (!storageInitializedRef.current) {
    storageRef.current = getBrowserStorage();
    storageInitializedRef.current = true;
  }
  const [preferences, setPreferences] = useState(() => loadShellPreferences(storageRef.current));
  const preferencesRef = useRef(preferences);

  const replacePreferences = useCallback((next: ShellPreferences, persist: boolean): void => {
    preferencesRef.current = next;
    setPreferences(next);
    if (persist) {
      saveShellPreferences(storageRef.current, next);
    }
  }, []);

  const previewPaneWidth = useCallback(
    (pane: ShellPane, width: number): void => {
      replacePreferences(setShellPaneWidth(preferencesRef.current, pane, width), false);
    },
    [replacePreferences],
  );

  const commitPaneWidth = useCallback(
    (pane: ShellPane, width?: number): void => {
      const next =
        width === undefined
          ? preferencesRef.current
          : setShellPaneWidth(preferencesRef.current, pane, width);
      replacePreferences(next, true);
    },
    [replacePreferences],
  );

  const cancelPaneWidthPreview = useCallback(
    (pane: ShellPane, originalWidth: number): void => {
      replacePreferences(setShellPaneWidth(preferencesRef.current, pane, originalWidth), false);
    },
    [replacePreferences],
  );

  const setPaneCollapsed = useCallback(
    (pane: ShellPane, collapsed: boolean): void => {
      replacePreferences(setShellPaneCollapsed(preferencesRef.current, pane, collapsed), true);
    },
    [replacePreferences],
  );

  return {
    cancelPaneWidthPreview,
    commitPaneWidth,
    preferences,
    previewPaneWidth,
    setPaneCollapsed,
  };
};
