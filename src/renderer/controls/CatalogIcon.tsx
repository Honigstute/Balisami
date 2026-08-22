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

export const CatalogSceneIcon = ({
  projection,
}: {
  readonly projection: ControlSceneIconProjection;
}) => (
  <g
    className="scene-control__catalog-icon"
    data-icon-id={projection.definition.id}
    transform={projection.transform}
  >
    <CatalogIconNodes definition={projection.definition} />
  </g>
);
