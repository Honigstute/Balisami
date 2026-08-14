import { useEffect, useState } from 'react';

import { AppShell } from '../shell/AppShell';
import { useRuntimeInfo } from './use-runtime-info';

const getPlatformLabel = (platform: 'darwin' | 'win32'): string =>
  platform === 'darwin' ? 'macOS' : 'Windows';

export const App = () => {
  const runtime = useRuntimeInfo();
  const [readinessFailed, setReadinessFailed] = useState(false);

  useEffect(() => {
    if (runtime.status !== 'ready') {
      return;
    }

    let active = true;
    void window.balsamicDesktop.reportRendererReady().catch(() => {
      if (active) {
        setReadinessFailed(true);
      }
    });

    return () => {
      active = false;
    };
  }, [runtime]);

  if (runtime.status === 'loading') {
    return (
      <AppShell
        quickAddShortcut="Ctrl/Cmd K"
        runtimeLabel="Connecting to desktop…"
        runtimeTone="quiet"
      />
    );
  }

  if (runtime.status === 'unavailable' || readinessFailed) {
    return (
      <AppShell
        quickAddShortcut="Ctrl/Cmd K"
        runtimeLabel="Desktop bridge unavailable"
        runtimeTone="problem"
      />
    );
  }

  const { appVersion, arch, isPackaged, platform } = runtime.value;
  const mode = isPackaged ? 'Packaged' : 'Development';

  return (
    <AppShell
      quickAddShortcut={platform === 'darwin' ? '⌘ K' : 'Ctrl K'}
      runtimeLabel={`${getPlatformLabel(platform)} · ${arch} · v${appVersion} · ${mode}`}
      runtimeTone="ready"
    />
  );
};
