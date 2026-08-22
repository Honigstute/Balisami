import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';

import {
  CONTROL_TYPES,
  type ComponentDefinition,
  type ComponentId,
  type ControlTypeId,
  type ProjectDocument,
} from '../../domain';
import { ControlThumbnail } from './ControlThumbnail';
import { ComponentThumbnail } from './component-thumbnail';
import { COMPONENT_DRAG_MIME_TYPE, CONTROL_DRAG_MIME_TYPE } from './control-drag-transfer';
import {
  normalizeControlLibrarySearchText,
  queryControlLibrary,
  type ControlLibraryCategory,
} from './control-library-query';
import {
  getBrowserControlTextMeasurementService,
  type ControlTextMeasurementService,
} from './control-text-measurement';

interface ControlShelfProps {
  readonly assetUrls?: Readonly<Record<string, string>>;
  readonly category?: ControlLibraryCategory;
  readonly components?: readonly ComponentDefinition[];
  readonly projectDocument?: ProjectDocument;
  readonly onImportImage?: (file: File) => void;
  readonly onInsert: (controlType: ControlTypeId) => boolean;
  readonly onInsertComponent?: (componentId: ComponentId) => boolean;
  readonly query?: string;
  /** Tests and non-browser hosts may inject the canonical synchronous service. */
  readonly textMeasurementService?: ControlTextMeasurementService;
}

/** Fixed slots prevent labels and preview geometry from resizing the shelf. */
export const ControlShelf = ({
  assetUrls = {},
  category = 'All',
  components = [],
  projectDocument,
  onImportImage,
  onInsert,
  onInsertComponent,
  query = '',
  textMeasurementService,
}: ControlShelfProps) => {
  const [browserMeasurementService, setBrowserMeasurementService] = useState<
    ControlTextMeasurementService | undefined
  >();
  const [focusedKey, setFocusedKey] = useState<string>();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
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
  const normalizedQuery = normalizeControlLibrarySearchText(query);
  const matchingComponents =
    category !== 'All' && category !== 'Components'
      ? []
      : components.filter((component) => {
          if (normalizedQuery.length === 0) return true;
          const normalizedName = normalizeControlLibrarySearchText(component.name);
          return normalizedQuery.split(' ').every((token) => normalizedName.includes(token));
        });
  const availableComponents =
    projectDocument === undefined || onInsertComponent === undefined ? [] : matchingComponents;
  const itemKeys = [
    ...definitions.map((definition) => `control:${definition.type}`),
    ...availableComponents.map((component) => `component:${component.id}`),
  ];
  const focusedIndex = itemKeys.indexOf(focusedKey ?? '');
  const activeIndex = focusedIndex < 0 ? 0 : focusedIndex;
  const focusItem = (index: number): void => {
    const key = itemKeys[index];
    if (key === undefined) {
      return;
    }
    const item = rootRef.current?.querySelector<HTMLElement>(`[data-control-library-key='${key}']`);
    setFocusedKey(key);
    item?.focus({ preventScroll: true });
    item?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };
  const handleItemKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let targetIndex: number | undefined;
    if (event.key === 'ArrowRight') {
      targetIndex = Math.min(index + 1, itemKeys.length - 1);
    } else if (event.key === 'ArrowLeft') {
      targetIndex = Math.max(index - 1, 0);
    } else if (event.key === 'Home') {
      targetIndex = 0;
    } else if (event.key === 'End') {
      targetIndex = itemKeys.length - 1;
    }
    if (targetIndex === undefined || targetIndex === index) {
      return;
    }
    event.preventDefault();
    focusItem(targetIndex);
  };
  return (
    <div aria-label="Available controls" className="control-library" ref={rootRef} role="toolbar">
      {onImportImage === undefined ? null : (
        <input
          accept=".gif,.jpeg,.jpg,.png,image/gif,image/jpeg,image/png"
          aria-label="Choose image file"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file !== null && file !== undefined) {
              onImportImage(file);
            }
          }}
          ref={imageInputRef}
          type="file"
        />
      )}
      {itemKeys.length === 0 ? (
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
            data-control-library-key={`control:${spec.type}`}
            data-control-library-type={spec.type}
            draggable
            key={spec.type}
            onDragStart={(event: DragEvent<HTMLButtonElement>) => {
              event.dataTransfer.effectAllowed = 'copy';
              event.dataTransfer.setData(CONTROL_DRAG_MIME_TYPE, spec.type);
            }}
            onFocus={() => setFocusedKey(`control:${spec.type}`)}
            onKeyDown={(event) => handleItemKeyDown(event, index)}
            onClick={() => {
              if (spec.type === CONTROL_TYPES.imagePlaceholder && onImportImage !== undefined) {
                imageInputRef.current?.click();
              } else {
                onInsert(spec.type);
              }
            }}
            tabIndex={index === activeIndex ? 0 : -1}
            title={`Insert ${palette.label}`}
            type="button"
          >
            <ControlThumbnail definition={spec} textMeasurementService={measurementService} />
            <span className="control-library__label">{palette.label}</span>
          </button>
        );
      })}
      {projectDocument === undefined || onInsertComponent === undefined
        ? null
        : availableComponents.map((component, componentIndex) => {
            const index = definitions.length + componentIndex;
            return (
              <button
                aria-label={`Insert ${component.name}`}
                className="control-library__item"
                data-component-library-id={component.id}
                data-control-library-key={`component:${component.id}`}
                draggable
                key={component.id}
                onClick={() => onInsertComponent(component.id)}
                onDragStart={(event: DragEvent<HTMLButtonElement>) => {
                  event.dataTransfer.effectAllowed = 'copy';
                  event.dataTransfer.setData(COMPONENT_DRAG_MIME_TYPE, component.id);
                }}
                onFocus={() => setFocusedKey(`component:${component.id}`)}
                onKeyDown={(event) => handleItemKeyDown(event, index)}
                tabIndex={index === activeIndex ? 0 : -1}
                title={`Insert ${component.name}`}
                type="button"
              >
                <ComponentThumbnail
                  assetUrls={assetUrls}
                  component={component}
                  document={projectDocument}
                  {...(measurementService === undefined
                    ? {}
                    : { textMeasurementService: measurementService })}
                />
                <span className="control-library__label">{component.name}</span>
              </button>
            );
          })}
    </div>
  );
};
