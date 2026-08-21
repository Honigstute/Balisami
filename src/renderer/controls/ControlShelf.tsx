import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';

import type { ControlTypeId } from '../../domain';
import { ControlThumbnail } from './ControlThumbnail';
import { CONTROL_DRAG_MIME_TYPE } from './control-drag-transfer';
import { queryControlLibrary, type ControlLibraryCategory } from './control-library-query';
import {
  getBrowserControlTextMeasurementService,
  type ControlTextMeasurementService,
} from './control-text-measurement';

interface ControlShelfProps {
  readonly category?: ControlLibraryCategory;
  readonly onInsert: (controlType: ControlTypeId) => boolean;
  readonly query?: string;
  /** Tests and non-browser hosts may inject the canonical synchronous service. */
  readonly textMeasurementService?: ControlTextMeasurementService;
}

/** Fixed slots prevent labels and preview geometry from resizing the shelf. */
export const ControlShelf = ({
  category = 'All',
  onInsert,
  query = '',
  textMeasurementService,
}: ControlShelfProps) => {
  const [browserMeasurementService, setBrowserMeasurementService] = useState<
    ControlTextMeasurementService | undefined
  >();
  const [focusedType, setFocusedType] = useState<ControlTypeId | undefined>();
  const rootRef = useRef<HTMLDivElement | null>(null);

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
  const definitions = queryControlLibrary({ category, query });
  const focusedIndex = definitions.findIndex(({ type }) => type === focusedType);
  const activeIndex = focusedIndex < 0 ? 0 : focusedIndex;
  const focusItem = (index: number): void => {
    const definition = definitions[index];
    if (definition === undefined) {
      return;
    }
    const item = rootRef.current?.querySelector<HTMLElement>(
      `[data-control-library-type='${definition.type}']`,
    );
    setFocusedType(definition.type);
    item?.focus({ preventScroll: true });
    item?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };
  const handleItemKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let targetIndex: number | undefined;
    if (event.key === 'ArrowRight') {
      targetIndex = Math.min(index + 1, definitions.length - 1);
    } else if (event.key === 'ArrowLeft') {
      targetIndex = Math.max(index - 1, 0);
    } else if (event.key === 'Home') {
      targetIndex = 0;
    } else if (event.key === 'End') {
      targetIndex = definitions.length - 1;
    }
    if (targetIndex === undefined || targetIndex === index) {
      return;
    }
    event.preventDefault();
    focusItem(targetIndex);
  };
  return (
    <div aria-label="Available controls" className="control-library" ref={rootRef} role="toolbar">
      {definitions.length === 0 ? (
        <div className="control-library__empty" role="status">
          No matching controls
        </div>
      ) : null}
      {definitions.map((spec, index) => {
        const palette = spec.palette;
        if (palette === null) {
          return null;
        }
        return (
          <button
            aria-label={`Insert ${palette.label}`}
            className="control-library__item"
            data-control-library-type={spec.type}
            draggable
            key={spec.type}
            onDragStart={(event: DragEvent<HTMLButtonElement>) => {
              event.dataTransfer.effectAllowed = 'copy';
              event.dataTransfer.setData(CONTROL_DRAG_MIME_TYPE, spec.type);
            }}
            onFocus={() => setFocusedType(spec.type)}
            onKeyDown={(event) => handleItemKeyDown(event, index)}
            onClick={() => onInsert(spec.type)}
            tabIndex={index === activeIndex ? 0 : -1}
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
