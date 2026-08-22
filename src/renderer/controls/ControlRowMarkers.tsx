import { DESIGN_TOKENS } from '../../shared/design-tokens';
import type { ControlRowSceneProjection } from './control-row-scene-projection';

interface ControlRowMarkersProps {
  readonly rows: readonly ControlRowSceneProjection[];
  readonly strokeColor: string | undefined;
}

/** Shared marker renderer; all geometry remains canonical in the scene projection. */
export const ControlRowMarkers = ({ rows, strokeColor }: ControlRowMarkersProps) => (
  <g className="scene-control__row-markers">
    {rows.map((row) =>
      row.marker === null ? null : (
        <g
          data-control-row-marker={row.id}
          key={row.id}
          opacity={row.disabled ? DESIGN_TOKENS.opacity.disabled : undefined}
        >
          <path
            className="scene-control__row-marker-stroke"
            d={row.marker.strokePath}
            style={strokeColor === undefined ? undefined : { stroke: strokeColor }}
          />
          {row.marker.fillPath.length === 0 ? null : (
            <path
              className="scene-control__row-marker-fill"
              d={row.marker.fillPath}
              style={strokeColor === undefined ? undefined : { fill: strokeColor }}
            />
          )}
        </g>
      ),
    )}
  </g>
);
