import {
  ComponentIdSchema,
  getControlSpec,
  type ComponentId,
  type ControlTypeId,
} from '../../domain';

export const CONTROL_DRAG_MIME_TYPE = 'application/x-balsamic-control-type';
export const COMPONENT_DRAG_MIME_TYPE = 'application/x-balsamic-component-id';

/** Accepts only current palette entries; arbitrary drop payloads never reach commands. */
export const parseDraggedControlType = (value: string): ControlTypeId | undefined => {
  const definition = getControlSpec(value);
  return definition?.palette === null ? undefined : definition?.type;
};

export const parseDraggedComponentId = (value: string): ComponentId | undefined => {
  const parsed = ComponentIdSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};
