import type { ElementRowData, ParsedControlRow } from '../../domain';
import { DESIGN_TOKENS } from '../../shared/design-tokens';
import { createSeededSketchLinePath } from '../editor/seeded-sketch';
import { createWorldPoint, createWorldRect, type WorldRect } from '../editor/viewport-transform';

export interface AccordionRowGeometry {
  readonly bounds: WorldRect;
  readonly sourceIndex: number;
}

export interface AccordionLayout {
  readonly activeParentId: string | undefined;
  readonly activeParentSourceIndex: number | undefined;
  readonly paneBounds: WorldRect | undefined;
  readonly rows: readonly AccordionRowGeometry[];
}

const findActiveParentIndex = (
  parsed: readonly ParsedControlRow[],
  rowData: ElementRowData,
  selectedId: string | undefined,
): number | undefined => {
  if (selectedId === undefined) return undefined;
  const selectedIndex = rowData.bindings.findIndex((binding) => binding.id === selectedId);
  if (selectedIndex < 0) return undefined;
  if (parsed[selectedIndex]?.depth === 0) return selectedIndex;
  for (let index = selectedIndex - 1; index >= 0; index -= 1) {
    if (parsed[index]?.depth === 0) return index;
  }
  return undefined;
};

/**
 * Accordions keep all top-level headers visible and reveal only the children
 * belonging to the selected parent. The pane reserve compresses before rows,
 * making dense manual sizes finite without changing persisted geometry.
 */
export const createAccordionLayout = (
  parsed: readonly ParsedControlRow[],
  rowData: ElementRowData,
  selectedId: string | undefined,
  bounds: WorldRect,
): AccordionLayout => {
  const activeParentIndex = findActiveParentIndex(parsed, rowData, selectedId);
  let currentParentIndex: number | undefined;
  const visibleIndices: number[] = [];
  parsed.forEach((row, index) => {
    if (row.depth === 0) {
      currentParentIndex = index;
      visibleIndices.push(index);
    } else if (currentParentIndex === activeParentIndex) {
      visibleIndices.push(index);
    }
  });
  const rowHeight = Math.min(
    DESIGN_TOKENS.control.accordionRowHeight,
    bounds.height / Math.max(1, visibleIndices.length),
  );
  const paneHeight = Math.max(0, bounds.height - visibleIndices.length * rowHeight);
  const activeVisibleIndex =
    activeParentIndex === undefined ? -1 : visibleIndices.indexOf(activeParentIndex);
  const activeChildCount =
    activeParentIndex === undefined
      ? 0
      : visibleIndices.filter((index) => parsed[index]?.depth === 1).length;
  const paneInsertIndex =
    activeVisibleIndex < 0 ? visibleIndices.length : activeVisibleIndex + 1 + activeChildCount;
  const rows = visibleIndices.map((sourceIndex, visibleIndex) => {
    const paneOffset = visibleIndex >= paneInsertIndex ? paneHeight : 0;
    return Object.freeze({
      bounds: createWorldRect(
        bounds.x,
        bounds.y + visibleIndex * rowHeight + paneOffset,
        bounds.width,
        rowHeight,
      ),
      sourceIndex,
    });
  });
  const paneY =
    activeVisibleIndex < 0
      ? bounds.y + visibleIndices.length * rowHeight
      : bounds.y + (activeVisibleIndex + 1) * rowHeight;
  const contentPaneHeight = paneHeight + activeChildCount * rowHeight;
  return Object.freeze({
    activeParentId:
      activeParentIndex === undefined ? undefined : rowData.bindings[activeParentIndex]?.id,
    activeParentSourceIndex: activeParentIndex,
    paneBounds:
      contentPaneHeight === 0
        ? undefined
        : createWorldRect(bounds.x, paneY, bounds.width, contentPaneHeight),
    rows: Object.freeze(rows),
  });
};

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
    seed: `${identity}:accordion:${salt}`,
    start: createWorldPoint(startX, startY),
  });

export const createAccordionActiveHeaderPath = (layout: AccordionLayout): string => {
  const active = layout.rows.find((row) => row.sourceIndex === layout.activeParentSourceIndex);
  if (active === undefined || layout.activeParentId === undefined) return '';
  const bounds = active.bounds;
  return `M ${String(bounds.x)} ${String(bounds.y)} H ${String(bounds.x + bounds.width)} V ${String(bounds.y + bounds.height)} H ${String(bounds.x)} Z`;
};

export const createAccordionOutlinePath = (
  parsed: readonly ParsedControlRow[],
  rowData: ElementRowData,
  layout: AccordionLayout,
  identity: string,
  bounds: WorldRect,
): string => {
  const horizontalYs = new Set<number>([bounds.y, bounds.y + bounds.height]);
  for (const row of layout.rows) {
    horizontalYs.add(row.bounds.y);
    horizontalYs.add(row.bounds.y + row.bounds.height);
  }
  if (layout.paneBounds !== undefined) {
    horizontalYs.add(layout.paneBounds.y);
    horizontalYs.add(layout.paneBounds.y + layout.paneBounds.height);
  }
  const paths = [...horizontalYs]
    .sort((left, right) => left - right)
    .map((y, index) =>
      createLine(bounds.x, y, bounds.x + bounds.width, y, identity, `horizontal-${String(index)}`),
    );
  paths.push(
    createLine(bounds.x, bounds.y, bounds.x, bounds.y + bounds.height, identity, 'left'),
    createLine(
      bounds.x + bounds.width,
      bounds.y,
      bounds.x + bounds.width,
      bounds.y + bounds.height,
      identity,
      'right',
    ),
  );
  for (const row of layout.rows) {
    if (parsed[row.sourceIndex]?.depth !== 0) continue;
    const centerX = row.bounds.x + row.bounds.width - DESIGN_TOKENS.space[3];
    const centerY = row.bounds.y + row.bounds.height / 2;
    const arm = Math.min(DESIGN_TOKENS.space[2], row.bounds.height * 0.22);
    const binding = rowData.bindings[row.sourceIndex];
    paths.push(
      createLine(
        centerX - arm,
        centerY,
        centerX + arm,
        centerY,
        identity,
        `indicator-${String(row.sourceIndex)}-horizontal`,
      ),
    );
    if (binding?.id !== layout.activeParentId) {
      paths.push(
        createLine(
          centerX,
          centerY - arm,
          centerX,
          centerY + arm,
          identity,
          `indicator-${String(row.sourceIndex)}-vertical`,
        ),
      );
    }
  }
  return paths.join(' ');
};
