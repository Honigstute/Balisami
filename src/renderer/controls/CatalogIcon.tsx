import { createElement, type ReactElement } from 'react';

import {
  getIconDefinition,
  type IconDefinition,
  type IconNode,
} from '../../shared/icons/icon-catalog';
import type { ControlSceneIconProjection } from './control-scene-icon';

const renderNode = (node: IconNode, index: number): ReactElement =>
  createElement(node[0] as 'path', { ...node[1], key: `${node[0]}:${String(index)}` });

const CatalogIconNodes = ({ definition }: { readonly definition: IconDefinition }) => (
  <>{definition.nodes.map(renderNode)}</>
);

export const CatalogIconPreview = ({
  className,
  iconId,
}: {
  readonly className?: string;
  readonly iconId: string;
}) => {
  const definition = getIconDefinition(iconId);
  if (definition === undefined || definition.id !== iconId) {
    return null;
  }
  return (
    <svg
      aria-hidden="true"
      className={className === undefined ? 'catalog-icon' : `catalog-icon ${className}`}
      viewBox="0 0 24 24"
    >
      <CatalogIconNodes definition={definition} />
    </svg>
  );
};

export const ControlSceneIcon = ({
  assetUrls = {},
  projection,
}: {
  readonly assetUrls?: Readonly<Record<string, string>>;
  readonly projection: ControlSceneIconProjection;
}) => {
  const customUrl = projection.kind === 'asset' ? assetUrls[projection.assetId] : undefined;
  if (projection.kind === 'asset' && customUrl === undefined) {
    return null;
  }
  return (
    <g
      className="scene-control__catalog-icon"
      data-icon-id={projection.id}
      transform={projection.transform}
    >
      {projection.kind === 'catalog' ? (
        <CatalogIconNodes definition={projection.definition} />
      ) : (
        <image
          height="24"
          href={customUrl}
          preserveAspectRatio="xMidYMid meet"
          width="24"
          x="0"
          y="0"
        />
      )}
    </g>
  );
};
