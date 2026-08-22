import {
  DOCUMENT_COMMAND_TYPES,
  dispatchDocumentCommand,
  getControlSpec,
  parseCustomIconReference,
  type DocumentCommand,
  type ElementId,
  type ProjectDocument,
} from '../../domain';
import { planCommandsWithUnusedAssetCleanup } from '../projects/unused-asset-cleanup';

export interface ControlIconUpdate {
  readonly elementId: ElementId;
  readonly iconId: string | null;
  readonly property: string;
}

const supportsIconProperty = (document: ProjectDocument, update: ControlIconUpdate): boolean => {
  const element = document.elementsById[update.elementId];
  const definition = element === undefined ? undefined : getControlSpec(element.controlType);
  return (
    definition !== undefined &&
    definition.inspector.some((section) =>
      section.fields.some((field) => field.kind === 'icon' && field.property === update.property),
    )
  );
};

/**
 * Keeps custom-icon properties and element asset reachability consistent at every validated
 * command boundary. Switching between two project images briefly retains both references inside
 * the transaction, then removes the superseded one and its metadata only if globally unused.
 */
export const planControlIconUpdates = (
  document: ProjectDocument,
  updates: readonly ControlIconUpdate[],
): readonly DocumentCommand[] | undefined => {
  if (
    new Set(updates.map((update) => update.elementId)).size !== updates.length ||
    updates.some((update) => !supportsIconProperty(document, update))
  ) {
    return undefined;
  }

  let candidate = document;
  const commands: DocumentCommand[] = [];
  const append = (command: DocumentCommand): boolean => {
    const result = dispatchDocumentCommand(candidate, command);
    if (!result.ok) return false;
    if (result.changed) {
      candidate = result.document;
      commands.push(result.command);
    }
    return true;
  };

  for (const update of updates) {
    let element = candidate.elementsById[update.elementId];
    if (element === undefined) return undefined;
    const previousCustomAssetId = parseCustomIconReference(element.properties[update.property]);
    const nextCustomAssetId = parseCustomIconReference(update.iconId);
    if (nextCustomAssetId !== undefined) {
      const asset = candidate.assetsById[nextCustomAssetId];
      if (asset === undefined || !asset.mediaType.startsWith('image/')) return undefined;
      if (!element.assetIds.includes(nextCustomAssetId)) {
        if (
          !append({
            type: DOCUMENT_COMMAND_TYPES.setElementAssets,
            elementId: element.id,
            assetIds: Object.freeze([...element.assetIds, nextCustomAssetId]),
          })
        ) {
          return undefined;
        }
        const updatedElement = candidate.elementsById[update.elementId];
        if (updatedElement === undefined) return undefined;
        element = updatedElement;
      }
    }
    if (
      !append({
        type: DOCUMENT_COMMAND_TYPES.setElementProperties,
        elementId: element.id,
        properties: Object.freeze({ ...element.properties, [update.property]: update.iconId }),
      })
    ) {
      return undefined;
    }
    const updatedElement = candidate.elementsById[update.elementId];
    if (updatedElement === undefined) return undefined;
    element = updatedElement;
    if (
      previousCustomAssetId !== undefined &&
      previousCustomAssetId !== nextCustomAssetId &&
      element.assetIds.includes(previousCustomAssetId)
    ) {
      if (
        !append({
          type: DOCUMENT_COMMAND_TYPES.setElementAssets,
          elementId: element.id,
          assetIds: Object.freeze(
            element.assetIds.filter((assetId) => assetId !== previousCustomAssetId),
          ),
        })
      ) {
        return undefined;
      }
    }
  }

  return planCommandsWithUnusedAssetCleanup(document, commands);
};
