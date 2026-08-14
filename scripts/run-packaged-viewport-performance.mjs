import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { findPackagedExecutable } from './find-packaged-executable.mjs';

const packageRoot = path.resolve(process.cwd(), 'out');
const contract = JSON.parse(
  await readFile(new URL('../viewport-performance-contract.json', import.meta.url), 'utf8'),
);

if (
  typeof contract.argument !== 'string' ||
  !contract.argument.startsWith('--') ||
  typeof contract.durationMs !== 'number' ||
  contract.durationMs < 10_000 ||
  typeof contract.maximumFrameWorkMs !== 'number' ||
  contract.maximumFrameWorkMs <= 0 ||
  typeof contract.maximumFrameWorkP95Ms !== 'number' ||
  contract.maximumFrameWorkP95Ms <= 0 ||
  typeof contract.maximumInputLatencyP95Ms !== 'number' ||
  contract.maximumInputLatencyP95Ms <= 0 ||
  typeof contract.minimumFrameSamples !== 'number' ||
  !Number.isInteger(contract.minimumFrameSamples) ||
  contract.minimumFrameSamples <= 0 ||
  typeof contract.processTimeoutMs !== 'number' ||
  contract.processTimeoutMs <= contract.durationMs ||
  typeof contract.resultMarker !== 'string' ||
  contract.resultMarker.length === 0
) {
  throw new Error('Viewport-performance contract is malformed.');
}

const executable = await findPackagedExecutable(packageRoot, process.platform);
if (executable === null) {
  throw new Error(`No packaged Balsamic executable was found under ${packageRoot}.`);
}

const child = spawn(executable, [contract.argument], { stdio: ['ignore', 'pipe', 'pipe'] });
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
    reject(new Error('Packaged viewport performance probe timed out.'));
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
    `Packaged viewport performance probe failed (exit ${String(exitCode)}).\nstdout:\n${standardOutput}\nstderr:\n${standardError}`,
  );
}

const serializedResult = resultLine.slice(contract.resultMarker.length);
const result = JSON.parse(serializedResult);
if (
  typeof result !== 'object' ||
  result === null ||
  typeof result.frameSampleCount !== 'number' ||
  typeof result.frameWorkP95Ms !== 'number' ||
  typeof result.inputLatencyP95Ms !== 'number'
) {
  throw new Error('Packaged viewport performance probe returned malformed metrics.');
}

const resultDirectory = path.join(packageRoot, 'performance');
const resultPath = path.join(
  resultDirectory,
  `${process.platform}-${process.arch}-viewport-performance.json`,
);
await mkdir(resultDirectory, { recursive: true });
await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
process.stdout.write(
  `Packaged viewport performance passed: ${executable}\nResult: ${resultPath}\np95 frame work: ${String(result.frameWorkP95Ms)} ms\np95 input latency: ${String(result.inputLatencyP95Ms)} ms\n`,
);
