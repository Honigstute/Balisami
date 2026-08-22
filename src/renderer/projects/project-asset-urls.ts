import { useLayoutEffect, useState, useSyncExternalStore } from 'react';

import type { AssetId, ProjectDocument } from '../../domain';
import type { ProjectSession } from './project-session';

export type ProjectAssetUrls = Readonly<Record<string, string>>;

export interface AssetUrlPlatform {
  create(bytes: Uint8Array, mediaType: string): string | undefined;
  revoke(url: string): void;
}

interface AssetUrlEntry {
  readonly digest: string;
  readonly url: string;
}

const EMPTY_ASSET_URLS: ProjectAssetUrls = Object.freeze({});

export const createBrowserAssetUrlPlatform = (): AssetUrlPlatform =>
  Object.freeze({
    create(bytes: Uint8Array, mediaType: string): string | undefined {
      try {
        return URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: mediaType }));
      } catch {
        return undefined;
      }
    },
    revoke(url: string): void {
      URL.revokeObjectURL(url);
    },
  });

/** Disposable object URLs derived from authenticated bytes, never document state. */
export class ProjectAssetUrlStore {
  readonly #entries = new Map<AssetId, AssetUrlEntry>();
  readonly #listeners = new Set<() => void>();
  readonly #platform: AssetUrlPlatform;
  #snapshot: ProjectAssetUrls = EMPTY_ASSET_URLS;

  constructor(platform: AssetUrlPlatform = createBrowserAssetUrlPlatform()) {
    this.#platform = platform;
  }

  getSnapshot = (): ProjectAssetUrls => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  sync(
    document: ProjectDocument | undefined,
    getBytes: (assetId: AssetId) => Uint8Array | undefined,
  ): void {
    const references = document === undefined ? [] : Object.values(document.assetsById);
    const liveIds = new Set(references.map((reference) => reference.id));
    let changed = false;

    for (const [assetId, entry] of this.#entries) {
      const reference = document?.assetsById[assetId];
      if (reference === undefined || reference.sha256 !== entry.digest || !liveIds.has(assetId)) {
        this.#platform.revoke(entry.url);
        this.#entries.delete(assetId);
        changed = true;
      }
    }
    for (const reference of references) {
      if (this.#entries.has(reference.id)) {
        continue;
      }
      const bytes = getBytes(reference.id);
      const url =
        bytes === undefined ? undefined : this.#platform.create(bytes, reference.mediaType);
      if (url !== undefined) {
        this.#entries.set(reference.id, Object.freeze({ digest: reference.sha256, url }));
        changed = true;
      }
    }
    if (!changed) {
      return;
    }
    const urls: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [assetId, entry] of this.#entries) {
      urls[assetId] = entry.url;
    }
    this.#snapshot = this.#entries.size === 0 ? EMPTY_ASSET_URLS : Object.freeze(urls);
    this.#listeners.forEach((listener) => listener());
  }

  dispose(): void {
    if (this.#entries.size === 0) {
      return;
    }
    this.#entries.forEach((entry) => this.#platform.revoke(entry.url));
    this.#entries.clear();
    this.#snapshot = EMPTY_ASSET_URLS;
    this.#listeners.forEach((listener) => listener());
  }
}

export const useProjectAssetUrls = (
  session: ProjectSession,
  document: ProjectDocument | undefined,
): ProjectAssetUrls => {
  const [store] = useState(() => new ProjectAssetUrlStore());
  useLayoutEffect(() => {
    store.sync(document, (assetId) => session.getAssetBytes(assetId));
  }, [document, session, store]);
  useLayoutEffect(() => () => store.dispose(), [store]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
};
