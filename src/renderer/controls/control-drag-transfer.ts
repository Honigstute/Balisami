import { getControlSpec, type ControlTypeId } from '../../domain';

export const CONTROL_DRAG_MIME_TYPE = 'application/x-balsamic-control-type';

/** Accepts only current palette entries; arbitrary drop payloads never reach commands. */
export const parseDraggedControlType = (value: string): ControlTypeId | undefined => {
  const definition = getControlSpec(value);
  return definition?.palette === null ? undefined : definition?.type;
};
