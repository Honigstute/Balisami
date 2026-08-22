import {
  DOCUMENT_COMMAND_TYPES,
  MAX_HISTORY_TRANSACTION_COMMANDS,
  dispatchDocumentCommand,
  type AssetId,
  type DocumentCommand,
  type ProjectDocument,
} from '../../domain';

const selectReferencedAssetIds = (document: ProjectDocument): ReadonlySet<AssetId> =>
  new Set(Object.values(document.elementsById).flatMap((element) => element.assetIds));

/**
 * Appends explicit delete commands only for assets whose final element
 * reference is removed by this transaction. Pre-existing unused metadata is
 * left alone so one workflow never performs unrelated document cleanup.
 */
export const planCommandsWithUnusedAssetCleanup = (
  document: ProjectDocument,
  commands: readonly DocumentCommand[],
): readonly DocumentCommand[] | undefined => {
  let candidate = document;
  for (const command of commands) {
    const result = dispatchDocumentCommand(candidate, command);
    if (!result.ok) {
      return undefined;
    }
    candidate = result.document;
  }

  const referencedBefore = selectReferencedAssetIds(document);
  const referencedAfter = selectReferencedAssetIds(candidate);
  const becameUnused = [...referencedBefore]
    .filter((assetId) => !referencedAfter.has(assetId))
    .sort((left, right) => left.localeCompare(right));
  if (commands.length + becameUnused.length > MAX_HISTORY_TRANSACTION_COMMANDS) {
    return undefined;
  }

  return Object.freeze([
    ...commands,
    ...becameUnused.map((assetId): DocumentCommand =>
      Object.freeze({ type: DOCUMENT_COMMAND_TYPES.deleteAsset, assetId }),
    ),
  ]);
};
