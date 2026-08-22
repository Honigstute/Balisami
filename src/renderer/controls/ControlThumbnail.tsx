import type { ControlDefinition } from '../../domain';
import { controlSceneHasFill } from './control-scene-geometry';
import type { ControlTextMeasurementService } from './control-text-measurement';
import { createControlThumbnailProjection } from './control-thumbnail-projection';

interface ControlThumbnailProps {
  readonly definition: ControlDefinition;
  readonly textMeasurementService: ControlTextMeasurementService | undefined;
}

/** SVG preview of the same deterministic projection used by the document scene. */
export const ControlThumbnail = ({ definition, textMeasurementService }: ControlThumbnailProps) => {
  const projection = createControlThumbnailProjection(definition, textMeasurementService);
  if (projection === undefined) {
    return null;
  }
  const viewBox = projection.viewBox;
  const hasFill = controlSceneHasFill(definition);
  const strokeStyle = definition.defaultProperties.strokeStyle;
  return (
    <svg
      aria-hidden="true"
      className="control-library__preview"
      data-control-thumbnail={definition.type}
      data-control-thumbnail-visual={definition.scene.kind}
      data-control-disabled={String(projection.disabled)}
      {...(typeof strokeStyle === 'string' ? { 'data-control-stroke-style': strokeStyle } : {})}
      preserveAspectRatio="xMidYMid meet"
      style={projection.opacity === undefined ? undefined : { opacity: projection.opacity }}
      viewBox={`${String(viewBox.x)} ${String(viewBox.y)} ${String(viewBox.width)} ${String(viewBox.height)}`}
    >
      {hasFill ? (
        <rect
          className="scene-control__fill"
          height={projection.primitiveBounds.height}
          width={projection.primitiveBounds.width}
          x={projection.primitiveBounds.x}
          y={projection.primitiveBounds.y}
          style={projection.fillColor === undefined ? undefined : { fill: projection.fillColor }}
        />
      ) : null}
      {!projection.borderVisible || projection.outlinePath.length === 0 ? null : (
        <path
          className="scene-control__outline"
          d={projection.outlinePath}
          style={
            projection.strokeColor === undefined ? undefined : { stroke: projection.strokeColor }
          }
        />
      )}
      {projection.markPath.length === 0 ? null : (
        <path
          className="scene-control__mark"
          d={projection.markPath}
          style={
            projection.strokeColor === undefined ? undefined : { stroke: projection.strokeColor }
          }
        />
      )}
      {projection.textLayout === undefined ? null : (
        <text
          className="scene-control__text"
          dominantBaseline="alphabetic"
          fontSize={projection.textLayout.fontSize}
          fontStyle={projection.textLayout.fontStyle}
          fontWeight={projection.textLayout.fontWeight}
          fill={projection.textLayout.color}
          textAnchor={projection.textLayout.textAnchor}
          textDecoration={projection.textLayout.textDecoration}
        >
          {projection.textLayout.lines.map((line, index) => (
            <tspan key={`${String(index)}:${line.text}`} x={line.x} y={line.baselineY}>
              {line.text}
            </tspan>
          ))}
        </text>
      )}
    </svg>
  );
};
