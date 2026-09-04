import { useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent } from 'react';

import type { BoardId, ElementLink, ProjectDocument } from '../../domain';
import { ControlSceneIcon } from '../controls/CatalogIcon';
import { ControlSelectedRowFill, ControlSelectedRowText } from '../controls/ControlSelectedRow';
import { ControlRowMarkers } from '../controls/ControlRowMarkers';
import { getBrowserControlTextMeasurementService } from '../controls/control-text-measurement';
import { Icon } from '../shell/Icon';
import { createBoardPresentationProjection } from './board-presentation-projection';
import { createPresentationHistory, reducePresentationHistory } from './presentation-history';
import type { ControlTextMeasurementService } from '../controls/control-text-measurement';

const FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  '[href]',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface PresentationViewProps {
  readonly assetUrls?: Readonly<Record<string, string>>;
  readonly document: ProjectDocument;
  readonly initialBoardId: BoardId;
  readonly onExit: () => void;
  readonly onOpenExternal: (url: string) => Promise<boolean>;
  /** Optional deterministic authority for tests/embedded presenters; browser font loading is default. */
  readonly textMeasurementService?: ControlTextMeasurementService;
}

const isActivationKey = (event: KeyboardEvent<SVGGElement>): boolean =>
  event.key === 'Enter' || event.key === ' ';

export const PresentationView = ({
  assetUrls = {},
  document,
  initialBoardId,
  onExit,
  onOpenExternal,
  textMeasurementService: providedTextMeasurementService,
}: PresentationViewProps) => {
  const [history, dispatch] = useReducer(
    reducePresentationHistory,
    initialBoardId,
    createPresentationHistory,
  );
  const [message, setMessage] = useState('');
  const [loadedTextMeasurementService, setLoadedTextMeasurementService] = useState<
    Awaited<ReturnType<typeof getBrowserControlTextMeasurementService>> | undefined
  >();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const surfaceRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const priorFocus =
      globalThis.document.activeElement instanceof HTMLElement
        ? globalThis.document.activeElement
        : null;
    closeRef.current?.focus();
    return () => priorFocus?.focus();
  }, []);
  useEffect(() => {
    dispatch({ boardIds: document.boardIds, type: 'reconcile' });
  }, [document.boardIds]);
  useEffect(() => {
    if (providedTextMeasurementService !== undefined) return;
    let disposed = false;
    void getBrowserControlTextMeasurementService()
      .then((service) => {
        if (!disposed) {
          setLoadedTextMeasurementService(service);
        }
      })
      .catch(() => {
        // Renderer readiness owns the actionable font problem; geometry remains presentable.
      });
    return () => {
      disposed = true;
    };
  }, [providedTextMeasurementService]);

  const textMeasurementService = providedTextMeasurementService ?? loadedTextMeasurementService;

  const projection = useMemo(
    () => createBoardPresentationProjection(document, history.current, textMeasurementService),
    [document, history, textMeasurementService],
  );
  const activateLink = (link: ElementLink): void => {
    setMessage('');
    if (link.kind === 'board') {
      if (!document.boardIds.includes(link.boardId)) {
        setMessage('That linked wireframe is currently in Trash.');
        return;
      }
      dispatch({ boardId: link.boardId, type: 'visit' });
      return;
    }
    void onOpenExternal(link.url)
      .then((opened) => {
        if (!opened) {
          setMessage('The web link could not be opened. Check your default browser and try again.');
        }
      })
      .catch(() => {
        setMessage('The web link could not be opened. Check your default browser and try again.');
      });
  };

  if (projection === undefined) {
    return null;
  }
  const title =
    projection.versionName === 'Official'
      ? projection.canonicalBoardName
      : `${projection.canonicalBoardName} · ${projection.versionName}`;

  return (
    <section
      aria-label="Wireframe presentation"
      aria-modal="true"
      className="presentation-view"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onExit();
          return;
        }
        if (event.altKey && event.key === 'ArrowLeft') {
          event.preventDefault();
          dispatch({ type: 'back' });
        } else if (event.altKey && event.key === 'ArrowRight') {
          event.preventDefault();
          dispatch({ type: 'forward' });
        } else if (event.key === 'Tab') {
          const focusable = Array.from(
            surfaceRef.current?.querySelectorAll<HTMLElement | SVGGraphicsElement>(
              FOCUSABLE_SELECTOR,
            ) ?? [],
          );
          const first = focusable[0];
          const last = focusable.at(-1);
          if (first === undefined || last === undefined) {
            event.preventDefault();
            surfaceRef.current?.focus();
          } else if (event.shiftKey && globalThis.document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && globalThis.document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }}
      ref={surfaceRef}
      role="dialog"
      tabIndex={-1}
    >
      <header className="presentation-view__toolbar">
        <div
          aria-label="Presentation history"
          className="presentation-view__history"
          role="toolbar"
        >
          <button
            aria-label="Back"
            className="icon-button icon-button--dark presentation-view__back"
            disabled={history.back.length === 0}
            onClick={() => dispatch({ type: 'back' })}
            title="Back (Alt+Left Arrow)"
            type="button"
          >
            <Icon name="chevron" />
          </button>
          <button
            aria-label="Forward"
            className="icon-button icon-button--dark presentation-view__forward"
            disabled={history.forward.length === 0}
            onClick={() => dispatch({ type: 'forward' })}
            title="Forward (Alt+Right Arrow)"
            type="button"
          >
            <Icon name="chevron" />
          </button>
        </div>
        <div className="presentation-view__identity">
          <strong>{title}</strong>
          <span>Presentation</span>
        </div>
        <button
          aria-label="Exit presentation"
          className="icon-button icon-button--dark"
          onClick={onExit}
          ref={closeRef}
          title="Exit presentation (Escape)"
          type="button"
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="presentation-view__stage">
        <div
          className="presentation-view__board"
          style={{
            aspectRatio: `${String(projection.viewBox.width)} / ${String(projection.viewBox.height)}`,
          }}
        >
          <svg
            aria-label={title}
            className="presentation-view__canvas"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            viewBox={`${String(projection.viewBox.x)} ${String(projection.viewBox.y)} ${String(projection.viewBox.width)} ${String(projection.viewBox.height)}`}
          >
            {projection.items.map((item) => {
              // Disabled controls retain their persisted link, but the projected
              // interaction is suspended until their registry state returns to normal.
              const isLinked = item.link !== null && !item.disabled;
              const assetId = item.visualKind === 'image' ? item.assetIds[0] : undefined;
              const imageUrl = assetId === undefined ? undefined : assetUrls[assetId];
              return (
                <g
                  aria-checked={item.checked}
                  aria-disabled={item.disabled}
                  aria-label={item.accessibleName}
                  className={isLinked ? 'presentation-view__linked-control' : undefined}
                  data-control-stroke-style={item.strokeStyle}
                  data-control-disabled={String(item.disabled)}
                  data-control-visual={item.visualKind}
                  data-presentation-element-id={item.id}
                  key={item.id}
                  onClick={isLinked ? () => activateLink(item.link as ElementLink) : undefined}
                  onKeyDown={
                    isLinked
                      ? (event) => {
                          if (isActivationKey(event)) {
                            event.preventDefault();
                            activateLink(item.link as ElementLink);
                          }
                        }
                      : undefined
                  }
                  opacity={item.opacity}
                  role={isLinked ? 'link' : item.role}
                  tabIndex={isLinked ? 0 : undefined}
                >
                  {isLinked ? (
                    <rect
                      className="presentation-view__link-hit-area"
                      height={item.bounds.height}
                      width={item.bounds.width}
                      x={item.bounds.x}
                      y={item.bounds.y}
                    />
                  ) : null}
                  {item.hasFill ? (
                    <rect
                      className="scene-control__fill"
                      height={item.primitiveBounds.height}
                      style={item.fillColor === undefined ? undefined : { fill: item.fillColor }}
                      width={item.primitiveBounds.width}
                      x={item.primitiveBounds.x}
                      y={item.primitiveBounds.y}
                    />
                  ) : null}
                  <ControlSelectedRowFill
                    projection={item.selectedRow}
                    textLayout={item.textLayout}
                  />
                  {imageUrl === undefined ? null : (
                    <image
                      className="scene-control__image"
                      height={item.bounds.height}
                      href={imageUrl}
                      preserveAspectRatio="xMidYMid meet"
                      width={item.bounds.width}
                      x={item.bounds.x}
                      y={item.bounds.y}
                    />
                  )}
                  {item.hasOutline && item.outlinePath.length > 0 ? (
                    <path
                      className="scene-control__outline"
                      d={item.outlinePath}
                      style={
                        item.strokeColor === undefined ? undefined : { stroke: item.strokeColor }
                      }
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  {imageUrl === undefined && item.markPath.length > 0 ? (
                    <path
                      className="scene-control__mark"
                      d={item.markPath}
                      style={
                        item.strokeColor === undefined ? undefined : { stroke: item.strokeColor }
                      }
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  <ControlRowMarkers rows={item.rows} strokeColor={item.strokeColor} />
                  {item.icon === undefined ? null : (
                    <ControlSceneIcon assetUrls={assetUrls} projection={item.icon} />
                  )}
                  {item.textLayout === undefined ? null : (
                    <text
                      className="scene-control__text"
                      dominantBaseline="alphabetic"
                      fontSize={item.textLayout.fontSize}
                      fontStyle={item.textLayout.fontStyle}
                      fontWeight={item.textLayout.fontWeight}
                      fill={item.textLayout.color}
                      textAnchor={item.textLayout.textAnchor}
                      textDecoration={item.textLayout.textDecoration}
                    >
                      {item.textLayout.lines.map((line, index) => (
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
                    projection={item.selectedRow}
                    textLayout={item.textLayout}
                  />
                  {item.disabled
                    ? null
                    : item.rowLinks.map((row) => (
                        <rect
                          aria-current={row.selected ? 'page' : undefined}
                          aria-label={row.label}
                          className="presentation-view__link-hit-area presentation-view__linked-control"
                          data-presentation-row-id={row.rowId}
                          height={row.bounds.height}
                          key={row.rowId}
                          onClick={(event) => {
                            event.stopPropagation();
                            activateLink(row.link);
                          }}
                          onKeyDown={(event) => {
                            if (isActivationKey(event)) {
                              event.preventDefault();
                              event.stopPropagation();
                              activateLink(row.link);
                            }
                          }}
                          role="link"
                          tabIndex={0}
                          width={row.bounds.width}
                          x={row.bounds.x}
                          y={row.bounds.y}
                        />
                      ))}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <p aria-live="polite" className="presentation-view__message" role="status">
        {message}
      </p>
    </section>
  );
};
