import path from 'node:path';

import { dialog } from 'electron';

import type {
  DesktopExportFileRequest,
  DesktopExportFileResult,
  DesktopExportFormat,
} from '../shared/desktop-api';
import { MAX_PROJECT_ASSET_BYTES } from '../shared/project-file-limits';
import { createSuggestedProjectFileName } from './dialogs/project-dialogs';
import { writeBoundedFileAtomically } from './files/project-file-storage';

const EXPORT_FORMATS: Readonly<
  Record<DesktopExportFormat, Readonly<{ extension: string; label: string }>>
> = Object.freeze({
  pdf: Object.freeze({ extension: 'pdf', label: 'PDF Document' }),
  png: Object.freeze({ extension: 'png', label: 'PNG Image' }),
  svg: Object.freeze({ extension: 'svg', label: 'SVG Image' }),
});

const failed = (message: string): DesktopExportFileResult => ({
  problem: {
    code: 'save-failed',
    message,
    title: 'The export could not be saved',
  },
  status: 'failed',
});

export const saveDesktopExportFile = async (
  request: DesktopExportFileRequest,
): Promise<DesktopExportFileResult> => {
  const format = EXPORT_FORMATS[request.format];
  const suggestedFileName = `${createSuggestedProjectFileName(request.suggestedBaseName)}.${format.extension}`;
  const selected = await dialog.showSaveDialog({
    buttonLabel: 'Export',
    defaultPath: suggestedFileName,
    filters: [{ extensions: [format.extension], name: format.label }],
    properties: ['createDirectory', 'showOverwriteConfirmation', 'dontAddToRecent'],
    title: `Export ${format.label}`,
  });
  if (selected.canceled) return { status: 'cancelled' };
  if (selected.filePath === undefined) {
    return failed('No valid export destination was returned. Choose a file and retry.');
  }
  const result = await writeBoundedFileAtomically(
    selected.filePath,
    request.bytes,
    MAX_PROJECT_ASSET_BYTES,
  );
  if (!result.ok) {
    return failed('No export file was changed. Choose another destination and retry.');
  }
  return {
    status: 'completed',
    value: { displayName: path.basename(selected.filePath) },
    warnings: [],
  };
};
