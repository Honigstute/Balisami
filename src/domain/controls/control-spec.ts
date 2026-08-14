import { ControlTypeIdSchema, type ControlTypeId } from '../document/schema';

export const FOUNDATION_CONTROL_TYPES = Object.freeze({
  group: ControlTypeIdSchema.parse('foundation.group'),
  rectangle: ControlTypeIdSchema.parse('foundation.rectangle'),
});

export interface ControlSpec {
  readonly canOwnChildren: boolean;
  readonly type: ControlTypeId;
}

const CONTROL_SPECS: readonly ControlSpec[] = Object.freeze([
  Object.freeze({
    type: FOUNDATION_CONTROL_TYPES.group,
    canOwnChildren: true,
  }),
  Object.freeze({
    type: FOUNDATION_CONTROL_TYPES.rectangle,
    canOwnChildren: false,
  }),
]);

const CONTROL_SPEC_BY_TYPE = new Map<string, ControlSpec>(
  CONTROL_SPECS.map((spec) => [spec.type, spec]),
);

if (CONTROL_SPEC_BY_TYPE.size !== CONTROL_SPECS.length) {
  throw new Error('Foundation control specs contain a duplicate type.');
}

export const getControlSpec = (type: string): ControlSpec | undefined =>
  CONTROL_SPEC_BY_TYPE.get(type);

export const listControlSpecs = (): readonly ControlSpec[] => CONTROL_SPECS;
