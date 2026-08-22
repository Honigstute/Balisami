import type { BoardId } from '../../domain';

export interface PresentationHistory {
  readonly back: readonly BoardId[];
  readonly current: BoardId;
  readonly forward: readonly BoardId[];
}

export type PresentationHistoryAction =
  | Readonly<{ type: 'back' }>
  | Readonly<{ type: 'forward' }>
  | Readonly<{ boardIds: readonly BoardId[]; type: 'reconcile' }>
  | Readonly<{ boardId: BoardId; type: 'visit' }>;

export const createPresentationHistory = (boardId: BoardId): PresentationHistory =>
  Object.freeze({ back: Object.freeze([]), current: boardId, forward: Object.freeze([]) });

/**
 * Presentation navigation is transient browser-like history. Persisted links
 * keep canonical board IDs; selected alternate resolution stays a document selector concern.
 */
export const reducePresentationHistory = (
  history: PresentationHistory,
  action: PresentationHistoryAction,
): PresentationHistory => {
  if (action.type === 'visit') {
    return action.boardId === history.current
      ? history
      : Object.freeze({
          back: Object.freeze([...history.back, history.current]),
          current: action.boardId,
          forward: Object.freeze([]),
        });
  }
  if (action.type === 'back') {
    const current = history.back.at(-1);
    return current === undefined
      ? history
      : Object.freeze({
          back: Object.freeze(history.back.slice(0, -1)),
          current,
          forward: Object.freeze([history.current, ...history.forward]),
        });
  }
  if (action.type === 'forward') {
    const [current, ...forward] = history.forward;
    return current === undefined
      ? history
      : Object.freeze({
          back: Object.freeze([...history.back, history.current]),
          current,
          forward: Object.freeze(forward),
        });
  }

  const validIds = new Set(action.boardIds);
  if (!validIds.has(history.current)) {
    const current = action.boardIds[0];
    return current === undefined ? history : createPresentationHistory(current);
  }
  const back = history.back.filter((boardId) => validIds.has(boardId));
  const forward = history.forward.filter((boardId) => validIds.has(boardId));
  return back.length === history.back.length && forward.length === history.forward.length
    ? history
    : Object.freeze({
        back: Object.freeze(back),
        current: history.current,
        forward: Object.freeze(forward),
      });
};
