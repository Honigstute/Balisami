import type { ControlDefinition, ElementProperties } from '../../domain';
import { DESIGN_TOKENS } from '../../shared/design-tokens';
import {
  getIconDefinition,
  type IconDefinition,
  type IconNode,
} from '../../shared/icons/icon-catalog';
import type { WorldRect } from '../editor/viewport-transform';
import type { ControlSceneTextLayout } from './control-scene-text-layout';

export const CATALOG_ICON_VIEW_BOX_SIZE = 24;

export interface ControlSceneIconProjection {
  readonly definition: IconDefinition;
  readonly size: number;
  readonly transform: string;
  readonly x: number;
  readonly y: number;
}

const getCanonicalIcon = (
  definition: ControlDefinition,
  properties: ElementProperties,
): IconDefinition | undefined => {
  if (!definition.capabilities.icon) {
    return undefined;
  }
  const iconId = properties.iconId;
  if (typeof iconId !== 'string') {
    return undefined;
  }
  const icon = getIconDefinition(iconId);
  return icon?.id === iconId ? icon : undefined;
};

/** Canonical world geometry shared by live scene, thumbnails, presentation, and export. */
export const createControlSceneIconProjection = (
  definition: ControlDefinition,
  bounds: WorldRect,
  properties: ElementProperties,
  textLayout: ControlSceneTextLayout | undefined,
): ControlSceneIconProjection | undefined => {
  const icon = getCanonicalIcon(definition, properties);
  if (icon === undefined) {
    return undefined;
  }
  const size = Math.min(
    DESIGN_TOKENS.control.iconSize,
    Math.max(0, bounds.height - DESIGN_TOKENS.space[2] * 2),
  );
  if (size <= 0) {
    return undefined;
  }
  const text = definition.capabilities.text;
  const x =
    text?.alignment === 'center' && textLayout !== undefined
      ? bounds.x + (bounds.width - (size + DESIGN_TOKENS.space[1] + textLayout.width)) / 2
      : bounds.x + (text?.inset ?? DESIGN_TOKENS.space[2]);
  const y = bounds.y + (bounds.height - size) / 2;
  return Object.freeze({
    definition: icon,
    size,
    transform: `translate(${String(x)} ${String(y)}) scale(${String(size / CATALOG_ICON_VIEW_BOX_SIZE)})`,
    x,
    y,
  });
};

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const SUPPORTED_ICON_NODE_TAGS = new Set([
  'circle',
  'ellipse',
  'line',
  'path',
  'polygon',
  'polyline',
  'rect',
]);

const createSvgNode = (ownerDocument: Document, node: IconNode): SVGElement => {
  const [tag, attributes] = node;
  if (!SUPPORTED_ICON_NODE_TAGS.has(tag)) {
    throw new Error(`Icon catalog contains unsupported SVG node '${tag}'.`);
  }
  const element = ownerDocument.createElementNS(SVG_NAMESPACE, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  return element;
};

/** Updates curated SVG nodes without parsing markup or using innerHTML. */
export const syncControlSceneIconElement = (
  element: SVGGElement,
  projection: ControlSceneIconProjection | undefined,
): void => {
  if (projection === undefined) {
    element.replaceChildren();
    delete element.dataset.iconId;
    element.removeAttribute('transform');
    element.setAttribute('display', 'none');
    return;
  }
  if (element.dataset.iconId !== projection.definition.id) {
    element.replaceChildren(
      ...projection.definition.nodes.map((node) => createSvgNode(element.ownerDocument, node)),
    );
    element.dataset.iconId = projection.definition.id;
  }
  element.setAttribute('transform', projection.transform);
  element.setAttribute('display', 'inline');
};
