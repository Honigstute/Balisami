import {
  parseCustomIconReference,
  type AssetId,
  type ControlDefinition,
  type ElementProperties,
} from '../../domain';
import { DESIGN_TOKENS } from '../../shared/design-tokens';
import {
  getIconDefinition,
  type IconDefinition,
  type IconNode,
} from '../../shared/icons/icon-catalog';
import type { WorldRect } from '../editor/viewport-transform';
import { resolveControlSceneIconSize } from './control-scene-icon-size';
import type { ControlSceneTextLayout } from './control-scene-text-layout';

export const CATALOG_ICON_VIEW_BOX_SIZE = 24;

interface ControlSceneIconGeometry {
  readonly id: string;
  readonly size: number;
  readonly transform: string;
  readonly x: number;
  readonly y: number;
}

export type ControlSceneIconProjection = ControlSceneIconGeometry &
  (
    | { readonly kind: 'asset'; readonly assetId: AssetId }
    | { readonly kind: 'catalog'; readonly definition: IconDefinition }
  );

const getCatalogIcon = (
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
  if (!definition.capabilities.icon || typeof properties.iconId !== 'string') {
    return undefined;
  }
  const customAssetId = parseCustomIconReference(properties.iconId);
  const catalogIcon =
    customAssetId === undefined ? getCatalogIcon(definition, properties) : undefined;
  if (customAssetId === undefined && catalogIcon === undefined) return undefined;
  const size = resolveControlSceneIconSize(definition, bounds, properties);
  if (size <= 0) {
    return undefined;
  }
  const text = definition.capabilities.text;
  const circleLabelPosition =
    definition.scene.kind === 'circle-button' ? properties.labelPosition : undefined;
  const hasCircleLabel =
    circleLabelPosition !== undefined &&
    textLayout !== undefined &&
    textLayout.lines.some((line) => line.text.length > 0);
  const centeredIconX = bounds.x + (bounds.width - size) / 2;
  const x =
    definition.scene.kind === 'circle-button' && !hasCircleLabel
      ? centeredIconX
      : circleLabelPosition === 'below'
        ? centeredIconX
        : circleLabelPosition === 'icon-right' && textLayout !== undefined
          ? bounds.x +
            (bounds.width - (textLayout.width + DESIGN_TOKENS.space[1] + size)) / 2 +
            textLayout.width +
            DESIGN_TOKENS.space[1]
          : text?.alignment === 'center' && textLayout !== undefined
            ? bounds.x + (bounds.width - (size + DESIGN_TOKENS.space[1] + textLayout.width)) / 2
            : bounds.x + (text?.inset ?? DESIGN_TOKENS.space[2]);
  const y =
    circleLabelPosition === 'below' && hasCircleLabel
      ? bounds.y + DESIGN_TOKENS.space[2]
      : bounds.y + (bounds.height - size) / 2;
  const geometry = {
    id: properties.iconId,
    size,
    transform: `translate(${String(x)} ${String(y)}) scale(${String(size / CATALOG_ICON_VIEW_BOX_SIZE)})`,
    x,
    y,
  } as const;
  return customAssetId === undefined
    ? Object.freeze({ ...geometry, definition: catalogIcon as IconDefinition, kind: 'catalog' })
    : Object.freeze({ ...geometry, assetId: customAssetId, kind: 'asset' });
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
  assetUrls: Readonly<Record<string, string>> = {},
): void => {
  if (projection === undefined) {
    element.replaceChildren();
    delete element.dataset.iconId;
    element.removeAttribute('transform');
    element.setAttribute('display', 'none');
    return;
  }
  if (element.dataset.iconId !== projection.id) {
    if (projection.kind === 'catalog') {
      element.replaceChildren(
        ...projection.definition.nodes.map((node) => createSvgNode(element.ownerDocument, node)),
      );
    } else {
      const image = element.ownerDocument.createElementNS(SVG_NAMESPACE, 'image');
      image.setAttribute('height', String(CATALOG_ICON_VIEW_BOX_SIZE));
      image.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      image.setAttribute('width', String(CATALOG_ICON_VIEW_BOX_SIZE));
      image.setAttribute('x', '0');
      image.setAttribute('y', '0');
      element.replaceChildren(image);
    }
    element.dataset.iconId = projection.id;
  }
  if (projection.kind === 'asset') {
    const image = element.firstElementChild;
    const url = assetUrls[projection.assetId];
    if (image?.localName !== 'image' || url === undefined) {
      element.setAttribute('display', 'none');
      return;
    }
    image.setAttribute('href', url);
  }
  element.setAttribute('transform', projection.transform);
  element.setAttribute('display', 'inline');
};
