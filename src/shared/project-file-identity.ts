/** Public project-file identity shared by native dialogs and packaging metadata. */
export const PROJECT_FILE_IDENTITY = Object.freeze({
  displayName: 'Balsamic Project',
  extension: 'balsamic',
  mimeType: 'application/vnd.balsamic.project+zip',
  uniformTypeIdentifier: 'app.balsamic.project',
});

export const createProjectFileName = (baseName: string): string =>
  `${baseName}.${PROJECT_FILE_IDENTITY.extension}`;
