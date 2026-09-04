// @vitest-environment node

import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  extractNativeProjectFileArguments,
  NativeProjectOpenRouter,
} from '../src/main/native-project-open';

const RECENT_ID = 'a'.repeat(64);

describe('native project open routing', () => {
  it('extracts absolute file arguments without accepting runtime switches', () => {
    expect(
      extractNativeProjectFileArguments(
        ['/Applications/Balsamic', '--inspect=1', '/tmp/First.balsamic', 'relative.balsamic'],
        1,
      ),
    ).toEqual([path.normalize('/tmp/First.balsamic')]);
  });

  it('keeps paths in main and sends one opaque recent ID after the renderer is ready', async () => {
    const focus = vi.fn();
    const sendProjectCommand = vi.fn();
    const record = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        changed: true,
        entries: [
          {
            displayName: 'Checkout.balsamic',
            filePath: '/tmp/Checkout.balsamic',
            id: RECENT_ID,
            lastOpenedAtEpochMs: 1,
          },
        ],
      },
    });
    const router = new NativeProjectOpenRouter({
      getTarget: () => ({ focus, sendProjectCommand }),
      recentProjects: { record },
    });

    expect(router.enqueue('/tmp/Checkout.balsamic')).toBe(true);
    expect(record).not.toHaveBeenCalled();
    router.setReady();
    await vi.waitFor(() => expect(sendProjectCommand).toHaveBeenCalledOnce());
    expect(record).toHaveBeenCalledWith(path.normalize('/tmp/Checkout.balsamic'));
    expect(sendProjectCommand).toHaveBeenCalledWith({
      recentProjectId: RECENT_ID,
      type: 'open-recent-id',
    });
    expect(focus).toHaveBeenCalledOnce();
  });

  it('rejects invalid paths and reports recent-store failures without renderer exposure', async () => {
    const reportFailure = vi.fn();
    const sendProjectCommand = vi.fn();
    const router = new NativeProjectOpenRouter({
      getTarget: () => ({ focus: vi.fn(), sendProjectCommand }),
      recentProjects: {
        record: () =>
          Promise.resolve({
            error: { code: 'invalid-recent-project', message: 'invalid' },
            ok: false,
          }),
      },
      reportFailure,
    });
    router.setReady();
    expect(router.enqueue('relative.balsamic')).toBe(false);
    expect(router.enqueue('/tmp/Broken.balsamic')).toBe(true);
    await vi.waitFor(() => expect(reportFailure).toHaveBeenCalledOnce());
    expect(sendProjectCommand).not.toHaveBeenCalled();
  });
});
