import { useEffect, useState, type DragEvent } from 'react';

import { listPaletteControlSpecs, type ControlTypeId } from '../../domain';
import { ControlThumbnail } from './ControlThumbnail';
import { CONTROL_DRAG_MIME_TYPE } from './control-drag-transfer';
import {
  getBrowserControlTextMeasurementService,
  type ControlTextMeasurementService,
} from './control-text-measurement';

interface ControlShelfProps {
  readonly onInsert: (controlType: ControlTypeId) => boolean;
  /** Tests and non-browser hosts may inject the canonical synchronous service. */
  readonly textMeasurementService?: ControlTextMeasurementService;
}

/** Fixed slots prevent labels and preview geometry from resizing the shelf. */
export const ControlShelf = ({ onInsert, textMeasurementService }: ControlShelfProps) => {
  const [browserMeasurementService, setBrowserMeasurementService] = useState<
    ControlTextMeasurementService | undefined
  >();

  useEffect(() => {
    if (textMeasurementService !== undefined || document.fonts === undefined) {
      return;
    }
    let disposed = false;
    void getBrowserControlTextMeasurementService(document)
      .then((service) => {
        if (!disposed) {
          setBrowserMeasurementService(service);
        }
      })
      .catch(() => {
        // Renderer readiness consumes the same cached rejection and owns the actionable startup
        // failure. The fixed thumbnail slots remain stable while text projection is unavailable.
      });
    return () => {
      disposed = true;
    };
  }, [textMeasurementService]);

  const measurementService = textMeasurementService ?? browserMeasurementService;
  return (
    <div aria-label="Available controls" className="control-library" role="toolbar">
      {listPaletteControlSpecs().map((spec) => {
        const palette = spec.palette;
        if (palette === null) {
          return null;
        }
        return (
          <button
            aria-label={`Insert ${palette.label}`}
            className="control-library__item"
            draggable
            key={spec.type}
            onDragStart={(event: DragEvent<HTMLButtonElement>) => {
              event.dataTransfer.effectAllowed = 'copy';
              event.dataTransfer.setData(CONTROL_DRAG_MIME_TYPE, spec.type);
            }}
            onClick={() => onInsert(spec.type)}
            title={`Insert ${palette.label}`}
            type="button"
          >
            <ControlThumbnail definition={spec} textMeasurementService={measurementService} />
            <span className="control-library__label">{palette.label}</span>
          </button>
        );
      })}
    </div>
  );
};
