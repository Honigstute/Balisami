import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { findPackagedExecutable } from './find-packaged-executable.mjs';

const packageRoot = path.resolve(process.cwd(), 'out');
const contract = JSON.parse(
  await readFile(new URL('../recovery-probe-contract.json', import.meta.url), 'utf8'),
);

const isPositiveBoundedInteger = (value) =>
  Number.isSafeInteger(value) && value > 0 && value <= 120_000;
const isArgument = (value) => typeof value === 'string' && /^--[a-z0-9-]+$/u.test(value);
const isArgumentPrefix = (value) => typeof value === 'string' && /^--[a-z0-9-]+=$/u.test(value);
const isRootNamePrefix = (value) =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9-]{1,59}-$/u.test(value);
const isMarker = (value) => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,119}$/u.test(value);
const isFileName = (value) =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,119}$/u.test(value);

if (
  typeof contract !== 'object' ||
  contract === null ||
  !isPositiveBoundedInteger(contract.processTimeoutMs) ||
  !isPositiveBoundedInteger(contract.terminationTimeoutMs) ||
  typeof contract.rendererQueryKey !== 'string' ||
  !/^[a-z][a-z0-9-]{0,59}$/u.test(contract.rendererQueryKey) ||
  typeof contract.rendererQueryValue !== 'string' ||
  !/^[a-z][a-z0-9-]{0,59}$/u.test(contract.rendererQueryValue) ||
  typeof contract.rendererStateAttribute !== 'string' ||
  !/^data-[a-z][a-z0-9-]{0,79}$/u.test(contract.rendererStateAttribute) ||
  !isArgumentPrefix(contract.rootArgumentPrefix) ||
  !isRootNamePrefix(contract.rootNamePrefix) ||
  !isFileName(contract.userFileName) ||
  !isMarker(contract.verificationMarker) ||
  !isArgument(contract.verifyArgument) ||
  !isMarker(contract.writerReadyMarker) ||
  !isArgument(contract.writeArgument) ||
  contract.verifyArgument === contract.writeArgument ||
  contract.verificationMarker === contract.writerReadyMarker
) {
  throw new Error('Packaged recovery-probe contract is malformed.');
}

const executable = await findPackagedExecutable(packageRoot, process.platform);
if (executable === null) {
  throw new Error(`No packaged Balsamic executable was found under ${packageRoot}.`);
}

const hasOutputLine = (output, expected) =>
  output.split(/\r?\n/u).some((line) => line === expected);

const createRunningProbe = (argument, probeRoot) => {
  const child = spawn(executable, [argument, `${contract.rootArgumentPrefix}${probeRoot}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let standardOutput = '';
  let standardError = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    standardOutput += chunk;
  });
  child.stderr.on('data', (chunk) => {
    standardError += chunk;
  });
  return {
    child,
    getStandardError: () => standardError,
    getStandardOutput: () => standardOutput,
  };
};

const waitForMarker = (running, marker) =>
  new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        callback();
      }
    };
    const timeout = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            `Packaged recovery writer did not report durable state within ${String(contract.processTimeoutMs)} ms.`,
          ),
        ),
      );
    }, contract.processTimeoutMs);
    running.child.stdout.on('data', () => {
      if (hasOutputLine(running.getStandardOutput(), marker)) {
        finish(resolve);
      }
    });
    running.child.once('error', (error) => finish(() => reject(error)));
    running.child.once('exit', (code, signal) => {
      finish(() =>
        reject(
          new Error(
            `Packaged recovery writer exited before forced termination (code ${String(code)}, signal ${String(signal)}).`,
          ),
        ),
      );
    });
  });

const waitForExit = (running, timeoutMs, description) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      running.child.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
      reject(new Error(`${description} did not exit within ${String(timeoutMs)} ms.`));
    }, timeoutMs);
    running.child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    running.child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });

const forceStopProbe = async (running) => {
  if (running.child.exitCode !== null || running.child.signalCode !== null) {
    return;
  }
  const exit = waitForExit(running, contract.terminationTimeoutMs, 'Packaged recovery process');
  running.child.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
  await exit.catch(() => undefined);
};

const terminateWriter = async (running) => {
  if (running.child.exitCode !== null || running.child.signalCode !== null) {
    throw new Error('Packaged recovery writer exited before the harness could kill it.');
  }
  const exit = waitForExit(running, contract.terminationTimeoutMs, 'Packaged recovery writer');
  const killed = running.child.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
  if (!killed) {
    throw new Error('Packaged recovery writer rejected forced termination.');
  }
  const terminated = await exit;
  if (terminated.code === 0 && terminated.signal === null) {
    throw new Error('Packaged recovery writer shut down cleanly instead of being killed.');
  }
};

const runVerifier = async (probeRoot) => {
  const running = createRunningProbe(contract.verifyArgument, probeRoot);
  try {
    const exited = await waitForExit(
      running,
      contract.processTimeoutMs,
      'Packaged recovery verifier',
    );
    if (
      exited.code !== 0 ||
      !hasOutputLine(running.getStandardOutput(), contract.verificationMarker) ||
      running.getStandardError().trim().length > 0
    ) {
      throw new Error(
        `Packaged recovery verification failed (code ${String(exited.code)}, signal ${String(exited.signal)}).\nstdout:\n${running.getStandardOutput()}\nstderr:\n${running.getStandardError()}`,
      );
    }
  } finally {
    await forceStopProbe(running);
  }
};

const probeRoot = await mkdtemp(path.join(tmpdir(), contract.rootNamePrefix));
const userFilePath = path.join(probeRoot, contract.userFileName);
let writer;
try {
  writer = createRunningProbe(contract.writeArgument, probeRoot);
  await waitForMarker(writer, contract.writerReadyMarker);
  if (writer.getStandardError().trim().length > 0) {
    throw new Error(`Packaged recovery writer emitted stderr:\n${writer.getStandardError()}`);
  }

  const userFileDetails = await stat(userFilePath);
  if (!userFileDetails.isFile() || userFileDetails.size === 0) {
    throw new Error('Packaged recovery writer did not create a non-empty prior user file.');
  }
  const priorUserFileBytes = await readFile(userFilePath);
  await terminateWriter(writer);
  await runVerifier(probeRoot);

  const userFileBytesAfterRecovery = await readFile(userFilePath);
  if (!priorUserFileBytes.equals(userFileBytesAfterRecovery)) {
    throw new Error('Crash recovery changed the prior user-file bytes.');
  }

  process.stdout.write(
    `Packaged forced-crash ordinary-launch recovery passed: ${executable}\nPrior user file preserved byte-for-byte (${String(priorUserFileBytes.byteLength)} bytes).\n`,
  );
} finally {
  if (writer !== undefined) {
    await forceStopProbe(writer);
  }
  await rm(probeRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
