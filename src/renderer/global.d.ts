import type { DesktopApi } from '../shared/desktop-api';

declare global {
  interface Window {
    readonly balsamicDesktop: DesktopApi;
  }
}

export {};
