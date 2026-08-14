import type { BrowserWindow } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const captureSmokeScreenshot = async (
  window: BrowserWindow,
  temporaryDirectory: string,
): Promise<string> => {
  const screenshot = await window.webContents.capturePage();
  if (screenshot.isEmpty()) {
    throw new Error('Packaged smoke screenshot was empty.');
  }

  const screenshotDirectory = path.join(temporaryDirectory, 'balsamic-smoke');
  const screenshotPath = path.join(screenshotDirectory, `renderer-${String(process.pid)}.png`);
  await mkdir(screenshotDirectory, { recursive: true });
  await writeFile(screenshotPath, screenshot.toPNG());
  return screenshotPath;
};
