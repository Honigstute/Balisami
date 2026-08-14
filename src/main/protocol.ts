import { net, protocol } from 'electron';
import { pathToFileURL } from 'node:url';

import { APP_SCHEME } from '../shared/app-protocol';
import { resolveProtocolAssetPath } from './protocol-path';

export { APP_ENTRY_URL } from '../shared/app-protocol';

export const registerAppScheme = (): void => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true,
      },
    },
  ]);
};

export const installAppProtocol = (rendererRoot: string): void => {
  protocol.handle(APP_SCHEME, (request) => {
    const assetPath = resolveProtocolAssetPath(rendererRoot, request.url);
    if (assetPath === null) {
      return new Response('Not found', { status: 404 });
    }

    return net.fetch(pathToFileURL(assetPath).toString());
  });
};
