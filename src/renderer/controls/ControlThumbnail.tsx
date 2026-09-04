import type { ControlDefinition, ElementProperties } from '../../domain';
import { controlSceneHasFill } from './control-scene-geometry';
import type { ControlTextMeasurementService } from './control-text-measurement';
import { createControlThumbnailProjection } from './control-thumbnail-projection';
import { ControlSelectedRowFill, ControlSelectedRowText } from './ControlSelectedRow';
import { ControlRowMarkers } from './ControlRowMarkers';
import { ControlSceneFill } from './ControlSceneFill';

interface ControlThumbnailProps {
  readonly definition: ControlDefinition;
  readonly identity?: string;
  readonly properties?: ElementProperties;
  readonly textMeasurementService: ControlTextMeasurementService | undefined;
}

/** SVG preview of the same deterministic projection used by the document scene. */
export const ControlThumbnail = ({
  definition,
  identity,
  properties,
  textMeasurementService,
}: ControlThumbnailProps) => {
  const projection = createControlThumbnailProjection(
    definition,
    textMeasurementService,
    properties,
    identity,
  );
  if (projection === undefined) {
    return null;
  }
  const viewBox = projection.viewBox;
  const hasFill = controlSceneHasFill(definition);
  const strokeStyle = (properties ?? definition.defaultProperties).strokeStyle;
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
      {hasFill ? <ControlSceneFill projection={projection} /> : null}
      <ControlSelectedRowFill
        projection={projection.selectedRow}
        textLayout={projection.textLayout}
      />
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
          style={{
            ...(projection.markFillColor === undefined ? {} : { fill: projection.markFillColor }),
            ...(projection.markStrokeColor === undefined && projection.strokeColor === undefined
              ? {}
              : { stroke: projection.markStrokeColor ?? projection.strokeColor }),
          }}
        />
      )}
      <ControlRowMarkers rows={projection.rows} strokeColor={projection.strokeColor} />
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
      <ControlSelectedRowText
        projection={projection.selectedRow}
        textLayout={projection.textLayout}
      />
    </svg>
  );
};
