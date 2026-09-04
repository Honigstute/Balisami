import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { ElementLinkSchema, type ElementLink, type ProjectDocument } from '../../domain';
import { AppChoicePopover } from '../design/AppChoicePopover';
import { AppInput } from '../design/AppInput';

type LinkMode = ElementLink['kind'] | 'none';

interface ControlLinkFieldsProps {
  readonly document: ProjectDocument;
  readonly link: ElementLink | null | undefined;
  readonly onCommit: (link: ElementLink | null) => boolean;
  readonly revisionKey: number | string;
}

/** One reusable draft/validation contract for whole-control and parsed-row links. */
export const ControlLinkFields = ({
  document,
  link,
  onCommit,
  revisionKey,
}: ControlLinkFieldsProps) => {
  const canonicalMode: LinkMode | undefined =
    link === undefined ? undefined : (link?.kind ?? 'none');
  const canonicalExternalUrl = link?.kind === 'external' ? link.url : '';
  const [mode, setMode] = useState<LinkMode | undefined>(canonicalMode);
  const [externalDraft, setExternalDraft] = useState(canonicalExternalUrl);
  const [validation, setValidation] = useState<string>();
  const externalInputRef = useRef<HTMLInputElement | null>(null);
  const cancelBlurRef = useRef(false);

  useEffect(() => {
    setMode(canonicalMode);
    setExternalDraft(canonicalExternalUrl);
    setValidation(undefined);
  }, [canonicalExternalUrl, canonicalMode, revisionKey]);

  const chooseMode = (value: string): void => {
    if (value === 'none') {
      if (onCommit(null)) {
        setMode('none');
        setExternalDraft('');
        setValidation(undefined);
      }
      return;
    }
    if (value === 'board') {
      const boardId =
        link?.kind === 'board' && document.boardsById[link.boardId] !== undefined
          ? link.boardId
          : document.boardIds[0];
      if (boardId === undefined) {
        setValidation('Create a wireframe before adding this link.');
        return;
      }
      if (onCommit(Object.freeze({ kind: 'board', boardId }))) {
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
    if (!result.success || result.data.kind !== 'external' || !onCommit(result.data)) {
      setValidation('Enter a complete HTTP or HTTPS address.');
      return false;
    }
    setExternalDraft(result.data.url);
    setValidation(undefined);
    return true;
  };

  const boardOptions = document.boardIds.map((boardId) => ({
    label: document.boardsById[boardId]?.name ?? 'Missing wireframe',
    value: boardId,
  }));
  const currentBoardTarget = link?.kind === 'board' ? link.boardId : undefined;
  if (currentBoardTarget !== undefined && !document.boardIds.includes(currentBoardTarget)) {
    boardOptions.push({
      label: `${document.boardsById[currentBoardTarget]?.name ?? 'Missing wireframe'} (In Trash)`,
      value: currentBoardTarget,
    });
  }

  return (
    <>
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
            if (parsed.success && onCommit(parsed.data)) setValidation(undefined);
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
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelBlurRef.current = true;
              setMode(canonicalMode);
              setExternalDraft(canonicalExternalUrl);
              setValidation(undefined);
              event.currentTarget.blur();
            } else if (event.key === 'Enter') {
              event.preventDefault();
              if (commitExternal()) {
                cancelBlurRef.current = true;
                event.currentTarget.blur();
              }
            }
          }}
          {...(validation === undefined ? {} : { validation })}
          value={externalDraft}
        />
      ) : validation === undefined ? null : (
        <p aria-live="polite" className="inspector-inline-validation">
          {validation}
        </p>
      )}
    </>
  );
};
