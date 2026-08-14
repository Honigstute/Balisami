import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { MAX_RECENT_PROJECTS, RecentProjectStore } from '../src/main/recent/recent-project-store';

const temporaryDirectories: string[] = [];

const createStore = async (): Promise<{
  readonly root: string;
  readonly store: RecentProjectStore;
}> => {
  const root = await mkdtemp(path.join(tmpdir(), 'balsamic-recent-'));
  temporaryDirectories.push(root);
  return { root, store: new RecentProjectStore(root) };
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('recent project store', () => {
  it('starts empty and records newest-first opaque path identities', async () => {
    const { root, store } = await createStore();
    const firstPath = path.join(root, 'First Project.test');
    const secondPath = path.join(root, 'Second Project.test');

    await expect(store.list()).resolves.toEqual({ ok: true, value: [] });
    await expect(store.record(firstPath, 100)).resolves.toMatchObject({ ok: true });
    await expect(store.record(secondPath, 200)).resolves.toMatchObject({ ok: true });
    const listed = await store.list();
    if (!listed.ok) {
      throw new Error('Expected recent projects to list.');
    }
    expect(
      listed.value.map(({ displayName, lastOpenedAtEpochMs }) => ({
        displayName,
        lastOpenedAtEpochMs,
      })),
    ).toEqual([
      { displayName: 'Second Project.test', lastOpenedAtEpochMs: 200 },
      { displayName: 'First Project.test', lastOpenedAtEpochMs: 100 },
    ]);
    expect(listed.value.every((entry) => /^[a-f0-9]{64}$/u.test(entry.id))).toBe(true);
    expect(new Set(listed.value.map((entry) => entry.id)).size).toBe(2);
    expect(Object.isFrozen(listed.value)).toBe(true);
  });

  it('deduplicates paths, caps entries, and serializes concurrent updates', async () => {
    const { root, store } = await createStore();
    const paths = Array.from({ length: MAX_RECENT_PROJECTS + 5 }, (_, index) =>
      path.join(root, `Project ${String(index)}.test`),
    );
    await Promise.all(paths.map((filePath, index) => store.record(filePath, index)));
    const capped = await store.list();
    if (!capped.ok) {
      throw new Error('Expected capped recent projects to list.');
    }
    expect(capped.value).toHaveLength(MAX_RECENT_PROJECTS);
    expect(capped.value[0]?.displayName).toBe(`Project ${String(paths.length - 1)}.test`);

    await store.record(paths.at(-1), 999);
    const deduplicated = await store.list();
    if (!deduplicated.ok) {
      throw new Error('Expected deduplicated recent projects to list.');
    }
    expect(deduplicated.value).toHaveLength(MAX_RECENT_PROJECTS);
    expect(deduplicated.value[0]?.lastOpenedAtEpochMs).toBe(999);
  });

  it('serializes updates across multiple store instances for one metadata file', async () => {
    const { root, store } = await createStore();
    const secondStore = new RecentProjectStore(root);

    await Promise.all([
      store.record(path.join(root, 'First Window.test'), 100),
      secondStore.record(path.join(root, 'Second Window.test'), 200),
    ]);

    const listed = await store.list();
    expect(listed).toMatchObject({
      ok: true,
      value: [
        { displayName: 'Second Window.test', lastOpenedAtEpochMs: 200 },
        { displayName: 'First Window.test', lastOpenedAtEpochMs: 100 },
      ],
    });
  });

  it('forgets by opaque identity without deleting the project file', async () => {
    const { root, store } = await createStore();
    const filePath = path.join(root, 'Keep Me.test');
    await writeFile(filePath, 'project bytes');
    const recorded = await store.record(filePath, 100);
    if (!recorded.ok || recorded.value.entries[0] === undefined) {
      throw new Error('Expected recent project fixture to record.');
    }

    await expect(store.forget(recorded.value.entries[0].id)).resolves.toMatchObject({
      ok: true,
      value: { changed: true, entries: [] },
    });
    expect(await readFile(filePath, 'utf8')).toBe('project bytes');
  });

  it('preserves corrupt metadata instead of overwriting it during record', async () => {
    const { root, store } = await createStore();
    const metadataPath = path.join(root, 'recent-projects-v1.json');
    await writeFile(metadataPath, '{"truncated":');

    await expect(store.list()).resolves.toMatchObject({
      ok: false,
      error: { code: 'recent-projects-corrupt' },
    });
    await expect(store.record(path.join(root, 'Project.test'), 100)).resolves.toMatchObject({
      ok: false,
      error: { code: 'recent-projects-corrupt' },
    });
    expect(await readFile(metadataPath, 'utf8')).toBe('{"truncated":');
  });

  it('rejects invalid paths and timestamps before touching storage', async () => {
    const { store } = await createStore();
    await expect(store.record('relative.test', 1)).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid-recent-project' },
    });
    await expect(store.record('/valid-looking.test', -1)).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid-recent-project' },
    });
    await expect(store.list()).resolves.toEqual({ ok: true, value: [] });
  });
});
