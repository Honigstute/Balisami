import { useCallback, useLayoutEffect, useRef } from 'react';

import type { BoardId, ElementId, ProjectDocument } from '../../domain';
import type { DocumentSceneItem, DocumentSceneModel } from './document-scene-model';
import type {
  KeyboardNudgeInteraction,
  KeyboardNudgeInteractionSnapshot,
} from './keyboard-nudge-interaction';
import type { MoveInteraction, MoveInteractionSnapshot } from './move-interaction';
import type { ResizeInteraction, ResizeInteractionSnapshot } from './resize-interaction';
import { createSeededSketchRectPath } from './seeded-sketch';
import type { ViewportCameraStore } from './viewport-camera-store';

interface DocumentSceneProps {
  readonly activeBoardId: BoardId | undefined;
  readonly camera: ViewportCameraStore;
  readonly document: ProjectDocument;
  readonly keyboardNudgeInteraction?: KeyboardNudgeInteraction;
  readonly model: DocumentSceneModel;
  readonly moveInteraction?: MoveInteraction;
  readonly resizeInteraction?: ResizeInteraction;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

type TranslationPreviewSnapshot =
  | Extract<KeyboardNudgeInteractionSnapshot, { readonly kind: 'nudging' }>
  | Extract<MoveInteractionSnapshot, { readonly kind: 'moving' }>;

class DocumentScenePresenter {
  readonly #canonicalItemsById = new Map<ElementId, DocumentSceneItem>();
  readonly #elementsById = new Map<ElementId, SVGGElement>();
  readonly #root: SVGGElement;
  #keyboardNudgeSnapshot: KeyboardNudgeInteractionSnapshot | undefined;
  #moveSnapshot: MoveInteractionSnapshot | undefined;
  #resizeSnapshot: ResizeInteractionSnapshot | undefined;
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
    if (element === undefined) {
      return;
    }
    this.#updateElementGeometry(
      element,
      snapshot.worldBounds,
      createSeededSketchRectPath(snapshot.worldBounds, snapshot.elementId),
    );
  }

  #restoreCanonicalElement(id: ElementId): void {
    const element = this.#elementsById.get(id);
    const item = this.#canonicalItemsById.get(id);
    if (element !== undefined && item !== undefined) {
      this.#updateElementGeometry(element, item.bounds, item.path);
    }
  }

  #createElement(id: ElementId): SVGGElement {
    const element = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'g');
    const fill = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'rect');
    const outline = this.#root.ownerDocument.createElementNS(SVG_NAMESPACE, 'path');
    element.dataset.sceneElementId = id;
    fill.setAttribute('class', 'scene-foundation-rectangle__fill');
    outline.setAttribute('class', 'scene-foundation-rectangle__outline');
    element.append(fill, outline);
    this.#elementsById.set(id, element);
    return element;
  }

  #updateElement(element: SVGGElement, item: DocumentSceneItem): void {
    this.#updateElementGeometry(element, item.bounds, item.path);
    element.dataset.sceneRevision = item.revision;
  }

  #updateElementGeometry(
    element: SVGGElement,
    bounds: DocumentSceneItem['bounds'],
    path: string,
  ): void {
    const fill = element.children[0];
    const outline = element.children[1];
    if (fill?.localName !== 'rect' || outline?.localName !== 'path') {
      throw new Error('Document scene element structure was changed unexpectedly.');
    }
    const fillElement = fill as SVGRectElement;
    const outlineElement = outline as SVGPathElement;
    fillElement.setAttribute('x', String(bounds.x));
    fillElement.setAttribute('y', String(bounds.y));
    fillElement.setAttribute('width', String(bounds.width));
    fillElement.setAttribute('height', String(bounds.height));
    outlineElement.setAttribute('d', path);
  }
}

/** Imperative keyed scene updates keep camera motion outside React's render path. */
export const DocumentScene = ({
  activeBoardId,
  camera,
  document,
  keyboardNudgeInteraction,
  model,
  moveInteraction,
  resizeInteraction,
}: DocumentSceneProps) => {
  const rootRef = useRef<SVGGElement | null>(null);
  const presenterRef = useRef<DocumentScenePresenter | undefined>(undefined);

  const syncVisibleItems = useCallback((): void => {
    presenterRef.current?.sync(
      model.queryVisible(camera.getTransformSnapshot(), camera.getViewportSnapshot()),
    );
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
    model.reconcile(document, activeBoardId);
    syncVisibleItems();
  }, [activeBoardId, document, model, syncVisibleItems]);

  useLayoutEffect(() => {
    syncVisibleItems();
    return camera.subscribe(syncVisibleItems);
  }, [camera, syncVisibleItems]);

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
