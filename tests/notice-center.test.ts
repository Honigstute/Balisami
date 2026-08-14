// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  MAX_VISIBLE_NOTICES,
  NOTICE_REPEAT_WINDOW_MS,
  NoticeCenterStore,
  type AppNotice,
} from '../src/renderer/design/notice-center';

const createNotice = (key: string): AppNotice => ({
  key,
  message: `Message for ${key}`,
  title: `Notice ${key}`,
  tone: 'info',
});

describe('notice center store', () => {
  it('deduplicates visible notices and publishes only actual changes', () => {
    const store = new NoticeCenterStore();
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.report(createNotice('same'), 100)).toBe(true);
    expect(store.report(createNotice('same'), 200)).toBe(false);
    expect(store.getSnapshot()).toHaveLength(1);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('caps visible feedback to the newest stable notices', () => {
    const store = new NoticeCenterStore();
    for (let index = 0; index < MAX_VISIBLE_NOTICES + 2; index += 1) {
      expect(store.report(createNotice(`notice-${String(index)}`), index)).toBe(true);
    }

    expect(store.getSnapshot().map((notice) => notice.key)).toEqual([
      'notice-2',
      'notice-3',
      'notice-4',
    ]);
  });

  it('rate-limits a dismissed key before allowing a later recurrence', () => {
    const store = new NoticeCenterStore();
    expect(store.report(createNotice('repeat'), 1_000)).toBe(true);
    expect(store.dismiss('repeat')).toBe(true);
    expect(store.report(createNotice('repeat'), 1_000 + NOTICE_REPEAT_WINDOW_MS - 1)).toBe(false);
    expect(store.report(createNotice('repeat'), 1_000 + NOTICE_REPEAT_WINDOW_MS)).toBe(true);
  });

  it('rejects malformed or oversized feedback without publishing it', () => {
    const store = new NoticeCenterStore();
    expect(store.report({ ...createNotice('INVALID KEY'), key: 'INVALID KEY' }, 0)).toBe(false);
    expect(store.report({ ...createNotice('long'), message: 'x'.repeat(241) }, 0)).toBe(false);
    expect(store.report(createNotice('nan'), Number.NaN)).toBe(false);
    expect(store.getSnapshot()).toHaveLength(0);
  });
});
