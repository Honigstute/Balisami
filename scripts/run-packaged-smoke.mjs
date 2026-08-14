import { copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

import { findPackagedExecutable } from './find-packaged-executable.mjs';

const packageRoot = path.resolve(process.cwd(), 'out');
const contract = JSON.parse(
  await readFile(new URL('../smoke-test-contract.json', import.meta.url), 'utf8'),
);

if (
  typeof contract.argument !== 'string' ||
  typeof contract.marker !== 'string' ||
  typeof contract.screenshotMarker !== 'string' ||
  typeof contract.processTimeoutMs !== 'number' ||
  !Number.isFinite(contract.processTimeoutMs) ||
  contract.processTimeoutMs <= 0
) {
  throw new Error('Smoke-test contract is malformed.');
}

const executable = await findPackagedExecutable(packageRoot, process.platform);
if (executable === null) {
  throw new Error(`No packaged Balsamic executable was found under ${packageRoot}.`);
}

const child = spawn(executable, [contract.argument], {
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

const exitCode = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    child.kill();
    reject(
      new Error(
        `The packaged application did not finish its smoke test within ${String(contract.processTimeoutMs)} ms.`,
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

if (
  exitCode !== 0 ||
  !standardOutput.includes(contract.marker) ||
  standardError.trim().length > 0
) {
  throw new Error(
    `Packaged smoke test failed (exit ${String(exitCode)}).\nstdout:\n${standardOutput}\nstderr:\n${standardError}`,
  );
}

const screenshotLine = standardOutput
  .split(/\r?\n/u)
  .find((line) => line.startsWith(contract.screenshotMarker));
if (screenshotLine === undefined) {
  throw new Error('Packaged application did not report a smoke screenshot.');
}

const temporaryScreenshotPath = screenshotLine.slice(contract.screenshotMarker.length);
if (!path.isAbsolute(temporaryScreenshotPath)) {
  throw new Error('Packaged application reported a non-absolute smoke screenshot path.');
}

const screenshotDetails = await stat(temporaryScreenshotPath);
if (!screenshotDetails.isFile() || screenshotDetails.size === 0) {
  throw new Error('Packaged application reported an empty smoke screenshot.');
}

const screenshotDirectory = path.join(packageRoot, 'smoke');
const screenshotPath = path.join(screenshotDirectory, `${process.platform}-${process.arch}.png`);
await mkdir(screenshotDirectory, { recursive: true });
await copyFile(temporaryScreenshotPath, screenshotPath);
await rm(temporaryScreenshotPath, { force: true });

process.stdout.write(
  `Packaged application smoke test passed: ${executable}\nScreenshot: ${screenshotPath}\n`,
);
