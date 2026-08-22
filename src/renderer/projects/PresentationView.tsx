import { useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent } from 'react';

import type { BoardId, ElementLink, ProjectDocument } from '../../domain';
import { getBrowserControlTextMeasurementService } from '../controls/control-text-measurement';
import { Icon } from '../shell/Icon';
import { createBoardPresentationProjection } from './board-presentation-projection';
import { createPresentationHistory, reducePresentationHistory } from './presentation-history';

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
}

const isActivationKey = (event: KeyboardEvent<SVGGElement>): boolean =>
  event.key === 'Enter' || event.key === ' ';

export const PresentationView = ({
  assetUrls = {},
  document,
  initialBoardId,
  onExit,
  onOpenExternal,
}: PresentationViewProps) => {
  const [history, dispatch] = useReducer(
    reducePresentationHistory,
    initialBoardId,
    createPresentationHistory,
  );
  const [message, setMessage] = useState('');
  const [textMeasurementService, setTextMeasurementService] = useState<
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
    let disposed = false;
    void getBrowserControlTextMeasurementService()
      .then((service) => {
        if (!disposed) {
          setTextMeasurementService(service);
        }
      })
      .catch(() => {
        // Renderer readiness owns the actionable font problem; geometry remains presentable.
      });
    return () => {
      disposed = true;
    };
  }, []);

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
              const isLinked = item.link !== null;
              const assetId = item.visualKind === 'image' ? item.assetIds[0] : undefined;
              const imageUrl = assetId === undefined ? undefined : assetUrls[assetId];
              const strokeColor = item.visualKind === 'browser' ? undefined : item.color;
              const fillColor = item.visualKind === 'browser' ? item.color : undefined;
              return (
                <g
                  aria-checked={item.checked}
                  aria-label={item.accessibleName}
                  className={isLinked ? 'presentation-view__linked-control' : undefined}
                  data-control-stroke-style={item.strokeStyle}
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
                      style={fillColor === undefined ? undefined : { fill: fillColor }}
                      width={item.primitiveBounds.width}
                      x={item.primitiveBounds.x}
                      y={item.primitiveBounds.y}
                    />
                  ) : null}
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
                      style={strokeColor === undefined ? undefined : { stroke: strokeColor }}
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  {imageUrl === undefined && item.markPath.length > 0 ? (
                    <path
                      className="scene-control__mark"
                      d={item.markPath}
                      style={strokeColor === undefined ? undefined : { stroke: strokeColor }}
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  {item.textLayout === undefined ? null : (
                    <text
                      className="scene-control__text"
                      dominantBaseline="alphabetic"
                      fontSize={item.textLayout.fontSize}
                      textAnchor={item.textLayout.textAnchor}
                    >
                      {item.textLayout.lines.map((line, index) => (
                        <tspan key={`${String(index)}:${line.text}`} x={line.x} y={line.baselineY}>
                          {line.text}
                        </tspan>
                      ))}
                    </text>
                  )}
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
