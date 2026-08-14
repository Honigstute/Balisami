import { readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

import { isValidApplicationDataRoot } from '../files/path-validation';

export type RecoveryProbeMode = 'verify' | 'write';

export interface RecoveryProbeContract {
  readonly processTimeoutMs: number;
  readonly rootArgumentPrefix: string;
  readonly rootNamePrefix: string;
  readonly terminationTimeoutMs: number;
  readonly userFileName: string;
  readonly verificationMarker: string;
  readonly verifyArgument: string;
  readonly writerReadyMarker: string;
  readonly writeArgument: string;
}

export type RecoveryProbeInvocation =
  | { readonly kind: 'none' }
  | { readonly kind: 'invalid'; readonly message: string }
  | {
      readonly kind: 'probe';
      readonly contract: RecoveryProbeContract;
      readonly mode: RecoveryProbeMode;
      readonly root: string;
    };

const SAFE_PROBE_FILE_NAME = /^[a-z0-9][a-z0-9._-]{0,119}$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPositiveBoundedInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 120_000;

const isArgument = (value: unknown): value is string =>
  typeof value === 'string' && /^--[a-z0-9-]+$/u.test(value);

const isArgumentPrefix = (value: unknown): value is string =>
  typeof value === 'string' && /^--[a-z0-9-]+=$/u.test(value);

const isRootNamePrefix = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9-]{1,59}-$/u.test(value);

const isMarker = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,119}$/u.test(value);

export const isValidRecoveryProbeFileName = (value: unknown): value is string =>
  typeof value === 'string' && SAFE_PROBE_FILE_NAME.test(value);

const parseRecoveryProbeContract = (
  input: unknown,
): { readonly ok: true; readonly value: RecoveryProbeContract } | { readonly ok: false } => {
  if (!isRecord(input)) {
    return { ok: false };
  }
  const contract = input as Partial<RecoveryProbeContract>;
  if (
    !isPositiveBoundedInteger(contract.processTimeoutMs) ||
    !isPositiveBoundedInteger(contract.terminationTimeoutMs) ||
    !isArgumentPrefix(contract.rootArgumentPrefix) ||
    !isRootNamePrefix(contract.rootNamePrefix) ||
    !isValidRecoveryProbeFileName(contract.userFileName) ||
    !isMarker(contract.verificationMarker) ||
    !isArgument(contract.verifyArgument) ||
    !isMarker(contract.writerReadyMarker) ||
    !isArgument(contract.writeArgument) ||
    contract.verifyArgument === contract.writeArgument ||
    contract.verificationMarker === contract.writerReadyMarker
  ) {
    return { ok: false };
  }
  return { ok: true, value: Object.freeze({ ...contract }) as RecoveryProbeContract };
};

/** Parses only the dedicated packaged-test arguments; ordinary application arguments are untouched. */
export const parseRecoveryProbeInvocation = (
  argvInput: unknown,
  contractInput: unknown,
): RecoveryProbeInvocation => {
  const contract = parseRecoveryProbeContract(contractInput);
  if (
    !contract.ok ||
    !Array.isArray(argvInput) ||
    !argvInput.every((value) => typeof value === 'string')
  ) {
    return { kind: 'invalid', message: 'The packaged recovery-probe contract is invalid.' };
  }

  const argv = argvInput as readonly string[];
  const writeCount = argv.filter((value) => value === contract.value.writeArgument).length;
  const verifyCount = argv.filter((value) => value === contract.value.verifyArgument).length;
  const rootArguments = argv.filter((value) => value.startsWith(contract.value.rootArgumentPrefix));
  const requested = writeCount > 0 || verifyCount > 0 || rootArguments.length > 0;
  if (!requested) {
    return { kind: 'none' };
  }
  if (writeCount + verifyCount !== 1 || rootArguments.length !== 1) {
    return {
      kind: 'invalid',
      message: 'The recovery probe requires one mode and one isolated data root.',
    };
  }

  const rootArgument = rootArguments[0];
  const root = rootArgument?.slice(contract.value.rootArgumentPrefix.length);
  if (!isValidApplicationDataRoot(root)) {
    return {
      kind: 'invalid',
      message: 'The recovery probe root must be an absolute, non-root application-data path.',
    };
  }
  return Object.freeze({
    kind: 'probe' as const,
    contract: contract.value,
    mode: writeCount === 1 ? ('write' as const) : ('verify' as const),
    root,
  });
};

/** Resolves symlinks and confines the packaged writer to a newly created OS-temp directory. */
export const authorizeRecoveryProbeRoot = (
  rootInput: unknown,
  temporaryRootInput: unknown,
  rootNamePrefixInput: unknown,
  requireEmpty: boolean,
): string | undefined => {
  if (
    !isValidApplicationDataRoot(rootInput) ||
    !isValidApplicationDataRoot(temporaryRootInput) ||
    !isRootNamePrefix(rootNamePrefixInput) ||
    typeof requireEmpty !== 'boolean'
  ) {
    return undefined;
  }
  try {
    const root = realpathSync.native(rootInput);
    const temporaryRoot = realpathSync.native(temporaryRootInput);
    const relative = path.relative(temporaryRoot, root);
    const isInsideTemporaryRoot =
      relative.length > 0 &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative);
    if (
      !isInsideTemporaryRoot ||
      !path.basename(root).startsWith(rootNamePrefixInput) ||
      !statSync(root).isDirectory() ||
      (requireEmpty && readdirSync(root).length !== 0)
    ) {
      return undefined;
    }
    return root;
  } catch {
    return undefined;
  }
};
