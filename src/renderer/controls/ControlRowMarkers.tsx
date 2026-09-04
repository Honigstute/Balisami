import { DESIGN_TOKENS } from '../../shared/design-tokens';
import type { ControlRowSceneProjection } from './control-row-scene-projection';

interface ControlRowMarkersProps {
  readonly rows: readonly ControlRowSceneProjection[];
  readonly strokeColor: string | undefined;
}

/** Shared row-decoration renderer; all geometry remains canonical in the scene projection. */
export const ControlRowMarkers = ({ rows, strokeColor }: ControlRowMarkersProps) => (
  <g className="scene-control__row-markers">
    {rows.map((row) => {
      const decoration = row.marker ?? row.adornment;
      return decoration === null ? null : (
        <g
          data-control-row-adornment={row.adornment === null ? undefined : row.id}
          data-control-row-marker={row.marker === null ? undefined : row.id}
          key={row.id}
          opacity={row.disabled ? DESIGN_TOKENS.opacity.disabled : undefined}
        >
          <path
            className="scene-control__row-marker-stroke"
            d={decoration.strokePath}
            style={strokeColor === undefined ? undefined : { stroke: strokeColor }}
          />
          {decoration.fillPath.length === 0 ? null : (
            <path
              className="scene-control__row-marker-fill"
              d={decoration.fillPath}
              style={strokeColor === undefined ? undefined : { fill: strokeColor }}
            />
          )}
        </g>
      );
    })}
  </g>
);
