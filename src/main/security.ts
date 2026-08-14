import type { Session } from 'electron';

export const configureSessionSecurity = (session: Session): void => {
  session.setPermissionCheckHandler(() => false);
  session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
};
