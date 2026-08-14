import {
  dialog,
  type BrowserWindow,
  type MessageBoxOptions,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron';

import type {
  NativeProjectDialogs,
  NativeProjectPathDialogResult,
  UnsavedCloseDialogResult,
} from './project-dialogs';
import { isValidAbsoluteNonRootPath } from '../files/path-validation';

const CLOSE_BUTTON_INDEX = Object.freeze({ save: 0, cancel: 1, discard: 2 });

export const createOpenProjectDialogOptions = (): OpenDialogOptions => ({
  title: 'Open Wireframe Project',
  buttonLabel: 'Open',
  properties: ['openFile', 'dontAddToRecent'],
});

export const createSaveProjectDialogOptions = (suggestedFileName: string): SaveDialogOptions => ({
  title: 'Save Wireframe Project',
  buttonLabel: 'Save',
  defaultPath: suggestedFileName,
  properties: ['createDirectory', 'showOverwriteConfirmation', 'dontAddToRecent'],
});

export const createUnsavedCloseDialogOptions = (projectDisplayName: string): MessageBoxOptions => ({
  type: 'warning',
  title: 'Unsaved Changes',
  message: `Save changes to “${projectDisplayName}” before closing?`,
  detail: 'Unsaved changes will be lost if you close without saving.',
  buttons: ['Save', 'Cancel', "Don't Save"],
  defaultId: CLOSE_BUTTON_INDEX.save,
  cancelId: CLOSE_BUTTON_INDEX.cancel,
  noLink: true,
});

const mapOpenResult = (
  canceled: boolean,
  filePaths: readonly string[],
): NativeProjectPathDialogResult => {
  if (canceled) {
    return { status: 'cancelled' };
  }
  return filePaths.length === 1 && isValidAbsoluteNonRootPath(filePaths[0])
    ? { status: 'selected', filePath: filePaths[0] }
    : { status: 'invalid-response' };
};

const mapSaveResult = (
  canceled: boolean,
  filePath: string | undefined,
): NativeProjectPathDialogResult => {
  if (canceled) {
    return { status: 'cancelled' };
  }
  return isValidAbsoluteNonRootPath(filePath)
    ? { status: 'selected', filePath }
    : { status: 'invalid-response' };
};

const mapCloseResult = (response: number): UnsavedCloseDialogResult => {
  if (response === CLOSE_BUTTON_INDEX.save) {
    return { status: 'selected', choice: 'save' };
  }
  if (response === CLOSE_BUTTON_INDEX.cancel) {
    return { status: 'selected', choice: 'cancel' };
  }
  if (response === CLOSE_BUTTON_INDEX.discard) {
    return { status: 'selected', choice: 'discard' };
  }
  return { status: 'invalid-response' };
};

export const createElectronProjectDialogs = (owner: BrowserWindow): NativeProjectDialogs =>
  Object.freeze({
    async chooseOpenProject() {
      const result = await dialog.showOpenDialog(owner, createOpenProjectDialogOptions());
      return mapOpenResult(result.canceled, result.filePaths);
    },
    async chooseSaveProject(suggestedFileName: string) {
      const result = await dialog.showSaveDialog(
        owner,
        createSaveProjectDialogOptions(suggestedFileName),
      );
      return mapSaveResult(result.canceled, result.filePath);
    },
    async chooseUnsavedClose(projectDisplayName: string) {
      const result = await dialog.showMessageBox(
        owner,
        createUnsavedCloseDialogOptions(projectDisplayName),
      );
      return mapCloseResult(result.response);
    },
  });
