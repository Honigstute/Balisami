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
      {...(typeof strokeStyle === 'string' ? { 'data-control-stroke-style': strokeStyle } : {})}
      preserveAspectRatio="xMidYMid meet"
      viewBox={`${String(viewBox.x)} ${String(viewBox.y)} ${String(viewBox.width)} ${String(viewBox.height)}`}
    >
      {hasFill ? (
        <rect
          className="scene-control__fill"
          height={projection.primitiveBounds.height}
          width={projection.primitiveBounds.width}
          x={projection.primitiveBounds.x}
          y={projection.primitiveBounds.y}
        />
      ) : null}
      {projection.outlinePath.length === 0 ? null : (
        <path className="scene-control__outline" d={projection.outlinePath} />
      )}
      {projection.markPath.length === 0 ? null : (
        <path className="scene-control__mark" d={projection.markPath} />
      )}
      {projection.textLayout === undefined ? null : (
        <text
          className="scene-control__text"
          dominantBaseline="alphabetic"
          fontSize={projection.textLayout.fontSize}
          textAnchor={projection.textLayout.textAnchor}
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
