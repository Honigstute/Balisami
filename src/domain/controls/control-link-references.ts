import type { ElementRowId } from '../document/ids';
import type { ElementLink, ElementNode } from '../document/schema';
import type { ControlDefinition } from './control-definition';
import { getControlSpec } from './control-spec';

export type ControlLinkReference =
  | Readonly<{ kind: 'control'; link: ElementLink }>
  | Readonly<{ index: number; kind: 'row'; link: ElementLink; rowId: ElementRowId }>;

export const listDefinitionElementLinkReferences = (
  definition: ControlDefinition,
  element: ElementNode,
): readonly ControlLinkReference[] =>
  Object.freeze([
    ...(element.link === null
      ? []
      : [Object.freeze({ kind: 'control' as const, link: element.link })]),
    ...(definition.rows?.links !== true
      ? []
      : element.rowData.bindings.flatMap((binding, index) =>
          binding.link === null
            ? []
            : [
                Object.freeze({
                  kind: 'row' as const,
                  index,
                  link: binding.link,
                  rowId: binding.id,
                }),
              ],
        )),
  ]);

export const listElementLinkReferences = (
  element: ElementNode,
): readonly ControlLinkReference[] => {
  const definition = getControlSpec(element.controlType);
  return definition === undefined
    ? Object.freeze([])
    : listDefinitionElementLinkReferences(definition, element);
};

export const mapElementLinks = (
  element: ElementNode,
  mapLink: (link: ElementLink, reference: Omit<ControlLinkReference, 'link'>) => ElementLink,
): ElementNode => {
  const definition = getControlSpec(element.controlType);
  const link =
    element.link === null ? null : mapLink(element.link, Object.freeze({ kind: 'control' }));
  const rowData =
    definition?.rows?.links !== true
      ? element.rowData
      : Object.freeze({
          ...element.rowData,
          bindings: Object.freeze(
            element.rowData.bindings.map((binding, index) =>
              binding.link === null
                ? binding
                : Object.freeze({
                    ...binding,
                    link: mapLink(
                      binding.link,
                      Object.freeze({ index, kind: 'row', rowId: binding.id }),
                    ),
                  }),
            ),
          ),
        });
  return link === element.link && rowData === element.rowData
    ? element
    : Object.freeze({ ...element, link, rowData });
};
