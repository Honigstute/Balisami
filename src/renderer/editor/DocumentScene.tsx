import { useCallback, useLayoutEffect, useRef } from 'react';

import {
  getControlAccessibleName,
  getControlSpec,
  type BoardId,
  type ElementId,
  type ProjectDocument,
} from '../../domain';
import { DESIGN_TOKENS } from '../../shared/design-tokens';
import {
  createControlSceneOutlinePath,
  controlSceneHasFill,
  controlSceneHasOutline,
} from '../controls/control-scene-geometry';
import { createControlSceneProjection } from '../controls/control-scene-projection';
import { syncControlSceneIconElement } from '../controls/control-scene-icon';
import type { ControlSceneTextLayout } from '../controls/control-scene-text-layout';
import {
  getBrowserControlTextMeasurementService,
  type ControlTextMeasurementService,
} from '../controls/control-text-measurement';
import type { ProjectAssetUrls } from '../projects/project-asset-urls';
import type { DocumentSceneItem, DocumentSceneModel } from './document-scene-model';
import type {
  KeyboardNudgeInteraction,
  KeyboardNudgeInteractionSnapshot,
} from './keyboard-nudge-interaction';
import type { MoveInteraction, MoveInteractionSnapshot } from './move-interaction';
import type { ResizeInteraction, ResizeInteractionSnapshot } from './resize-interaction';
import type { ViewportCameraStore } from './viewport-camera-store';

interface DocumentSceneProps {
  readonly activeBoardId: BoardId | undefined;
  readonly assetUrls?: ProjectAssetUrls;
  readonly camera: ViewportCameraStore;
  readonly document: ProjectDocument;
  readonly keyboardNudgeInteraction?: KeyboardNudgeInteraction;
  readonly model: DocumentSceneModel;
  readonly moveInteraction?: MoveInteraction;
  readonly resizeInteraction?: ResizeInteraction;
  /** Tests and non-browser hosts may inject the same deterministic measurement contract. */
  readonly textMeasurementService?: ControlTextMeasurementService;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const EMPTY_ASSET_URLS: ProjectAssetUrls = Object.freeze({});

type TranslationPreviewSnapshot =
  | Extract<KeyboardNudgeInteractionSnapshot, { readonly kind: 'nudging' }>
  | Extract<MoveInteractionSnapshot, { readonly kind: 'moving' }>;

class DocumentScenePresenter {
  readonly #canonicalItemsById = new Map<ElementId, DocumentSceneItem>();
  readonly #elementsById = new Map<ElementId, SVGGElement>();
  readonly #root: SVGGElement;
  #assetUrls: ProjectAssetUrls = EMPTY_ASSET_URLS;
  #cameraZoom = 1;
  #keyboardNudgeSnapshot: KeyboardNudgeInteractionSnapshot | undefined;
  #moveSnapshot: MoveInteractionSnapshot | undefined;
  #resizeSnapshot: ResizeInteractionSnapshot | undefined;
  #textMeasurementService: ControlTextMeasurementService | undefined;
  #visibleOrder: readonly ElementId[] = Object.freeze([]);

  constructor(root: SVGGElement) {
    this.#root = root;
  }

  clear(): void {
    this.#elementsById.clear();
    this.#canonicalItemsById.clear();
    this.#keyboardNudgeSnapshot = undefined;
    this.#moveSnapshot = undefined;
    this.#resizeSnapshot = undefined;
    this.#visibleOrder = Object.freeze([]);
    this.#root.replaceChildren();
  }

  sync(items: readonly DocumentSceneItem[]): void {
    const renderableItems = items.filter((item) => item.kind === 'object');
    const nextOrder = renderableItems.map((item) => item.id);
    const orderChanged =
      nextOrder.length !== this.#visibleOrder.length ||
      nextOrder.some((id, index) => id !== this.#visibleOrder[index]);
    const visibleIds = new Set(nextOrder);
    for (const [id, element] of this.#elementsById) {
      if (!visibleIds.has(id)) {
        element.remove();
        this.#elementsById.delete(id);
        this.#canonicalItemsById.delete(id);
      }
    }
    for (const item of renderableItems) {
      this.#canonicalItemsById.set(item.id, item);
      const element = this.#elementsById.get(item.id) ?? this.#createElement(item.id);
      if (element.dataset.sceneRevision !== item.revision) {
        this.#updateElement(element, item);
      }
      if (orderChanged) {
        this.#root.append(element);
      }
    }
    this.#visibleOrder = Object.freeze(nextOrder);
    this.#applyTranslationPreview();
    this.#applyResizePreview();
  }

  setKeyboardNudgePreview(snapshot: KeyboardNudgeInteractionSnapshot | undefined): void {
    const previousIds = this.#getTranslationPreview()?.affectedIds ?? Object.freeze([]);
    this.#keyboardNudgeSnapshot = snapshot;
    this.#clearInactiveTranslationIds(previousIds);
    this.#applyTranslationPreview();
  }

  setCameraZoom(zoom: number): void {
    if (this.#cameraZoom === zoom) {
      return;
    }
    this.#cameraZoom = zoom;
    for (const [id, item] of this.#canonicalItemsById) {
      const element = this.#elementsById.get(id);
      const hint = element?.children[6];
      if (hint?.localName === 'g') {
        this.#updateElementLinkHint(hint as SVGGElement, item.bounds, item);
      }
    }
    this.#applyResizePreview();
  }

  setResizePreview(snapshot: ResizeInteractionSnapshot | undefined): void {
    const previousId =
      this.#resizeSnapshot?.kind === 'resizing' ? this.#resizeSnapshot.elementId : undefined;
    const nextId = snapshot?.kind === 'resizing' ? snapshot.elementId : undefined;
    this.#resizeSnapshot = snapshot;
    if (previousId !== undefined && previousId !== nextId) {
      this.#restoreCanonicalElement(previousId);
    }
    this.#applyResizePreview();
  }

  setTextMeasurementService(service: ControlTextMeasurementService): void {
    if (this.#textMeasurementService === service) {
      return;
    }
    this.#textMeasurementService = service;
    for (const [id, item] of this.#canonicalItemsById) {
      const element = this.#elementsById.get(id);
      if (element !== undefined) {
        this.#updateElementGeometry(element, item.bounds, item.path, item.properties, item);
      }
    }
    this.#applyResizePreview();
  }

  setAssetUrls(assetUrls: ProjectAssetUrls): void {
    if (this.#assetUrls === assetUrls) {
      return;
    }
    this.#assetUrls = assetUrls;
    for (const [id, item] of this.#canonicalItemsById) {
      const element = this.#elementsById.get(id);
      if (element !== undefined) {
        this.#updateElementGeometry(element, item.bounds, item.path, item.properties, item);
      }
    }
  }

  setMovePreview(snapshot: MoveInteractionSnapshot | undefined): void {
    const previousIds = this.#getTranslationPreview()?.affectedIds ?? Object.freeze([]);
    this.#moveSnapshot = snapshot;
    this.#clearInactiveTranslationIds(previousIds);
    this.#applyTranslationPreview();
  }

  #clearInactiveTranslationIds(previousIds: readonly ElementId[]): void {
    const nextIds = new Set(this.#getTranslationPreview()?.affectedIds ?? []);
    for (const id of previousIds) {
      if (!nextIds.has(id)) {
        this.#elementsById.get(id)?.removeAttribute('transform');
      }
    }
  }

  #getTranslationPreview(): TranslationPreviewSnapshot | undefined {
    if (this.#keyboardNudgeSnapshot?.kind === 'nudging') {
      return this.#keyboardNudgeSnapshot;
    }
    if (this.#moveSnapshot?.kind === 'moving') {
      return this.#moveSnapshot;
    }
    return undefined;
  }

  #applyTranslationPreview(): void {
    const snapshot = this.#getTranslationPreview();
    if (snapshot === undefined) {
      return;
    }
    const transform = `translate(${String(snapshot.delta.x)} ${String(snapshot.delta.y)})`;
    for (const id of snapshot.affectedIds) {
      this.#elementsById.get(id)?.setAttribute('transform', transform);
    }
  }

  #applyResizePreview(): void {
    const snapshot = this.#resizeSnapshot;
    if (snapshot?.kind !== 'resizing') {
      return;
    }
    const element = this.#elementsById.get(snapshot.elementId);
    const item = this.#canonicalItemsById.get(snapshot.elementId);
    if (element === undefined || item === undefined) {
      return;
    }
    this.#updateElementGeometry(
      element,
      snapshot.worldBounds,
      createControlSceneOutlinePath(
        item.controlType,
        snapshot.worldBounds,
        snapshot.elementId,
        item.properties,
      ),
      item.properties,
      item,
    );
  }

  #restoreCanonicalElement(id: ElementId): void {
    const element = this.#elementsById.get(id);
    const item = this.#canonicalItemsById.get(id);
    if (element !== undefined && item !== undefined) {
      this.#updateElementGeometry(element, item.bounds, item.path, item.properties, item);
    }
  }

  #createElement(id: ElementId): SVGGElement {
    const element = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'g');
    const fill = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'rect');
    const image = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'image');
    const outline = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'path');
    const mark = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'path');
    const catalogIcon = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'g');
    const text = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'text');
    const linkHint = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'g');
    const linkHintBackground = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'circle');
    const linkHintGlyph = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'path');
    element.dataset.sceneElementId = id;
    fill.setAttribute('class', 'scene-control__fill');
    image.setAttribute('class', 'scene-control__image');
    outline.setAttribute('class', 'scene-control__outline');
    mark.setAttribute('class', 'scene-control__mark');
    catalogIcon.setAttribute('class', 'scene-control__catalog-icon');
    text.setAttribute('class', 'scene-control__text');
    linkHint.setAttribute('class', 'scene-control__link-hint');
    linkHintBackground.setAttribute('class', 'scene-control__link-hint-background');
    linkHintGlyph.setAttribute('class', 'scene-control__link-hint-glyph');
    linkHint.append(linkHintBackground, linkHintGlyph);
    element.append(fill, image, outline, mark, catalogIcon, text, linkHint);
    this.#elementsById.set(id, element);
    return element;
  }

  #updateElement(element: SVGGElement, item: DocumentSceneItem): void {
    const spec = getControlSpec(item.controlType);
    if (spec === undefined) {
      throw new Error(`Document scene presenter received unknown control '${item.controlType}'.`);
    }
    element.dataset.controlType = item.controlType;
    element.dataset.controlVisual = item.visualKind;
    element.setAttribute('aria-label', getControlAccessibleName(spec, item.properties));
    element.setAttribute('role', spec.accessibility.role);
    const checkedProperty = spec.accessibility.checkedProperty;
    if (checkedProperty === null) {
      element.removeAttribute('aria-checked');
    } else {
      element.setAttribute('aria-checked', String(item.properties[checkedProperty] === true));
    }
    this.#updateElementGeometry(element, item.bounds, item.path, item.properties, item);
    element.dataset.sceneRevision = item.revision;
  }

  #updateElementGeometry(
    element: SVGGElement,
    bounds: DocumentSceneItem['bounds'],
    path: string,
    properties: DocumentSceneItem['properties'],
    item: DocumentSceneItem,
  ): void {
    const fill = element.children[0];
    const image = element.children[1];
    const outline = element.children[2];
    const mark = element.children[3];
    const catalogIcon = element.children[4];
    const text = element.children[5];
    const linkHint = element.children[6];
    if (
      fill?.localName !== 'rect' ||
      image?.localName !== 'image' ||
      outline?.localName !== 'path' ||
      mark?.localName !== 'path' ||
      catalogIcon?.localName !== 'g' ||
      text?.localName !== 'text' ||
      linkHint?.localName !== 'g'
    ) {
      throw new Error('Document scene element structure was changed unexpectedly.');
    }
    const fillElement = fill as SVGRectElement;
    const imageElement = image as SVGImageElement;
    const outlineElement = outline as SVGPathElement;
    const markElement = mark as SVGPathElement;
    const catalogIconElement = catalogIcon as SVGGElement;
    const textElement = text as SVGTextElement;
    const linkHintElement = linkHint as SVGGElement;
    const spec = getControlSpec(item.controlType);
    if (spec === undefined) {
      throw new Error(`Document scene presenter received unknown control '${item.controlType}'.`);
    }
    const projection = createControlSceneProjection({
      bounds,
      definition: spec,
      identity: item.id,
      properties,
      textMeasurementService: this.#textMeasurementService,
    });
    const primitiveBounds = projection.primitiveBounds;
    fillElement.setAttribute('x', String(primitiveBounds.x));
    fillElement.setAttribute('y', String(primitiveBounds.y));
    fillElement.setAttribute('width', String(primitiveBounds.width));
    fillElement.setAttribute('height', String(primitiveBounds.height));
    outlineElement.setAttribute('d', path);
    const hasImage = this.#updateElementImage(imageElement, bounds, item);
    const markPath = hasImage ? '' : projection.markPath;
    markElement.setAttribute('d', markPath);
    markElement.setAttribute('display', markPath.length === 0 ? 'none' : 'inline');

    fillElement.setAttribute(
      'display',
      controlSceneHasFill(spec) && !(spec.scene.kind === 'image' && hasImage) ? 'inline' : 'none',
    );
    outlineElement.setAttribute(
      'display',
      controlSceneHasOutline(spec) &&
        (spec.scene.kind !== 'image' || properties.showBorder === true)
        ? 'inline'
        : 'none',
    );

    const color = properties.color ?? properties.borderColor;
    fillElement.style.removeProperty('fill');
    outlineElement.style.removeProperty('stroke');
    markElement.style.removeProperty('stroke');
    if (typeof color === 'string' && color !== 'default') {
      if (spec.scene.colorTarget === 'fill') {
        fillElement.style.fill = color;
      } else {
        outlineElement.style.stroke = color;
        markElement.style.stroke = color;
      }
    }
    element.style.opacity =
      typeof properties.opacity === 'number' ? String(properties.opacity) : '';
    const strokeStyle = properties.strokeStyle;
    if (typeof strokeStyle === 'string') {
      element.dataset.controlStrokeStyle = strokeStyle;
    } else {
      delete element.dataset.controlStrokeStyle;
    }
    if (typeof properties.borderMode === 'string') {
      element.dataset.controlBorderMode = properties.borderMode;
    } else {
      delete element.dataset.controlBorderMode;
    }
    if (typeof properties.showBorder === 'boolean') {
      element.dataset.controlShowBorder = String(properties.showBorder);
    } else {
      delete element.dataset.controlShowBorder;
    }

    syncControlSceneIconElement(catalogIconElement, projection.icon, this.#assetUrls);
    this.#updateElementText(textElement, projection.textLayout);
    this.#updateElementLinkHint(linkHintElement, bounds, item);
  }

  #updateElementImage(
    image: SVGImageElement,
    bounds: DocumentSceneItem['bounds'],
    item: DocumentSceneItem,
  ): boolean {
    const assetId = item.visualKind === 'image' ? item.assetIds[0] : undefined;
    const url = assetId === undefined ? undefined : this.#assetUrls[assetId];
    image.setAttribute('x', String(bounds.x));
    image.setAttribute('y', String(bounds.y));
    image.setAttribute('width', String(bounds.width));
    image.setAttribute('height', String(bounds.height));
    image.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (url === undefined) {
      image.removeAttribute('href');
      image.setAttribute('display', 'none');
      return false;
    }
    image.setAttribute('href', url);
    image.setAttribute('display', 'inline');
    return true;
  }

  #updateElementLinkHint(
    hint: SVGGElement,
    bounds: DocumentSceneItem['bounds'],
    item: DocumentSceneItem,
  ): void {
    const background = hint.children[0];
    const glyph = hint.children[1];
    if (background?.localName !== 'circle' || glyph?.localName !== 'path') {
      throw new Error('Document scene link hint structure was changed unexpectedly.');
    }
    if (item.link === null) {
      hint.setAttribute('display', 'none');
      delete hint.dataset.linkKind;
      delete hint.dataset.linkTarget;
      return;
    }

    const size = DESIGN_TOKENS.control.iconSize / this.#cameraZoom;
    const inset = DESIGN_TOKENS.editor.selectionHandleSize / this.#cameraZoom;
    const centerX = bounds.x + bounds.width - size / 2 - inset;
    const centerY = bounds.y + size / 2 + inset;
    const radius = size / 2;
    const unit = size / 8;
    (background as SVGCircleElement).setAttribute('cx', String(centerX));
    (background as SVGCircleElement).setAttribute('cy', String(centerY));
    (background as SVGCircleElement).setAttribute('r', String(radius));
    (glyph as SVGPathElement).setAttribute(
      'd',
      [
        `M ${String(centerX - unit * 2.5)} ${String(centerY + unit * 0.5)}`,
        `L ${String(centerX - unit)} ${String(centerY + unit * 2)}`,
        `A ${String(unit * 1.5)} ${String(unit * 1.5)} 0 0 0 ${String(centerX + unit)} ${String(centerY + unit * 2)}`,
        `L ${String(centerX + unit * 2)} ${String(centerY + unit)}`,
        `M ${String(centerX + unit * 2.5)} ${String(centerY - unit * 0.5)}`,
        `L ${String(centerX + unit)} ${String(centerY - unit * 2)}`,
        `A ${String(unit * 1.5)} ${String(unit * 1.5)} 0 0 0 ${String(centerX - unit)} ${String(centerY - unit * 2)}`,
        `L ${String(centerX - unit * 2)} ${String(centerY - unit)}`,
        `M ${String(centerX - unit)} ${String(centerY + unit)} L ${String(centerX + unit)} ${String(centerY - unit)}`,
      ].join(' '),
    );
    hint.dataset.linkKind = item.link.kind;
    hint.dataset.linkTarget = item.link.kind === 'board' ? item.link.boardId : item.link.url;
    hint.removeAttribute('display');
  }

  #updateElementText(
    textElement: SVGTextElement,
    layout: ControlSceneTextLayout | undefined,
  ): void {
    if (layout === undefined) {
      textElement.setAttribute('display', 'none');
      textElement.replaceChildren();
      return;
    }
    textElement.setAttribute('display', 'inline');
    textElement.setAttribute('dominant-baseline', 'alphabetic');
    textElement.setAttribute('font-size', String(layout.fontSize));
    textElement.setAttribute('text-anchor', layout.textAnchor);
    while (textElement.children.length > layout.lines.length) {
      textElement.lastElementChild?.remove();
    }
    layout.lines.forEach((line, index) => {
      const existing = textElement.children[index];
      const span =
        existing?.localName === 'tspan'
          ? (existing as SVGTSpanElement)
          : this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'tspan');
      if (existing === undefined) {
        textElement.append(span);
      } else if (existing !== span) {
        existing.replaceWith(span);
      }
      span.setAttribute('x', String(line.x));
      span.setAttribute('y', String(line.baselineY));
      span.textContent = line.text;
    });
  }
}

/** Imperative keyed scene updates keep camera motion outside React's render path. */
export const DocumentScene = ({
  activeBoardId,
  assetUrls = EMPTY_ASSET_URLS,
  camera,
  document,
  keyboardNudgeInteraction,
  model,
  moveInteraction,
  resizeInteraction,
  textMeasurementService,
}: DocumentSceneProps) => {
  const rootRef = useRef<SVGGElement | null>(null);
  const presenterRef = useRef<DocumentScenePresenter | undefined>(undefined);

  const syncVisibleItems = useCallback((): void => {
    const presenter = presenterRef.current;
    const transform = camera.getTransformSnapshot();
    presenter?.setCameraZoom(transform.zoom);
    presenter?.sync(model.queryVisible(transform, camera.getViewportSnapshot()));
  }, [camera, model]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    const presenter = new DocumentScenePresenter(root);
    presenterRef.current = presenter;
    return () => {
      presenter.clear();
      presenterRef.current = undefined;
    };
  }, []);

  useLayoutEffect(() => {
    const presenter = presenterRef.current;
    const ownerDocument = rootRef.current?.ownerDocument;
    if (presenter === undefined || ownerDocument === undefined) {
      return;
    }
    if (textMeasurementService !== undefined) {
      presenter.setTextMeasurementService(textMeasurementService);
      return;
    }
    if (ownerDocument.fonts === undefined) {
      return;
    }
    let disposed = false;
    void getBrowserControlTextMeasurementService(ownerDocument)
      .then((service) => {
        if (!disposed) {
          presenter.setTextMeasurementService(service);
        }
      })
      .catch(() => {
        // Renderer readiness consumes the same cached rejection and owns the actionable startup
        // failure. Avoid a second unhandled rejection from this presentation-only subscriber.
      });
    return () => {
      disposed = true;
    };
  }, [textMeasurementService]);

  useLayoutEffect(() => {
    model.reconcile(document, activeBoardId);
    syncVisibleItems();
  }, [activeBoardId, document, model, syncVisibleItems]);

  useLayoutEffect(() => {
    syncVisibleItems();
    return camera.subscribe(syncVisibleItems);
  }, [camera, syncVisibleItems]);

  useLayoutEffect(() => {
    presenterRef.current?.setAssetUrls(assetUrls);
  }, [assetUrls]);

  useLayoutEffect(() => {
    const apply = (): void =>
      presenterRef.current?.setKeyboardNudgePreview(keyboardNudgeInteraction?.getSnapshot());
    apply();
    return keyboardNudgeInteraction?.subscribe(apply);
  }, [keyboardNudgeInteraction]);

  useLayoutEffect(() => {
    const apply = (): void => presenterRef.current?.setMovePreview(moveInteraction?.getSnapshot());
    apply();
    return moveInteraction?.subscribe(apply);
  }, [moveInteraction]);

  useLayoutEffect(() => {
    const apply = (): void =>
      presenterRef.current?.setResizePreview(resizeInteraction?.getSnapshot());
    apply();
    return resizeInteraction?.subscribe(apply);
  }, [resizeInteraction]);

  return <g data-scene-content="document-elements" ref={rootRef} />;
};
