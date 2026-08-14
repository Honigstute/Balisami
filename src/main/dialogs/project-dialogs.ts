export type NativeProjectPathDialogResult =
  | { readonly status: 'selected'; readonly filePath: string }
  | { readonly status: 'cancelled' }
  | { readonly status: 'invalid-response' };

export type UnsavedCloseChoice = 'cancel' | 'discard' | 'save';

export type UnsavedCloseDialogResult =
  | { readonly status: 'selected'; readonly choice: UnsavedCloseChoice }
  | { readonly status: 'invalid-response' };

export interface NativeProjectDialogs {
  readonly chooseOpenProject: () => Promise<NativeProjectPathDialogResult>;
  readonly chooseSaveProject: (suggestedFileName: string) => Promise<NativeProjectPathDialogResult>;
  readonly chooseUnsavedClose: (projectDisplayName: string) => Promise<UnsavedCloseDialogResult>;
}

const WINDOWS_RESERVED_FILE_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/gu;
const TRAILING_DOT_OR_SPACE = /[. ]+$/u;
const WINDOWS_RESERVED_BASENAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;

/** Produces a cross-platform-safe suggestion only; the native dialog owns the final path. */
export const createSuggestedProjectFileName = (projectName: unknown): string => {
  const source = typeof projectName === 'string' ? projectName.trim() : '';
  const cleaned = source
    .replace(WINDOWS_RESERVED_FILE_CHARACTERS, ' ')
    .replace(/\s+/gu, ' ')
    .replace(TRAILING_DOT_OR_SPACE, '')
    .slice(0, 100)
    .trim();
  if (cleaned.length === 0 || WINDOWS_RESERVED_BASENAME.test(cleaned)) {
    return 'Untitled Wireframe';
  }
  return cleaned;
};
