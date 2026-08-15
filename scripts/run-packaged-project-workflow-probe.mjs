import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { findPackagedExecutable } from './find-packaged-executable.mjs';

const packageRoot = path.resolve(process.cwd(), 'out');
const contract = JSON.parse(
  await readFile(new URL('../project-workflow-probe-contract.json', import.meta.url), 'utf8'),
);

const isBoundedInteger = (value) =>
  Number.isSafeInteger(value) && value >= 1_000 && value <= 120_000;
const isArgument = (value) => typeof value === 'string' && /^--[a-z0-9-]{1,80}$/u.test(value);
const isMarker = (value) => typeof value === 'string' && /^[A-Z0-9_]{1,100}$/u.test(value);
const isFileName = (value) =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,119}$/u.test(value);
const isRootPrefix = (value) =>
  typeof value === 'string' && /^balsamic-packaged-[a-z0-9-]{1,80}-$/u.test(value);

if (
  typeof contract !== 'object' ||
  contract === null ||
  !isArgument(contract.argument) ||
  !isMarker(contract.marker) ||
  typeof contract.note !== 'string' ||
  contract.note.length < 1 ||
  contract.note.length > 500 ||
  !isBoundedInteger(contract.processTimeoutMs) ||
  typeof contract.queryKey !== 'string' ||
  typeof contract.queryValue !== 'string' ||
  typeof contract.readyAttribute !== 'string' ||
  !/^data-[a-z0-9-]{1,100}$/u.test(contract.readyAttribute) ||
  !isArgument(contract.rootArgument) ||
  !isRootPrefix(contract.rootNamePrefix) ||
  typeof contract.screenshotMarker !== 'string' ||
  !/^[A-Z0-9_]{1,100}=$/u.test(contract.screenshotMarker) ||
  !isBoundedInteger(contract.terminationTimeoutMs) ||
  !isFileName(contract.userFileName)
) {
  throw new Error('Packaged project-workflow contract is malformed.');
}

const executable = await findPackagedExecutable(packageRoot, process.platform);
if (executable === null) {
  throw new Error(`No packaged Balsamic executable was found under ${packageRoot}.`);
}

const probeRoot = await mkdtemp(path.join(tmpdir(), contract.rootNamePrefix));
const child = spawn(executable, [contract.argument, `${contract.rootArgument}=${probeRoot}`], {
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

const waitForTermination = () =>
  new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const timeout = setTimeout(resolve, contract.terminationTimeoutMs);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.once('error', () => {
      clearTimeout(timeout);
      resolve();
    });
  });

try {
  const exitCode = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
      reject(
        new Error(
          `The packaged project workflow did not finish within ${String(contract.processTimeoutMs)} ms.`,
        ),
      );
    }, contract.processTimeoutMs);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });

  const markerPresent = standardOutput.split(/\r?\n/u).some((line) => line === contract.marker);
  if (exitCode !== 0 || !markerPresent || standardError.trim().length > 0) {
    throw new Error(
      `Packaged project workflow failed (exit ${String(exitCode)}).\nstdout:\n${standardOutput}\nstderr:\n${standardError}`,
    );
  }
  const userFilePath = path.join(probeRoot, contract.userFileName);
  const userFile = await stat(userFilePath);
  if (!userFile.isFile() || userFile.size === 0) {
    throw new Error('The packaged project workflow did not leave a non-empty user project.');
  }
  const screenshotLine = standardOutput
    .split(/\r?\n/u)
    .find((line) => line.startsWith(contract.screenshotMarker));
  if (screenshotLine === undefined) {
    throw new Error('The packaged project workflow did not report its alpha screenshot.');
  }
  // macOS may expose the same temporary directory through `/var` to the
  // parent and `/private/var` to Electron. Authorize canonical filesystem
  // paths so that alias cannot look like an escape from the isolated root.
  const screenshotPath = await realpath(
    path.resolve(screenshotLine.slice(contract.screenshotMarker.length)),
  );
  const canonicalProbeRoot = await realpath(probeRoot);
  const relativeScreenshotPath = path.relative(canonicalProbeRoot, screenshotPath);
  if (
    relativeScreenshotPath.length === 0 ||
    relativeScreenshotPath.startsWith('..') ||
    path.isAbsolute(relativeScreenshotPath)
  ) {
    throw new Error('The packaged project workflow reported an unauthorized screenshot path.');
  }
  const screenshotFile = await stat(screenshotPath);
  if (!screenshotFile.isFile() || screenshotFile.size === 0) {
    throw new Error('The packaged project workflow alpha screenshot is empty.');
  }
  const artifactDirectory = path.join(packageRoot, 'alpha');
  const artifactPath = path.join(artifactDirectory, `${process.platform}-${process.arch}.png`);
  await mkdir(artifactDirectory, { recursive: true });
  await copyFile(screenshotPath, artifactPath);
  process.stdout.write(
    `Packaged alpha create/edit/undo/redo/save/close/reopen workflow passed: ${executable}\nSaved project: ${String(userFile.size)} bytes.\nScreenshot: ${artifactPath}\n`,
  );
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
    await waitForTermination();
  }
  await rm(probeRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
