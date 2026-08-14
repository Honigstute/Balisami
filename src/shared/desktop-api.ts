export const DESKTOP_CHANNELS = {
  getRuntimeInfo: 'desktop:get-runtime-info',
  reportRendererReady: 'desktop:report-renderer-ready',
} as const;

export type RuntimePlatform = 'darwin' | 'win32';

export interface RuntimeInfo {
  readonly appVersion: string;
  readonly arch: string;
  readonly isPackaged: boolean;
  readonly platform: RuntimePlatform;
}

export interface DesktopApi {
  getRuntimeInfo(): Promise<RuntimeInfo>;
  reportRendererReady(): Promise<void>;
}

export interface DesktopAcknowledgement {
  readonly accepted: true;
}

export const DESKTOP_ACKNOWLEDGEMENT: DesktopAcknowledgement = Object.freeze({ accepted: true });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isRuntimeInfo = (value: unknown): value is RuntimeInfo => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.appVersion === 'string' &&
    typeof value.arch === 'string' &&
    typeof value.isPackaged === 'boolean' &&
    (value.platform === 'darwin' || value.platform === 'win32')
  );
};

export const isDesktopAcknowledgement = (value: unknown): value is DesktopAcknowledgement =>
  isRecord(value) && value.accepted === true;
