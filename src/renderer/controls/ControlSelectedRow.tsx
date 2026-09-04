import type { ControlSceneTextLayout } from './control-scene-text-layout';
import type { ControlSelectedRowProjection } from './control-scene-projection';

interface ControlSelectedRowProps {
  readonly projection: ControlSelectedRowProjection | undefined;
  readonly textLayout: ControlSceneTextLayout | undefined;
}

/** Selected segment fill is projected before outlines and text on every surface. */
export const ControlSelectedRowFill = ({ projection }: ControlSelectedRowProps) =>
  projection?.appearance !== 'fill' ? null : (
    <rect
      className="scene-control__row-selection"
      height={projection.bounds.height}
      style={{
        ...(projection.color === undefined ? {} : { fill: projection.color }),
        ...(projection.fillOpacity === undefined ? {} : { fillOpacity: projection.fillOpacity }),
      }}
      width={projection.bounds.width}
      x={projection.bounds.x}
      y={projection.bounds.y}
    />
  );

/** Selected inline text overlays only the exact measured label span. */
export const ControlSelectedRowText = ({ projection, textLayout }: ControlSelectedRowProps) =>
  projection?.appearance !== 'text' || textLayout === undefined ? null : (
    <text
      className="scene-control__selected-row-text"
      dominantBaseline="alphabetic"
      fill={projection.color}
      fontSize={textLayout.fontSize}
      fontStyle={textLayout.fontStyle}
      fontWeight={textLayout.fontWeight}
      textAnchor="start"
      textDecoration={textLayout.textDecoration}
    >
      <tspan x={projection.labelX} y={projection.baselineY}>
        {projection.label}
      </tspan>
    </text>
  );
