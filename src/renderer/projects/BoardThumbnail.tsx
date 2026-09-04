import { useSyncExternalStore, type ComponentPropsWithoutRef } from 'react';

import type { BoardId } from '../../domain';
import { ControlSceneIcon } from '../controls/CatalogIcon';
import { ControlSelectedRowFill, ControlSelectedRowText } from '../controls/ControlSelectedRow';
import { ControlRowMarkers } from '../controls/ControlRowMarkers';
import { BOARD_THUMBNAIL_LOADING, type BoardThumbnailStore } from './board-thumbnail-store';
import type { BoardThumbnailItem } from './board-thumbnail-projection';
import type { WorldRect } from '../editor/viewport-transform';

interface BoardThumbnailProps {
  readonly assetUrls?: Readonly<Record<string, string>>;
  readonly boardId: BoardId;
  readonly store?: BoardThumbnailStore;
}

const subscribeToNothing = (): (() => void) => () => undefined;

interface ThumbnailSceneSvgProps extends Omit<
  ComponentPropsWithoutRef<'svg'>,
  'children' | 'viewBox'
> {
  readonly assetUrls?: Readonly<Record<string, string>>;
  readonly items: readonly BoardThumbnailItem[];
  readonly viewBox: WorldRect;
}

/** Shared primitive renderer for board and reusable-component thumbnails. */
export const ThumbnailSceneSvg = ({
  assetUrls = {},
  items,
  viewBox,
  ...svgProps
}: ThumbnailSceneSvgProps) => (
  <svg
    {...svgProps}
    preserveAspectRatio="xMidYMid meet"
    viewBox={`${String(viewBox.x)} ${String(viewBox.y)} ${String(viewBox.width)} ${String(viewBox.height)}`}
  >
    {items.map((item) => {
      const assetId = item.visualKind === 'image' ? item.assetIds[0] : undefined;
      const imageUrl = assetId === undefined ? undefined : assetUrls[assetId];
      return (
        <g
          data-control-stroke-style={item.strokeStyle}
          data-control-disabled={String(item.disabled)}
          data-control-visual={item.visualKind}
          key={item.id}
          opacity={item.opacity}
        >
          {item.hasFill ? (
            <rect
              className="scene-control__fill"
              height={item.primitiveBounds.height}
              rx={item.fillRadiusX}
              ry={item.fillRadiusY}
              width={item.primitiveBounds.width}
              x={item.primitiveBounds.x}
              y={item.primitiveBounds.y}
              style={item.fillColor === undefined ? undefined : { fill: item.fillColor }}
            />
          ) : null}
          <ControlSelectedRowFill projection={item.selectedRow} textLayout={item.textLayout} />
          {imageUrl === undefined ? null : (
            <image
              className="scene-control__image"
              height={item.bounds.height}
              href={imageUrl}
              preserveAspectRatio="xMidYMid meet"
              width={item.bounds.width}
              x={item.bounds.x}
              y={item.bounds.y}
            />
          )}
          {item.hasOutline && item.outlinePath.length > 0 ? (
            <path
              className="scene-control__outline"
              d={item.outlinePath}
              vectorEffect="non-scaling-stroke"
              style={item.strokeColor === undefined ? undefined : { stroke: item.strokeColor }}
            />
          ) : null}
          {imageUrl === undefined && item.markPath.length > 0 ? (
            <path
              className="scene-control__mark"
              d={item.markPath}
              vectorEffect="non-scaling-stroke"
              style={item.strokeColor === undefined ? undefined : { stroke: item.strokeColor }}
            />
          ) : null}
          <ControlRowMarkers rows={item.rows} strokeColor={item.strokeColor} />
          {item.icon === undefined ? null : (
            <ControlSceneIcon assetUrls={assetUrls} projection={item.icon} />
          )}
          {item.textLayout === undefined ? null : (
            <text
              className="scene-control__text"
              dominantBaseline="alphabetic"
              fontSize={item.textLayout.fontSize}
              fontStyle={item.textLayout.fontStyle}
              fontWeight={item.textLayout.fontWeight}
              fill={item.textLayout.color}
              textAnchor={item.textLayout.textAnchor}
              textDecoration={item.textLayout.textDecoration}
            >
              {item.textLayout.lines.map((line, index) => (
                <tspan
                  key={`${String(index)}:${line.text}`}
                  fontSize={line.fontSize}
                  fontWeight={line.fontWeight}
                  opacity={line.opacity}
                  x={line.x}
                  y={line.baselineY}
                >
                  {line.text}
                </tspan>
              ))}
            </text>
          )}
          <ControlSelectedRowText projection={item.selectedRow} textLayout={item.textLayout} />
        </g>
      );
    })}
  </svg>
);

export const BoardThumbnail = ({ assetUrls = {}, boardId, store }: BoardThumbnailProps) => {
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? subscribeToNothing,
    () => store?.getSnapshot(boardId) ?? BOARD_THUMBNAIL_LOADING,
    () => store?.getSnapshot(boardId) ?? BOARD_THUMBNAIL_LOADING,
  );
  if (snapshot.status !== 'ready') {
    return (
      <span
        aria-hidden="true"
        className="wireframe-list__thumbnail"
        data-thumbnail-state={snapshot.status}
      >
        <span />
        <span />
        <span />
      </span>
    );
  }
  const { items, viewBox } = snapshot.projection;
  return (
    <span aria-hidden="true" className="wireframe-list__thumbnail" data-thumbnail-state="ready">
      <ThumbnailSceneSvg assetUrls={assetUrls} items={items} viewBox={viewBox} />
    </span>
  );
};
