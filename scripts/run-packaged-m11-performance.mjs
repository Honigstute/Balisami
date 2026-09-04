import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { findPackagedExecutable } from './find-packaged-executable.mjs';

const packageRoot = path.resolve(process.cwd(), 'out');
const contract = JSON.parse(
  await readFile(new URL('../m11-performance-contract.json', import.meta.url), 'utf8'),
);

if (
  typeof contract.argument !== 'string' ||
  !contract.argument.startsWith('--') ||
  typeof contract.maximumOpenMs !== 'number' ||
  contract.maximumOpenMs <= 0 ||
  typeof contract.maximumRenderMs !== 'number' ||
  contract.maximumRenderMs <= 0 ||
  typeof contract.maximumSaveMs !== 'number' ||
  contract.maximumSaveMs <= 0 ||
  typeof contract.minimumAssetArchiveBytes !== 'number' ||
  contract.minimumAssetArchiveBytes < 5_000_000 ||
  typeof contract.expectedAssetRenderedElements !== 'number' ||
  contract.expectedAssetRenderedElements <= 0 ||
  typeof contract.expectedComponentRenderedElements !== 'number' ||
  contract.expectedComponentRenderedElements <= 0 ||
  typeof contract.processTimeoutMs !== 'number' ||
  contract.processTimeoutMs <= contract.maximumOpenMs + contract.maximumSaveMs ||
  typeof contract.resultMarker !== 'string' ||
  contract.resultMarker.length === 0
) {
  throw new Error('M11 performance contract is malformed.');
}

const executable = await findPackagedExecutable(packageRoot, process.platform);
if (executable === null) {
  throw new Error(`No packaged Balsamic executable was found under ${packageRoot}.`);
}

const profileDirectory = await mkdtemp(path.join(tmpdir(), 'balsamic-m11-profile-'));
let result;
try {
  const child = spawn(executable, [contract.argument, `--user-data-dir=${profileDirectory}`], {
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
      reject(new Error('Packaged M11 performance probe timed out.'));
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

  const resultLine = standardOutput
    .split(/\r?\n/u)
    .find((line) => line.startsWith(contract.resultMarker));
  if (exitCode !== 0 || standardError.trim().length > 0 || resultLine === undefined) {
    throw new Error(
      `Packaged M11 performance probe failed (exit ${String(exitCode)}).\nstdout:\n${standardOutput}\nstderr:\n${standardError}`,
    );
  }
  result = JSON.parse(resultLine.slice(contract.resultMarker.length));
} finally {
  await rm(profileDirectory, { force: true, recursive: true });
}

const resultDirectory = path.join(packageRoot, 'performance');
const resultPath = path.join(
  resultDirectory,
  `${process.platform}-${process.arch}-m11-performance.json`,
);
await mkdir(resultDirectory, { recursive: true });
await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
process.stdout.write(
  [
    `Packaged M11 performance passed: ${executable}`,
    `Result: ${resultPath}`,
    `Asset-heavy: save ${String(result.assetHeavy.saveMs)} ms, open ${String(result.assetHeavy.openMs)} ms, render ${String(result.assetHeavy.renderMs)} ms`,
    `Component-heavy: save ${String(result.componentHeavy.saveMs)} ms, open ${String(result.componentHeavy.openMs)} ms, render ${String(result.componentHeavy.renderMs)} ms`,
    '',
  ].join('\n'),
);
