import { useCallback, useLayoutEffect, useRef } from 'react';

import type { BoardId, ElementId, ProjectDocument } from '../../domain';
import type { DocumentSceneItem, DocumentSceneModel } from './document-scene-model';
import type { MoveInteraction, MoveInteractionSnapshot } from './move-interaction';
import type { ViewportCameraStore } from './viewport-camera-store';

interface DocumentSceneProps {
  readonly activeBoardId: BoardId | undefined;
  readonly camera: ViewportCameraStore;
  readonly document: ProjectDocument;
  readonly model: DocumentSceneModel;
  readonly moveInteraction?: MoveInteraction;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

class DocumentScenePresenter {
  readonly #elementsById = new Map<ElementId, SVGGElement>();
  readonly #root: SVGGElement;
  #moveSnapshot: MoveInteractionSnapshot | undefined;
  #visibleOrder: readonly ElementId[] = Object.freeze([]);

  constructor(root: SVGGElement) {
    this.#root = root;
  }

  clear(): void {
    this.#elementsById.clear();
    this.#moveSnapshot = undefined;
    this.#visibleOrder = Object.freeze([]);
    this.#root.replaceChildren();
  }

  sync(items: readonly DocumentSceneItem[]): void {
    const nextOrder = items.map((item) => item.id);
    const orderChanged =
      nextOrder.length !== this.#visibleOrder.length ||
      nextOrder.some((id, index) => id !== this.#visibleOrder[index]);
    const visibleIds = new Set(nextOrder);
    for (const [id, element] of this.#elementsById) {
      if (!visibleIds.has(id)) {
        element.remove();
        this.#elementsById.delete(id);
      }
    }
    for (const item of items) {
      const element = this.#elementsById.get(item.id) ?? this.#createElement(item.id);
      if (element.dataset.sceneRevision !== item.revision) {
        this.#updateElement(element, item);
      }
      if (orderChanged) {
        this.#root.append(element);
      }
    }
    this.#visibleOrder = Object.freeze(nextOrder);
    this.#applyMovePreview();
  }

  setMovePreview(snapshot: MoveInteractionSnapshot | undefined): void {
    const previousIds =
      this.#moveSnapshot?.kind === 'moving' ? this.#moveSnapshot.affectedIds : Object.freeze([]);
    this.#moveSnapshot = snapshot;
    const nextIds =
      snapshot?.kind === 'moving' ? new Set(snapshot.affectedIds) : new Set<ElementId>();
    for (const id of previousIds) {
      if (!nextIds.has(id)) {
        this.#elementsById.get(id)?.removeAttribute('transform');
      }
    }
    this.#applyMovePreview();
  }

  #applyMovePreview(): void {
    const snapshot = this.#moveSnapshot;
    if (snapshot?.kind !== 'moving') {
      return;
    }
    const transform = `translate(${String(snapshot.delta.x)} ${String(snapshot.delta.y)})`;
    for (const id of snapshot.affectedIds) {
      this.#elementsById.get(id)?.setAttribute('transform', transform);
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
    const fill = element.children[0];
    const outline = element.children[1];
    if (fill?.localName !== 'rect' || outline?.localName !== 'path') {
      throw new Error('Document scene element structure was changed unexpectedly.');
    }
    const fillElement = fill as SVGRectElement;
    const outlineElement = outline as SVGPathElement;
    fillElement.setAttribute('x', String(item.bounds.x));
    fillElement.setAttribute('y', String(item.bounds.y));
    fillElement.setAttribute('width', String(item.bounds.width));
    fillElement.setAttribute('height', String(item.bounds.height));
    outlineElement.setAttribute('d', item.path);
    element.dataset.sceneRevision = item.revision;
  }
}

/** Imperative keyed scene updates keep camera motion outside React's render path. */
export const DocumentScene = ({
  activeBoardId,
  camera,
  document,
  model,
  moveInteraction,
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
    const apply = (): void => presenterRef.current?.setMovePreview(moveInteraction?.getSnapshot());
    apply();
    return moveInteraction?.subscribe(apply);
  }, [moveInteraction]);

  return <g data-scene-content="document-elements" ref={rootRef} />;
};
