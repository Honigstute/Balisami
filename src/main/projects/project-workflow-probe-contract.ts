import path from 'node:path';

import { isValidRecoveryProbeFileName } from '../recovery/recovery-probe-contract';

export interface ProjectWorkflowProbeContract {
  readonly argument: string;
  readonly marker: string;
  readonly note: string;
  readonly processTimeoutMs: number;
  readonly queryKey: string;
  readonly queryValue: string;
  readonly readyAttribute: string;
  readonly rootArgument: string;
  readonly rootNamePrefix: string;
  readonly screenshotMarker: string;
  readonly terminationTimeoutMs: number;
  readonly userFileName: string;
}

export type ProjectWorkflowProbeInvocation =
  | { readonly kind: 'none' }
  | { readonly kind: 'invalid'; readonly message: string }
  | {
      readonly kind: 'probe';
      readonly contract: ProjectWorkflowProbeContract;
      readonly root: string;
    };

const isSafeArgument = (value: unknown): value is string =>
  typeof value === 'string' && /^--[a-z0-9-]{1,80}$/u.test(value);

const isSafeMarker = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Z0-9_]{1,100}$/u.test(value);

const isSafeQueryPart = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9-]{1,80}$/u.test(value);

const parseContract = (input: unknown): ProjectWorkflowProbeContract | undefined => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return undefined;
  }
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).length !== 12 ||
    !isSafeArgument(value.argument) ||
    !isSafeMarker(value.marker) ||
    typeof value.note !== 'string' ||
    value.note.length < 1 ||
    value.note.length > 500 ||
    !Number.isSafeInteger(value.processTimeoutMs) ||
    (value.processTimeoutMs as number) < 1_000 ||
    (value.processTimeoutMs as number) > 120_000 ||
    !isSafeQueryPart(value.queryKey) ||
    !isSafeQueryPart(value.queryValue) ||
    typeof value.readyAttribute !== 'string' ||
    !/^data-[a-z0-9-]{1,100}$/u.test(value.readyAttribute) ||
    !isSafeArgument(value.rootArgument) ||
    typeof value.rootNamePrefix !== 'string' ||
    !/^balsamic-packaged-[a-z0-9-]{1,80}-$/u.test(value.rootNamePrefix) ||
    typeof value.screenshotMarker !== 'string' ||
    !/^[A-Z0-9_]{1,100}=$/u.test(value.screenshotMarker) ||
    !Number.isSafeInteger(value.terminationTimeoutMs) ||
    (value.terminationTimeoutMs as number) < 1_000 ||
    (value.terminationTimeoutMs as number) > 30_000 ||
    !isValidRecoveryProbeFileName(value.userFileName)
  ) {
    return undefined;
  }
  return Object.freeze(value as unknown as ProjectWorkflowProbeContract);
};

export const parseProjectWorkflowProbeInvocation = (
  arguments_: readonly string[],
  contractInput: unknown,
): ProjectWorkflowProbeInvocation => {
  const contract = parseContract(contractInput);
  if (contract === undefined) {
    return { kind: 'invalid', message: 'The packaged project-workflow contract is invalid.' };
  }
  const enabled = arguments_.filter((argument) => argument === contract.argument).length;
  const rootValues = arguments_
    .filter((argument) => argument.startsWith(`${contract.rootArgument}=`))
    .map((argument) => argument.slice(contract.rootArgument.length + 1));
  if (enabled === 0 && rootValues.length === 0) {
    return { kind: 'none' };
  }
  if (
    enabled !== 1 ||
    rootValues.length !== 1 ||
    rootValues[0] === undefined ||
    !path.isAbsolute(rootValues[0]) ||
    path.parse(rootValues[0]).root === path.resolve(rootValues[0])
  ) {
    return { kind: 'invalid', message: 'The packaged project-workflow arguments are invalid.' };
  }
  return Object.freeze({ kind: 'probe', contract, root: path.resolve(rootValues[0]) });
};
