import type { ControlDefinition, ElementProperties } from '../../domain';
import { DESIGN_TOKENS } from '../../shared/design-tokens';
import { createSeededSketchLinePath } from '../editor/seeded-sketch';
import { createWorldPoint, createWorldRect, type WorldRect } from '../editor/viewport-transform';

interface TabRowGeometry {
  readonly bounds: WorldRect;
  readonly id: string;
}

const requireTabs = (definition: ControlDefinition) => {
  const tabs = definition.scene.tabs;
  if (definition.scene.kind !== 'tabs' || tabs === undefined) {
    throw new Error(`Control '${definition.type}' is missing tab geometry metadata.`);
  }
  return tabs;
};

const getFontSize = (definition: ControlDefinition, properties: ElementProperties): number => {
  const property = definition.capabilities.text?.style.fontSizeProperty;
  const value = property === null || property === undefined ? undefined : properties[property];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : (definition.capabilities.text?.fontSize ?? DESIGN_TOKENS.font.bodySize);
};

/** Tab-strip extent is token- and font-derived, while the document owns only outer bounds. */
export const getControlTabsStripExtent = (
  definition: ControlDefinition,
  bounds: WorldRect,
  properties: ElementProperties,
): number => {
  const tabs = requireTabs(definition);
  const fontSize = getFontSize(definition, properties);
  return tabs.orientation === 'horizontal'
    ? Math.min(bounds.height / 2, fontSize + DESIGN_TOKENS.space[4])
    : Math.min(bounds.width * 0.45, fontSize * 5 + DESIGN_TOKENS.space[4]);
};

export const getControlTabsBodyBounds = (
  definition: ControlDefinition,
  bounds: WorldRect,
  properties: ElementProperties,
): WorldRect => {
  const tabs = requireTabs(definition);
  const extent = getControlTabsStripExtent(definition, bounds, properties);
  const overlap = Math.min(1, extent);
  const position = properties[tabs.positionProperty];
  if (tabs.orientation === 'horizontal') {
    return position === 'bottom'
      ? createWorldRect(bounds.x, bounds.y, bounds.width, bounds.height - extent + overlap)
      : createWorldRect(
          bounds.x,
          bounds.y + extent - overlap,
          bounds.width,
          bounds.height - extent + overlap,
        );
  }
  return position === 'right'
    ? createWorldRect(bounds.x, bounds.y, bounds.width - extent + overlap, bounds.height)
    : createWorldRect(
        bounds.x + extent - overlap,
        bounds.y,
        bounds.width - extent + overlap,
        bounds.height,
      );
};

const createClosedRectPath = (bounds: WorldRect): string =>
  `M ${String(bounds.x)} ${String(bounds.y)} H ${String(bounds.x + bounds.width)} V ${String(bounds.y + bounds.height)} H ${String(bounds.x)} Z`;

/** Body and tabs share one background layer so empty strip space stays transparent. */
export const createControlTabsFillPath = (
  definition: ControlDefinition,
  bounds: WorldRect,
  properties: ElementProperties,
  rows: readonly TabRowGeometry[],
): string =>
  [
    ...(properties.showBorder === true
      ? [createClosedRectPath(getControlTabsBodyBounds(definition, bounds, properties))]
      : []),
    ...rows.map((row) => createClosedRectPath(row.bounds)),
  ].join(' ');

const createLine = (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  identity: string,
  salt: string,
): string =>
  createSeededSketchLinePath({
    end: createWorldPoint(endX, endY),
    seed: `${identity}:tabs:${salt}`,
    start: createWorldPoint(startX, startY),
  });

const createHorizontalBodyPath = (
  body: WorldRect,
  position: 'bottom' | 'top',
  selected: TabRowGeometry | undefined,
  showBorder: boolean,
  identity: string,
): readonly string[] => {
  const left = body.x;
  const right = body.x + body.width;
  const top = body.y;
  const bottom = body.y + body.height;
  const seamY = position === 'top' ? top : bottom;
  const seam = selected?.bounds;
  const seamPaths =
    seam === undefined
      ? [createLine(left, seamY, right, seamY, identity, 'body-seam')]
      : [
          ...(seam.x > left
            ? [createLine(left, seamY, seam.x, seamY, identity, 'body-seam-before')]
            : []),
          ...(seam.x + seam.width < right
            ? [createLine(seam.x + seam.width, seamY, right, seamY, identity, 'body-seam-after')]
            : []),
        ];
  if (!showBorder) return seamPaths;
  return [
    ...seamPaths,
    createLine(left, top, left, bottom, identity, 'body-left'),
    createLine(right, top, right, bottom, identity, 'body-right'),
    createLine(
      left,
      position === 'top' ? bottom : top,
      right,
      position === 'top' ? bottom : top,
      identity,
      'body-far',
    ),
  ];
};

const createVerticalBodyPath = (
  body: WorldRect,
  position: 'left' | 'right',
  selected: TabRowGeometry | undefined,
  showBorder: boolean,
  identity: string,
): readonly string[] => {
  const left = body.x;
  const right = body.x + body.width;
  const top = body.y;
  const bottom = body.y + body.height;
  const seamX = position === 'left' ? left : right;
  const seam = selected?.bounds;
  const seamPaths =
    seam === undefined
      ? [createLine(seamX, top, seamX, bottom, identity, 'body-seam')]
      : [
          ...(seam.y > top
            ? [createLine(seamX, top, seamX, seam.y, identity, 'body-seam-before')]
            : []),
          ...(seam.y + seam.height < bottom
            ? [createLine(seamX, seam.y + seam.height, seamX, bottom, identity, 'body-seam-after')]
            : []),
        ];
  if (!showBorder) return seamPaths;
  return [
    ...seamPaths,
    createLine(left, top, right, top, identity, 'body-top'),
    createLine(left, bottom, right, bottom, identity, 'body-bottom'),
    createLine(
      position === 'left' ? right : left,
      top,
      position === 'left' ? right : left,
      bottom,
      identity,
      'body-far',
    ),
  ];
};

/** Selected tabs deliberately omit the seam edge so their white fill joins the pane. */
export const createControlTabsOutlinePath = (
  definition: ControlDefinition,
  bounds: WorldRect,
  identity: string,
  properties: ElementProperties,
  rows: readonly TabRowGeometry[],
  selectedId: string | undefined,
): string => {
  const tabs = requireTabs(definition);
  const body = getControlTabsBodyBounds(definition, bounds, properties);
  const selected = rows.find((row) => row.id === selectedId);
  const showBorder = properties.showBorder === true;
  const position = properties[tabs.positionProperty];
  const bodyPaths =
    tabs.orientation === 'horizontal'
      ? createHorizontalBodyPath(
          body,
          position === 'bottom' ? 'bottom' : 'top',
          selected,
          showBorder,
          identity,
        )
      : createVerticalBodyPath(
          body,
          position === 'right' ? 'right' : 'left',
          selected,
          showBorder,
          identity,
        );
  const rowPaths = rows.flatMap((row, index) => {
    const left = row.bounds.x;
    const right = row.bounds.x + row.bounds.width;
    const top = row.bounds.y;
    const bottom = row.bounds.y + row.bounds.height;
    const isSelected = row.id === selectedId;
    const prefix = `row-${String(index)}`;
    if (tabs.orientation === 'horizontal') {
      const seamY = position === 'bottom' ? top : bottom;
      const farY = position === 'bottom' ? bottom : top;
      return [
        createLine(left, seamY, left, farY, identity, `${prefix}-left`),
        createLine(left, farY, right, farY, identity, `${prefix}-far`),
        createLine(right, farY, right, seamY, identity, `${prefix}-right`),
        ...(isSelected ? [] : [createLine(left, seamY, right, seamY, identity, `${prefix}-seam`)]),
      ];
    }
    const seamX = position === 'right' ? left : right;
    const farX = position === 'right' ? right : left;
    return [
      createLine(seamX, top, farX, top, identity, `${prefix}-top`),
      createLine(farX, top, farX, bottom, identity, `${prefix}-far`),
      createLine(farX, bottom, seamX, bottom, identity, `${prefix}-bottom`),
      ...(isSelected ? [] : [createLine(seamX, top, seamX, bottom, identity, `${prefix}-seam`)]),
    ];
  });
  return [...bodyPaths, ...rowPaths].join(' ');
};
