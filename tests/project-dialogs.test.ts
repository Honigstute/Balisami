import { describe, expect, it } from 'vitest';

import { createSuggestedProjectFileName } from '../src/main/dialogs/project-dialogs';
import {
  createOpenProjectDialogOptions,
  createSaveProjectDialogOptions,
  createUnsavedCloseDialogOptions,
} from '../src/main/dialogs/electron-project-dialogs';
import { createProjectFileName, PROJECT_FILE_IDENTITY } from '../src/shared/project-file-identity';

describe('native project dialog contracts', () => {
  it('keeps one public project-file identity for native integrations', () => {
    expect(PROJECT_FILE_IDENTITY).toEqual({
      displayName: 'Balsamic Project',
      extension: 'balsamic',
      mimeType: 'application/vnd.balsamic.project+zip',
      uniformTypeIdentifier: 'app.balsamic.project',
    });
    expect(createProjectFileName('Checkout')).toBe('Checkout.balsamic');
  });

  it('creates safe cross-platform filename suggestions before applying the public extension', () => {
    expect(createSuggestedProjectFileName('  Customer: Portal / Draft*  ')).toBe(
      'Customer Portal Draft',
    );
    expect(createSuggestedProjectFileName('CON')).toBe('Untitled Wireframe');
    expect(createSuggestedProjectFileName('...')).toBe('Untitled Wireframe');
    expect(createSuggestedProjectFileName('')).toBe('Untitled Wireframe');
    expect(createSuggestedProjectFileName('x'.repeat(150))).toHaveLength(100);
  });

  it('uses single-file dialogs and keeps recent-file ownership inside the app', () => {
    expect(createOpenProjectDialogOptions()).toEqual({
      title: 'Open Wireframe Project',
      buttonLabel: 'Open',
      filters: [{ name: 'Balsamic Project', extensions: ['balsamic'] }],
      properties: ['openFile', 'dontAddToRecent'],
    });
    expect(createSaveProjectDialogOptions('Project Name')).toEqual({
      title: 'Save Wireframe Project',
      buttonLabel: 'Save',
      defaultPath: 'Project Name.balsamic',
      filters: [{ name: 'Balsamic Project', extensions: ['balsamic'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation', 'dontAddToRecent'],
    });
  });

  it('keeps save, cancel, and discard as explicit unsaved-close choices', () => {
    expect(createUnsavedCloseDialogOptions('Checkout Flow')).toMatchObject({
      type: 'warning',
      buttons: ['Save', 'Cancel', "Don't Save"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
  });
});
