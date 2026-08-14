import path from 'node:path';

import { APP_HOST, APP_SCHEME } from '../shared/app-protocol';

export const resolveProtocolAssetPath = (
  rendererRoot: string,
  requestUrl: string,
): string | null => {
  try {
    const lowerCaseRequestUrl = requestUrl.toLowerCase();
    if (lowerCaseRequestUrl.includes('%2e') || lowerCaseRequestUrl.includes('%00')) {
      return null;
    }

    const url = new URL(requestUrl);
    if (url.protocol !== `${APP_SCHEME}:` || url.hostname !== APP_HOST) {
      return null;
    }

    const decodedPath = decodeURIComponent(url.pathname);
    if (decodedPath.includes('\0')) {
      return null;
    }

    const relativeAssetPath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
    const absoluteAssetPath = path.resolve(rendererRoot, relativeAssetPath);
    const pathWithinRoot = path.relative(rendererRoot, absoluteAssetPath);

    if (pathWithinRoot.startsWith('..') || path.isAbsolute(pathWithinRoot)) {
      return null;
    }

    return absoluteAssetPath;
  } catch {
    return null;
  }
};
