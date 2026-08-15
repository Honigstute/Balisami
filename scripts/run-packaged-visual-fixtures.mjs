import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { findPackagedExecutable } from './find-packaged-executable.mjs';

const packageRoot = path.resolve(process.cwd(), 'out');
const contract = JSON.parse(
  await readFile(new URL('../visual-fixture-contract.json', import.meta.url), 'utf8'),
);

if (
  typeof contract.argumentPrefix !== 'string' ||
  typeof contract.displayScaleArgumentPrefix !== 'string' ||
  !contract.displayScaleArgumentPrefix.startsWith('--') ||
  !Array.isArray(contract.displayScales) ||
  contract.displayScales.length < 2 ||
  !contract.displayScales.every(
    (scale) =>
      typeof scale === 'number' &&
      Number.isFinite(scale) &&
      scale >= 1 &&
      scale <= 2 &&
      Number.isInteger(scale * 100),
  ) ||
  new Set(contract.displayScales).size !== contract.displayScales.length ||
  contract.displayScales[0] !== 1 ||
  contract.displayScales.at(-1) !== 2 ||
  !Array.isArray(contract.fixtures) ||
  contract.fixtures.length === 0 ||
  !contract.fixtures.every((fixture) => typeof fixture === 'string' && fixture.length > 0) ||
  new Set(contract.fixtures).size !== contract.fixtures.length ||
  typeof contract.marker !== 'string' ||
  typeof contract.screenshotMarker !== 'string' ||
  typeof contract.processTimeoutMs !== 'number' ||
  !Number.isFinite(contract.processTimeoutMs) ||
  contract.processTimeoutMs <= 0
) {
  throw new Error('Visual-fixture contract is malformed.');
}

const executable = await findPackagedExecutable(packageRoot, process.platform);
if (executable === null) {
  throw new Error(`No packaged Balsamic executable was found under ${packageRoot}.`);
}

const visualDirectory = path.join(packageRoot, 'visual');
await rm(visualDirectory, { force: true, recursive: true });
await mkdir(visualDirectory, { recursive: true });
const profileRoot = await mkdtemp(path.join(tmpdir(), 'balsamic-visual-profile-'));

const runFixture = async (fixture, artifactSuffix = '', additionalArguments = []) => {
  const profileDirectory = path.join(
    profileRoot,
    `${fixture}${artifactSuffix.length === 0 ? '-scale-100' : artifactSuffix}`,
  );
  await mkdir(profileDirectory, { recursive: true });
  const child = spawn(
    executable,
    [
      `${contract.argumentPrefix}${fixture}`,
      ...additionalArguments,
      `--user-data-dir=${profileDirectory}`,
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
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
          `Visual fixture ${fixture} did not finish within ${String(contract.processTimeoutMs)} ms.`,
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
    !standardOutput.includes(`${contract.marker}:${fixture}`) ||
    standardError.trim().length > 0
  ) {
    throw new Error(
      `Visual fixture ${fixture} failed (exit ${String(exitCode)}).\nstdout:\n${standardOutput}\nstderr:\n${standardError}`,
    );
  }
  const screenshotLine = standardOutput
    .split(/\r?\n/u)
    .find((line) => line.startsWith(contract.screenshotMarker));
  if (screenshotLine === undefined) {
    throw new Error(`Visual fixture ${fixture} did not report a screenshot.`);
  }
  const temporaryScreenshotPath = screenshotLine.slice(contract.screenshotMarker.length);
  if (!path.isAbsolute(temporaryScreenshotPath)) {
    throw new Error(`Visual fixture ${fixture} reported a non-absolute screenshot path.`);
  }
  const screenshotDetails = await stat(temporaryScreenshotPath);
  if (!screenshotDetails.isFile() || screenshotDetails.size === 0) {
    throw new Error(`Visual fixture ${fixture} reported an empty screenshot.`);
  }
  const screenshotPath = path.join(
    visualDirectory,
    `${process.platform}-${process.arch}-${fixture}${artifactSuffix}.png`,
  );
  await copyFile(temporaryScreenshotPath, screenshotPath);
  await rm(temporaryScreenshotPath, { force: true });
  return screenshotPath;
};

const screenshots = [];
try {
  for (const fixture of contract.fixtures) {
    const additionalArguments =
      fixture === 'default'
        ? [`${contract.displayScaleArgumentPrefix}${String(contract.displayScales[0])}`]
        : [];
    screenshots.push(await runFixture(fixture, '', additionalArguments));
  }
  for (const scale of contract.displayScales.slice(1)) {
    screenshots.push(
      await runFixture('default', `-scale-${String(Math.round(scale * 100))}`, [
        `${contract.displayScaleArgumentPrefix}${String(scale)}`,
      ]),
    );
  }
} finally {
  await rm(profileRoot, { force: true, recursive: true });
}

process.stdout.write(
  `Packaged visual fixture matrix passed: ${executable}\n${screenshots.map((screenshot) => `Screenshot: ${screenshot}`).join('\n')}\n`,
);
