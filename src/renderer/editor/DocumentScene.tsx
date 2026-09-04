import { useCallback, useLayoutEffect, useRef } from 'react';

import {
  getControlAccessibleName,
  getControlSpec,
  type BoardId,
  type ElementId,
  type ProjectDocument,
} from '../../domain';
import { DESIGN_TOKENS } from '../../shared/design-tokens';
import { controlSceneHasFill, controlSceneHasOutline } from '../controls/control-scene-geometry';
import {
  createControlSceneProjection,
  type ControlSceneProjection,
} from '../controls/control-scene-projection';
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
      // Parsed-row rectangles use world geometry and stay valid across zoom.
      // Only a whole-control badge has constant-screen sizing.
      if (item.link === null) continue;
      const element = this.#elementsById.get(id);
      const hint = element?.children[9];
      if (hint?.localName === 'g') {
        this.#updateElementLinkBadge(hint as SVGGElement, item.bounds, item);
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
        this.#updateElementGeometry(element, item.bounds, item.properties, item);
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
        this.#updateElementGeometry(element, item.bounds, item.properties, item);
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
    this.#updateElementGeometry(element, snapshot.worldBounds, item.properties, item);
  }

  #restoreCanonicalElement(id: ElementId): void {
    const element = this.#elementsById.get(id);
    const item = this.#canonicalItemsById.get(id);
    if (element !== undefined && item !== undefined) {
      this.#updateElementGeometry(element, item.bounds, item.properties, item);
    }
  }

  #createElement(id: ElementId): SVGGElement {
    const element = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'g');
    const fill = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'rect');
    const image = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'image');
    const rowSelection = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'g');
    const rowSelectionFill = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'rect');
    const selectedRowText = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'text');
    const outline = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'path');
    const mark = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'path');
    const rowMarkers = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'g');
    const catalogIcon = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'g');
    const text = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'text');
    const linkHint = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'g');
    const linkHintBackground = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'circle');
    const linkHintGlyph = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'path');
    element.dataset.sceneElementId = id;
    fill.setAttribute('class', 'scene-control__fill');
    image.setAttribute('class', 'scene-control__image');
    rowSelection.setAttribute('class', 'scene-control__row-selection-layer');
    rowSelectionFill.setAttribute('class', 'scene-control__row-selection');
    selectedRowText.setAttribute('class', 'scene-control__selected-row-text');
    outline.setAttribute('class', 'scene-control__outline');
    mark.setAttribute('class', 'scene-control__mark');
    rowMarkers.setAttribute('class', 'scene-control__row-markers');
    catalogIcon.setAttribute('class', 'scene-control__catalog-icon');
    text.setAttribute('class', 'scene-control__text');
    linkHint.setAttribute('class', 'scene-control__link-hint');
    linkHintBackground.setAttribute('class', 'scene-control__link-hint-background');
    linkHintGlyph.setAttribute('class', 'scene-control__link-hint-glyph');
    rowSelection.append(rowSelectionFill);
    linkHint.append(linkHintBackground, linkHintGlyph);
    element.append(
      fill,
      image,
      rowSelection,
      outline,
      mark,
      rowMarkers,
      catalogIcon,
      text,
      selectedRowText,
      linkHint,
    );
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
    this.#updateElementGeometry(element, item.bounds, item.properties, item);
    element.dataset.sceneRevision = item.revision;
  }

  #updateElementGeometry(
    element: SVGGElement,
    bounds: DocumentSceneItem['bounds'],
    properties: DocumentSceneItem['properties'],
    item: DocumentSceneItem,
  ): void {
    const fill = element.children[0];
    const image = element.children[1];
    const rowSelection = element.children[2];
    const outline = element.children[3];
    const mark = element.children[4];
    const rowMarkers = element.children[5];
    const catalogIcon = element.children[6];
    const text = element.children[7];
    const selectedRowText = element.children[8];
    const linkHint = element.children[9];
    if (
      fill?.localName !== 'rect' ||
      image?.localName !== 'image' ||
      rowSelection?.localName !== 'g' ||
      outline?.localName !== 'path' ||
      mark?.localName !== 'path' ||
      rowMarkers?.localName !== 'g' ||
      catalogIcon?.localName !== 'g' ||
      text?.localName !== 'text' ||
      selectedRowText?.localName !== 'text' ||
      linkHint?.localName !== 'g'
    ) {
      throw new Error('Document scene element structure was changed unexpectedly.');
    }
    const fillElement = fill as SVGRectElement;
    const imageElement = image as SVGImageElement;
    const rowSelectionElement = rowSelection as SVGGElement;
    const outlineElement = outline as SVGPathElement;
    const markElement = mark as SVGPathElement;
    const rowMarkersElement = rowMarkers as SVGGElement;
    const catalogIconElement = catalogIcon as SVGGElement;
    const textElement = text as SVGTextElement;
    const selectedRowTextElement = selectedRowText as SVGTextElement;
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
      rowData: item.rowData,
      textMeasurementService: this.#textMeasurementService,
    });
    element.setAttribute('aria-disabled', String(projection.disabled));
    element.dataset.controlDisabled = String(projection.disabled);
    const primitiveBounds = projection.primitiveBounds;
    fillElement.setAttribute('x', String(primitiveBounds.x));
    fillElement.setAttribute('y', String(primitiveBounds.y));
    fillElement.setAttribute('width', String(primitiveBounds.width));
    fillElement.setAttribute('height', String(primitiveBounds.height));
    if (projection.fillRadiusX === undefined) fillElement.removeAttribute('rx');
    else fillElement.setAttribute('rx', String(projection.fillRadiusX));
    if (projection.fillRadiusY === undefined) fillElement.removeAttribute('ry');
    else fillElement.setAttribute('ry', String(projection.fillRadiusY));
    outlineElement.setAttribute('d', projection.outlinePath);
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
      controlSceneHasOutline(spec) && projection.borderVisible ? 'inline' : 'none',
    );

    fillElement.style.removeProperty('fill');
    outlineElement.style.removeProperty('stroke');
    markElement.style.removeProperty('stroke');
    if (projection.fillColor !== undefined) fillElement.style.fill = projection.fillColor;
    if (projection.strokeColor !== undefined) {
      outlineElement.style.stroke = projection.strokeColor;
      markElement.style.stroke = projection.strokeColor;
    }
    element.style.opacity = projection.opacity === undefined ? '' : String(projection.opacity);
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
    this.#updateElementRowMarkers(rowMarkersElement, projection);
    this.#updateElementRowSelection(rowSelectionElement, selectedRowTextElement, projection);
    this.#updateElementText(textElement, projection.textLayout);
    this.#updateElementLinkHint(linkHintElement, bounds, item, projection);
  }

  #updateElementRowSelection(
    layer: SVGGElement,
    textElement: SVGTextElement,
    projection: ControlSceneProjection,
  ): void {
    const fill = layer.children[0];
    if (fill?.localName !== 'rect' || layer.children.length !== 1) {
      throw new Error('Document row selection structure was changed unexpectedly.');
    }
    const fillElement = fill as SVGRectElement;
    const selected = projection.selectedRow;
    const showFill = selected?.appearance === 'fill';
    fillElement.setAttribute('display', showFill ? 'inline' : 'none');
    fillElement.style.removeProperty('fill');
    if (showFill && selected !== undefined) {
      fillElement.setAttribute('x', String(selected.bounds.x));
      fillElement.setAttribute('y', String(selected.bounds.y));
      fillElement.setAttribute('width', String(selected.bounds.width));
      fillElement.setAttribute('height', String(selected.bounds.height));
      if (selected.color !== undefined) fillElement.style.fill = selected.color;
    }

    const textLayout = projection.textLayout;
    const showText = selected?.appearance === 'text' && textLayout !== undefined;
    textElement.setAttribute('display', showText ? 'inline' : 'none');
    textElement.style.removeProperty('fill');
    if (showText && selected !== undefined && textLayout !== undefined) {
      textElement.textContent = selected.label;
      textElement.setAttribute('x', String(selected.labelX));
      textElement.setAttribute('y', String(selected.baselineY));
      textElement.setAttribute('font-size', String(textLayout.fontSize));
      textElement.setAttribute('font-style', textLayout.fontStyle);
      textElement.setAttribute('font-weight', textLayout.fontWeight);
      textElement.setAttribute('text-anchor', 'start');
      textElement.setAttribute('text-decoration', textLayout.textDecoration);
      if (selected.color !== undefined) textElement.style.fill = selected.color;
    }
  }

  #updateElementRowMarkers(layer: SVGGElement, projection: ControlSceneProjection): void {
    layer.replaceChildren();
    for (const row of projection.rows) {
      const decoration = row.marker ?? row.adornment;
      if (decoration === null) continue;
      const marker = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'g');
      const stroke = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'path');
      if (row.marker !== null) marker.dataset.controlRowMarker = row.id;
      if (row.adornment !== null) marker.dataset.controlRowAdornment = row.id;
      if (row.disabled) marker.setAttribute('opacity', String(DESIGN_TOKENS.opacity.disabled));
      stroke.setAttribute('class', 'scene-control__row-marker-stroke');
      stroke.setAttribute('d', decoration.strokePath);
      if (projection.strokeColor !== undefined) stroke.style.stroke = projection.strokeColor;
      marker.append(stroke);
      if (decoration.fillPath.length > 0) {
        const fill = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'path');
        fill.setAttribute('class', 'scene-control__row-marker-fill');
        fill.setAttribute('d', decoration.fillPath);
        if (projection.strokeColor !== undefined) fill.style.fill = projection.strokeColor;
        marker.append(fill);
      }
      layer.append(marker);
    }
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
    projection: ControlSceneProjection,
  ): void {
    while (hint.children.length > 2) hint.lastElementChild?.remove();
    const rowLinks = projection.rows.filter((row) => row.link !== null && !row.disabled);
    for (const row of rowLinks) {
      const rowHint = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'rect');
      rowHint.setAttribute('class', 'scene-control__row-link-hint');
      rowHint.setAttribute('x', String(row.bounds.x));
      rowHint.setAttribute('y', String(row.bounds.y));
      rowHint.setAttribute('width', String(row.bounds.width));
      rowHint.setAttribute('height', String(row.bounds.height));
      rowHint.dataset.rowId = row.id;
      if (row.link !== null) {
        rowHint.dataset.linkKind = row.link.kind;
        rowHint.dataset.linkTarget = row.link.kind === 'board' ? row.link.boardId : row.link.url;
      }
      hint.append(rowHint);
    }
    this.#updateElementLinkBadge(hint, bounds, item);
  }

  /** Zoom-only path: update the constant-screen badge without measuring or rebuilding rows. */
  #updateElementLinkBadge(
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
      background.setAttribute('display', 'none');
      glyph.setAttribute('display', 'none');
      hint.setAttribute('display', 'none');
      delete hint.dataset.linkKind;
      delete hint.dataset.linkTarget;
      if (hint.children.length > 2) hint.removeAttribute('display');
      return;
    }

    background.removeAttribute('display');
    glyph.removeAttribute('display');

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
    textElement.setAttribute('font-style', layout.fontStyle);
    textElement.setAttribute('font-weight', layout.fontWeight);
    textElement.setAttribute('text-anchor', layout.textAnchor);
    textElement.setAttribute('text-decoration', layout.textDecoration);
    if (layout.color === undefined) textElement.style.removeProperty('fill');
    else textElement.style.fill = layout.color;
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
      if (line.fontSize === undefined) span.removeAttribute('font-size');
      else span.setAttribute('font-size', String(line.fontSize));
      if (line.fontWeight === undefined) span.removeAttribute('font-weight');
      else span.setAttribute('font-weight', line.fontWeight);
      if (line.opacity === undefined) span.removeAttribute('opacity');
      else span.setAttribute('opacity', String(line.opacity));
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
