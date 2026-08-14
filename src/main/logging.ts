import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const MAX_LOG_BYTES = 2 * 1024 * 1024;

interface SerializedError {
  readonly message: string;
  readonly name: string;
  readonly stack?: string;
}

interface LogEntry {
  readonly error?: SerializedError;
  readonly level: 'error' | 'info';
  readonly message: string;
  readonly scope: string;
  readonly timestamp: string;
}

export interface AppLogger {
  error(scope: string, message: string, error?: unknown): void;
  info(scope: string, message: string): void;
}

const redactHomePath = (value: string, homePath: string): string =>
  homePath.length === 0 ? value : value.replaceAll(homePath, '<home>');

const serializeError = (error: unknown, homePath: string): SerializedError => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactHomePath(error.message, homePath),
      ...(error.stack === undefined ? {} : { stack: redactHomePath(error.stack, homePath) }),
    };
  }

  return {
    name: 'UnknownError',
    message: redactHomePath(String(error), homePath),
  };
};

const rotateLogIfNeeded = async (logPath: string): Promise<void> => {
  try {
    const details = await stat(logPath);
    if (details.size >= MAX_LOG_BYTES) {
      await rm(`${logPath}.previous`, { force: true });
      await rename(logPath, `${logPath}.previous`);
    }
  } catch (error) {
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (errorCode !== 'ENOENT') {
      throw error;
    }
  }
};

export const createAppLogger = async (
  logDirectory: string,
  homePath: string,
): Promise<AppLogger> => {
  await mkdir(logDirectory, { recursive: true });
  const logPath = path.join(logDirectory, 'main.log');
  await rotateLogIfNeeded(logPath);

  let writeQueue = Promise.resolve();

  const enqueue = (entry: LogEntry): void => {
    writeQueue = writeQueue
      .then(() => appendFile(logPath, `${JSON.stringify(entry)}\n`, 'utf8'))
      .catch(() => undefined);
  };

  return {
    error(scope, message, error) {
      enqueue({
        level: 'error',
        scope,
        message: redactHomePath(message, homePath),
        timestamp: new Date().toISOString(),
        ...(error === undefined ? {} : { error: serializeError(error, homePath) }),
      });
    },
    info(scope, message) {
      enqueue({
        level: 'info',
        scope,
        message: redactHomePath(message, homePath),
        timestamp: new Date().toISOString(),
      });
    },
  };
};

export const installProcessErrorLogging = (logger: AppLogger, onFatalError: () => void): void => {
  process.on('uncaughtException', (error) => {
    logger.error('main-process', 'Uncaught exception', error);
    onFatalError();
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('main-process', 'Unhandled promise rejection', reason);
  });
};
