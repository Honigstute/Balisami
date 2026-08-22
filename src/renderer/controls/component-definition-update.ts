import {
  ComponentInstancePropertiesSchema,
  CONTROL_TYPES,
  DOCUMENT_COMMAND_TYPES,
  dispatchDocumentCommand,
  getControlSpec,
  parseCustomIconReference,
  type AssetId,
  type DocumentCommand,
  type ElementId,
  type ProjectDocument,
} from '../../domain';
import { planCommandsWithUnusedAssetCleanup } from '../projects/unused-asset-cleanup';

const collectDefinitionElementIds = (
  document: ProjectDocument,
  rootElementId: ElementId,
): readonly ElementId[] => {
  const ids: ElementId[] = [];
  const visit = (elementId: ElementId): void => {
    const element = document.elementsById[elementId];
    if (element === undefined) return;
    ids.push(element.id);
    element.childIds.forEach(visit);
  };
  visit(rootElementId);
  return Object.freeze(ids);
};

const selectCustomIconAssetIds = (
  document: ProjectDocument,
  elementId: ElementId,
): ReadonlySet<AssetId> => {
  const element = document.elementsById[elementId];
  const definition = element === undefined ? undefined : getControlSpec(element.controlType);
  const assetIds = new Set<AssetId>();
  for (const field of definition?.inspector.flatMap((section) => section.fields) ?? []) {
    if (field.kind !== 'icon') continue;
    const assetId = parseCustomIconReference(element?.properties[field.property]);
    if (assetId !== undefined) assetIds.add(assetId);
  }
  return assetIds;
};

/**
 * Promotes every local property override into the canonical definition and then
 * clears the source instance. Other non-overridden instances immediately consume
 * the new definition; their own explicit overrides remain authoritative.
 */
export const planComponentDefinitionUpdateFromInstance = (
  document: ProjectDocument,
  instanceId: ElementId,
): readonly DocumentCommand[] | undefined => {
  const instance = document.elementsById[instanceId];
  const parsed =
    instance?.controlType === CONTROL_TYPES.componentInstance
      ? ComponentInstancePropertiesSchema.safeParse(instance.properties)
      : undefined;
  const component =
    parsed?.success === true ? document.componentsById[parsed.data.componentId] : undefined;
  if (
    instance === undefined ||
    parsed?.success !== true ||
    component === undefined ||
    Object.keys(parsed.data.overrides).length === 0
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

  const overrideCustomAssetIds = new Set<AssetId>();
  for (const targetId of collectDefinitionElementIds(document, component.rootElementId)) {
    const patch = parsed.data.overrides[targetId];
    const target = candidate.elementsById[targetId];
    const definition = target === undefined ? undefined : getControlSpec(target.controlType);
    if (patch === undefined || target === undefined || definition === undefined) continue;

    const previousCustomAssetIds = selectCustomIconAssetIds(candidate, target.id);
    const nextCustomAssetIds = new Set<AssetId>();
    for (const field of definition.inspector.flatMap((section) => section.fields)) {
      if (field.kind !== 'icon') continue;
      const nextValue = Object.hasOwn(patch, field.property)
        ? patch[field.property]
        : target.properties[field.property];
      const assetId = parseCustomIconReference(nextValue);
      if (assetId === undefined) continue;
      const asset = candidate.assetsById[assetId];
      if (asset === undefined || !asset.mediaType.startsWith('image/')) return undefined;
      nextCustomAssetIds.add(assetId);
      if (Object.hasOwn(patch, field.property)) overrideCustomAssetIds.add(assetId);
    }

    const assetsBeforePropertyCommit = new Set(target.assetIds);
    nextCustomAssetIds.forEach((assetId) => assetsBeforePropertyCommit.add(assetId));
    if (
      !append({
        type: DOCUMENT_COMMAND_TYPES.setElementAssets,
        elementId: target.id,
        assetIds: Object.freeze([...assetsBeforePropertyCommit]),
      })
    ) {
      return undefined;
    }
    const targetWithAssets = candidate.elementsById[target.id];
    if (
      targetWithAssets === undefined ||
      !append({
        type: DOCUMENT_COMMAND_TYPES.setElementProperties,
        elementId: target.id,
        properties: Object.freeze({ ...targetWithAssets.properties, ...patch }),
      })
    ) {
      return undefined;
    }

    const targetAfterPropertyCommit = candidate.elementsById[target.id];
    if (targetAfterPropertyCommit === undefined) return undefined;
    const removablePreviousAssets = [...previousCustomAssetIds].filter(
      (assetId) => !nextCustomAssetIds.has(assetId),
    );
    if (
      removablePreviousAssets.length > 0 &&
      !append({
        type: DOCUMENT_COMMAND_TYPES.setElementAssets,
        elementId: target.id,
        assetIds: Object.freeze(
          targetAfterPropertyCommit.assetIds.filter(
            (assetId) => !removablePreviousAssets.includes(assetId),
          ),
        ),
      })
    ) {
      return undefined;
    }
  }

  const currentInstance = candidate.elementsById[instance.id];
  if (
    currentInstance === undefined ||
    !append({
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId: instance.id,
      properties: Object.freeze({
        ...currentInstance.properties,
        overrides: Object.freeze({}),
      }),
    })
  ) {
    return undefined;
  }
  const clearedInstance = candidate.elementsById[instance.id];
  if (
    clearedInstance === undefined ||
    !append({
      type: DOCUMENT_COMMAND_TYPES.setElementAssets,
      elementId: instance.id,
      assetIds: Object.freeze(
        clearedInstance.assetIds.filter((assetId) => !overrideCustomAssetIds.has(assetId)),
      ),
    })
  ) {
    return undefined;
  }

  return planCommandsWithUnusedAssetCleanup(document, commands);
};
