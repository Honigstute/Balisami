import { useSyncExternalStore } from 'react';

import type { BoardId } from '../../domain';
import { ControlSceneIcon } from '../controls/CatalogIcon';
import { BOARD_THUMBNAIL_LOADING, type BoardThumbnailStore } from './board-thumbnail-store';

interface BoardThumbnailProps {
  readonly assetUrls?: Readonly<Record<string, string>>;
  readonly boardId: BoardId;
  readonly store?: BoardThumbnailStore;
}

const subscribeToNothing = (): (() => void) => () => undefined;

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
      <svg
        preserveAspectRatio="xMidYMid meet"
        viewBox={`${String(viewBox.x)} ${String(viewBox.y)} ${String(viewBox.width)} ${String(viewBox.height)}`}
      >
        {items.map((item) => {
          const assetId = item.visualKind === 'image' ? item.assetIds[0] : undefined;
          const imageUrl = assetId === undefined ? undefined : assetUrls[assetId];
          return (
            <g
              data-control-stroke-style={item.strokeStyle}
              data-control-visual={item.visualKind}
              key={item.id}
            >
              {item.hasFill ? (
                <rect
                  className="scene-control__fill"
                  height={item.primitiveBounds.height}
                  width={item.primitiveBounds.width}
                  x={item.primitiveBounds.x}
                  y={item.primitiveBounds.y}
                />
              ) : null}
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
                />
              ) : null}
              {imageUrl === undefined && item.markPath.length > 0 ? (
                <path
                  className="scene-control__mark"
                  d={item.markPath}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {item.icon === undefined ? null : (
                <ControlSceneIcon assetUrls={assetUrls} projection={item.icon} />
              )}
              {item.textLayout === undefined ? null : (
                <text
                  className="scene-control__text"
                  dominantBaseline="alphabetic"
                  fontSize={item.textLayout.fontSize}
                  textAnchor={item.textLayout.textAnchor}
                >
                  {item.textLayout.lines.map((line, index) => (
                    <tspan key={`${String(index)}:${line.text}`} x={line.x} y={line.baselineY}>
                      {line.text}
                    </tspan>
                  ))}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </span>
  );
};
