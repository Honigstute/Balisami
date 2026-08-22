import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import {
  ElementLinkSchema,
  getControlSpec,
  type ElementId,
  type ElementLink,
  type ElementNode,
  type ProjectDocument,
} from '../../domain';
import { AppChoicePopover } from '../design/AppChoicePopover';
import { AppInput } from '../design/AppInput';

export interface ControlInspectorLinkUpdate {
  readonly elementId: ElementId;
  readonly link: ElementLink | null;
}

interface ControlLinkInspectorProps {
  readonly document: ProjectDocument;
  readonly elements: readonly ElementNode[];
  readonly onSetLinks: (updates: readonly ControlInspectorLinkUpdate[]) => boolean;
  readonly selectionRevision: number;
}

type LinkMode = ElementLink['kind'] | 'none';

const linksEqual = (left: ElementLink | null, right: ElementLink | null): boolean =>
  left === right ||
  (left?.kind === 'board' && right?.kind === 'board'
    ? left.boardId === right.boardId
    : left?.kind === 'external' && right?.kind === 'external'
      ? left.url === right.url
      : false);

const getSharedLink = (elements: readonly ElementNode[]): ElementLink | null | undefined => {
  const first = elements[0]?.link;
  return first !== undefined && elements.every((element) => linksEqual(element.link, first))
    ? first
    : undefined;
};

/** Common capability module; element-specific fields remain registry-owned. */
export const ControlLinkInspector = ({
  document,
  elements,
  onSetLinks,
  selectionRevision,
}: ControlLinkInspectorProps) => {
  const sharedLink = getSharedLink(elements);
  const canonicalMode: LinkMode | undefined =
    sharedLink === undefined ? undefined : (sharedLink?.kind ?? 'none');
  const canonicalExternalUrl = sharedLink?.kind === 'external' ? sharedLink.url : '';
  const [mode, setMode] = useState<LinkMode | undefined>(canonicalMode);
  const [externalDraft, setExternalDraft] = useState(canonicalExternalUrl);
  const [validation, setValidation] = useState<string>();
  const externalInputRef = useRef<HTMLInputElement | null>(null);
  const cancelBlurRef = useRef(false);

  useEffect(() => {
    setMode(canonicalMode);
    setExternalDraft(canonicalExternalUrl);
    setValidation(undefined);
  }, [canonicalExternalUrl, canonicalMode, selectionRevision]);

  if (
    elements.length === 0 ||
    !elements.every((element) => getControlSpec(element.controlType)?.capabilities.link === true)
  ) {
    return null;
  }

  const applyLink = (link: ElementLink | null): boolean => {
    if (sharedLink !== undefined && linksEqual(sharedLink, link)) {
      return true;
    }
    return onSetLinks(elements.map((element) => Object.freeze({ elementId: element.id, link })));
  };

  const chooseMode = (value: string): void => {
    if (value === 'none') {
      if (applyLink(null)) {
        setMode('none');
        setExternalDraft('');
        setValidation(undefined);
      }
      return;
    }
    if (value === 'board') {
      const targetBoardId =
        sharedLink?.kind === 'board' && document.boardsById[sharedLink.boardId] !== undefined
          ? sharedLink.boardId
          : document.boardIds[0];
      if (targetBoardId === undefined) {
        setValidation('Create a wireframe before adding this link.');
        return;
      }
      if (applyLink(Object.freeze({ kind: 'board', boardId: targetBoardId }))) {
        setMode('board');
        setValidation(undefined);
      }
      return;
    }
    if (value === 'external') {
      setMode('external');
      setExternalDraft(canonicalExternalUrl || 'https://');
      setValidation(undefined);
      queueMicrotask(() => externalInputRef.current?.focus());
    }
  };

  const commitExternal = (): boolean => {
    const result = ElementLinkSchema.safeParse({ kind: 'external', url: externalDraft.trim() });
    if (!result.success) {
      setValidation('Enter a complete HTTP or HTTPS address.');
      return false;
    }
    const link = result.data;
    if (link.kind !== 'external' || !applyLink(link)) {
      setValidation('The link could not be applied.');
      return false;
    }
    setExternalDraft(link.url);
    setValidation(undefined);
    return true;
  };

  const handleExternalKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelBlurRef.current = true;
      setMode(canonicalMode);
      setExternalDraft(canonicalExternalUrl);
      setValidation(undefined);
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (commitExternal()) {
        cancelBlurRef.current = true;
        event.currentTarget.blur();
      }
    }
  };

  const boardOptions = document.boardIds.map((boardId) => ({
    label: document.boardsById[boardId]?.name ?? 'Missing wireframe',
    value: boardId,
  }));
  const currentBoardTarget = sharedLink?.kind === 'board' ? sharedLink.boardId : undefined;
  if (currentBoardTarget !== undefined && !document.boardIds.includes(currentBoardTarget)) {
    boardOptions.push({
      label: `${document.boardsById[currentBoardTarget]?.name ?? 'Missing wireframe'} (In Trash)`,
      value: currentBoardTarget,
    });
  }

  return (
    <section className="inspector-section" data-control-link-inspector="true">
      <h3>Link</h3>
      <AppChoicePopover
        label="Link type"
        mixed={mode === undefined}
        onChange={chooseMode}
        options={[
          { label: 'None', value: 'none' },
          { label: 'Wireframe', value: 'board' },
          { label: 'Web address', value: 'external' },
        ]}
        value={mode}
      />
      {mode === 'board' ? (
        <AppChoicePopover
          label="Wireframe"
          onChange={(boardId) => {
            const parsed = ElementLinkSchema.safeParse({ kind: 'board', boardId });
            if (parsed.success && applyLink(parsed.data)) {
              setValidation(undefined);
            }
          }}
          options={boardOptions}
          value={currentBoardTarget}
        />
      ) : null}
      {mode === 'external' ? (
        <AppInput
          hint="HTTP(S) only"
          inputRef={externalInputRef}
          label="Web address"
          onBlur={() => {
            if (cancelBlurRef.current) {
              cancelBlurRef.current = false;
              return;
            }
            commitExternal();
          }}
          onChange={(event) => {
            setExternalDraft(event.currentTarget.value);
            setValidation(undefined);
          }}
          onKeyDown={handleExternalKeyDown}
          {...(validation === undefined ? {} : { validation })}
          value={externalDraft}
        />
      ) : validation === undefined ? null : (
        <p aria-live="polite" className="inspector-inline-validation">
          {validation}
        </p>
      )}
    </section>
  );
};
