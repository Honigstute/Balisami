import type { AssetId } from '../document/ids';
import type { ProjectDocument } from '../document/validation';
import type { CommandApplication, CommandApplicationFailure } from './application';
import {
  DOCUMENT_COMMAND_TYPES,
  type AssetCommand,
  type CreateAssetCommand,
  type DeleteAssetCommand,
} from './schema';

const notFound = (assetId: AssetId): CommandApplicationFailure => ({
  ok: false,
  code: 'not-found',
  message: `Asset '${assetId}' does not exist.`,
});

const applyCreateAsset = (
  document: ProjectDocument,
  command: CreateAssetCommand,
): CommandApplication => {
  if (document.assetsById[command.asset.id] !== undefined) {
    return {
      ok: false,
      code: 'conflict',
      message: `Asset '${command.asset.id}' already exists.`,
    };
  }
  return {
    ok: true,
    changed: true,
    candidate: Object.freeze({
      ...document,
      assetsById: Object.freeze({
        ...document.assetsById,
        [command.asset.id]: command.asset,
      }),
    }),
    inverse: { type: DOCUMENT_COMMAND_TYPES.deleteAsset, assetId: command.asset.id },
    label: 'Add asset',
  };
};

const applyDeleteAsset = (
  document: ProjectDocument,
  command: DeleteAssetCommand,
): CommandApplication => {
  const asset = document.assetsById[command.assetId];
  if (asset === undefined) {
    return notFound(command.assetId);
  }
  if (Object.values(document.elementsById).some((element) => element.assetIds.includes(asset.id))) {
    return {
      ok: false,
      code: 'conflict',
      message: `Asset '${asset.id}' is still used by an element.`,
    };
  }
  const remainingAssets = Object.fromEntries(
    Object.entries(document.assetsById).filter(([assetId]) => assetId !== asset.id),
  ) as ProjectDocument['assetsById'];
  return {
    ok: true,
    changed: true,
    candidate: Object.freeze({
      ...document,
      assetsById: Object.freeze(remainingAssets),
    }),
    inverse: { type: DOCUMENT_COMMAND_TYPES.createAsset, asset },
    label: 'Delete unused asset',
  };
};

export const applyAssetCommand = (
  document: ProjectDocument,
  command: AssetCommand,
): CommandApplication => {
  switch (command.type) {
    case DOCUMENT_COMMAND_TYPES.createAsset:
      return applyCreateAsset(document, command);
    case DOCUMENT_COMMAND_TYPES.deleteAsset:
      return applyDeleteAsset(document, command);
  }
};
