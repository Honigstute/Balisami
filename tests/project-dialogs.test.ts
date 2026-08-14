import { describe, expect, it } from 'vitest';

import { createSuggestedProjectFileName } from '../src/main/dialogs/project-dialogs';
import {
  createOpenProjectDialogOptions,
  createSaveProjectDialogOptions,
  createUnsavedCloseDialogOptions,
} from '../src/main/dialogs/electron-project-dialogs';

describe('native project dialog contracts', () => {
  it('creates safe cross-platform filename suggestions without deciding an extension', () => {
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
      properties: ['openFile', 'dontAddToRecent'],
    });
    expect(createSaveProjectDialogOptions('Project Name')).toEqual({
      title: 'Save Wireframe Project',
      buttonLabel: 'Save',
      defaultPath: 'Project Name',
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
