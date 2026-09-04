import {
  ComponentInstancePropertiesSchema,
  CONTROL_TYPES,
  DOCUMENT_COMMAND_TYPES,
  dispatchDocumentCommand,
  getControlSpec,
  parseCustomIconReference,
  type DocumentCommand,
  type ElementId,
  type JsonValue,
  type ProjectDocument,
} from '../../domain';
import { planCommandsWithUnusedAssetCleanup } from '../projects/unused-asset-cleanup';

export interface ComponentOverrideUpdate {
  readonly instanceId: ElementId;
  readonly property: string;
  readonly reset?: boolean;
  readonly targetElementId: ElementId;
  readonly value?: JsonValue;
}

const listsCustomReference = (
  overrides: Readonly<Record<string, Readonly<Record<string, JsonValue>>>>,
  assetId: string,
): boolean =>
  Object.values(overrides).some((patch) =>
    Object.values(patch).some((value) => parseCustomIconReference(value) === assetId),
  );

/** Plans one override while keeping custom-icon reachability valid at every command boundary. */
export const planComponentOverrideUpdate = (
  document: ProjectDocument,
  update: ComponentOverrideUpdate,
): readonly DocumentCommand[] | undefined => {
  const instance = document.elementsById[update.instanceId];
  const parsed =
    instance?.controlType === CONTROL_TYPES.componentInstance
      ? ComponentInstancePropertiesSchema.safeParse(instance.properties)
      : undefined;
  const component =
    parsed?.success === true ? document.componentsById[parsed.data.componentId] : undefined;
  const target = document.elementsById[update.targetElementId];
  const definition = target === undefined ? undefined : getControlSpec(target.controlType);
  const field = definition?.inspector
    .flatMap((section) => section.fields)
    .find((candidate) => candidate.property === update.property);
  if (
    instance === undefined ||
    parsed?.success !== true ||
    component === undefined ||
    target === undefined ||
    field === undefined ||
    (update.reset !== true && update.value === undefined)
  ) {
    return undefined;
  }

  const currentPatch = parsed.data.overrides[target.id] ?? {};
  const previousOverrideValue = currentPatch[update.property];
  const nextPatch: Record<string, JsonValue> = { ...currentPatch };
  if (update.reset === true) {
    delete nextPatch[update.property];
  } else {
    nextPatch[update.property] = update.value as JsonValue;
  }
  const nextOverrides: Record<string, Readonly<Record<string, JsonValue>>> = {
    ...parsed.data.overrides,
  };
  if (Object.keys(nextPatch).length === 0) {
    delete nextOverrides[target.id];
  } else {
    nextOverrides[target.id] = Object.freeze(nextPatch);
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

  const nextCustomAssetId =
    field.kind === 'icon' && update.reset !== true
      ? parseCustomIconReference(update.value)
      : undefined;
  if (nextCustomAssetId !== undefined && !instance.assetIds.includes(nextCustomAssetId)) {
    const asset = document.assetsById[nextCustomAssetId];
    if (
      asset === undefined ||
      !asset.mediaType.startsWith('image/') ||
      !append({
        type: DOCUMENT_COMMAND_TYPES.setElementAssets,
        elementId: instance.id,
        assetIds: Object.freeze([...instance.assetIds, nextCustomAssetId]),
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
        overrides: Object.freeze(nextOverrides),
      }),
    })
  ) {
    return undefined;
  }

  const previousCustomAssetId =
    field.kind === 'icon' ? parseCustomIconReference(previousOverrideValue) : undefined;
  const updatedInstance = candidate.elementsById[instance.id];
  if (
    previousCustomAssetId !== undefined &&
    previousCustomAssetId !== nextCustomAssetId &&
    updatedInstance?.assetIds.includes(previousCustomAssetId) === true &&
    !listsCustomReference(nextOverrides, previousCustomAssetId) &&
    !append({
      type: DOCUMENT_COMMAND_TYPES.setElementAssets,
      elementId: instance.id,
      assetIds: Object.freeze(
        updatedInstance.assetIds.filter((assetId) => assetId !== previousCustomAssetId),
      ),
    })
  ) {
    return undefined;
  }

  return planCommandsWithUnusedAssetCleanup(document, commands);
};
