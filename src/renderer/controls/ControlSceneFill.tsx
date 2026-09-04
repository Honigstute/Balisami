import type { ControlSceneProjection } from './control-scene-projection';

interface ControlSceneFillProps {
  readonly projection: Pick<
    ControlSceneProjection,
    'fillColor' | 'fillPath' | 'fillRadiusX' | 'fillRadiusY' | 'primitiveBounds'
  >;
}

/** Renders either the ordinary primitive rectangle or a definition-projected silhouette. */
export const ControlSceneFill = ({ projection }: ControlSceneFillProps) => {
  const style = projection.fillColor === undefined ? undefined : { fill: projection.fillColor };
  if (projection.fillPath.length > 0) {
    return <path className="scene-control__fill" d={projection.fillPath} style={style} />;
  }
  return (
    <rect
      className="scene-control__fill"
      height={projection.primitiveBounds.height}
      rx={projection.fillRadiusX}
      ry={projection.fillRadiusY}
      width={projection.primitiveBounds.width}
      x={projection.primitiveBounds.x}
      y={projection.primitiveBounds.y}
      style={style}
    />
  );
};
