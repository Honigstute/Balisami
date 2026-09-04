import type { ElementLink } from '../../domain';

export const areControlLinksEqual = (
  left: ElementLink | null,
  right: ElementLink | null,
): boolean =>
  left === right ||
  (left?.kind === 'board' && right?.kind === 'board'
    ? left.boardId === right.boardId
    : left?.kind === 'external' && right?.kind === 'external'
      ? left.url === right.url
      : false);
