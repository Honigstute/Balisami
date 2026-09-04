import {
  ComponentIdSchema,
  getControlPaletteEntry,
  getControlSpec,
  type ComponentId,
  type ControlTypeId,
} from '../../domain';

export const CONTROL_DRAG_MIME_TYPE = 'application/x-balsamic-control-type';
export const COMPONENT_DRAG_MIME_TYPE = 'application/x-balsamic-component-id';
export const MAX_CONTROL_DRAG_PAYLOAD_LENGTH = 512;

export interface DraggedControlEntry {
  readonly controlType: ControlTypeId;
  readonly presetId?: string;
}

/** Accepts only current palette entries; arbitrary drop payloads never reach commands. */
export const parseDraggedControlType = (value: string): ControlTypeId | undefined => {
  const definition = getControlSpec(value);
  return definition?.palette === null ? undefined : definition?.type;
};

export const parseDraggedControlEntry = (value: string): DraggedControlEntry | undefined => {
  if (value.length === 0 || value.length > MAX_CONTROL_DRAG_PAYLOAD_LENGTH) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    const controlType = parseDraggedControlType(value);
    return controlType === undefined ? undefined : Object.freeze({ controlType });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  const keys = Object.keys(parsed);
  if (keys.length !== 2 || !keys.includes('controlType') || !keys.includes('presetId')) {
    return undefined;
  }
  const candidate = parsed as Record<string, unknown>;
  if (
    typeof candidate.controlType !== 'string' ||
    (candidate.presetId !== null && typeof candidate.presetId !== 'string')
  ) {
    return undefined;
  }
  const entry = getControlPaletteEntry(candidate.controlType, candidate.presetId);
  return entry === undefined
    ? undefined
    : Object.freeze({
        controlType: entry.definition.type,
        ...(entry.presetId === null ? {} : { presetId: entry.presetId }),
      });
};

export const parseDraggedComponentId = (value: string): ComponentId | undefined => {
  const parsed = ComponentIdSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};
