import { useEffect, useState, type KeyboardEvent } from 'react';

import {
  appendControlRowEdit,
  createControlRowEdits,
  createControlRowsUpdate,
  type ControlDefinition,
  type ControlRowEdit,
  type ElementNode,
  type ProjectDocument,
} from '../../domain';
import { AppButton } from '../design/AppButton';
import { AppInput } from '../design/AppInput';
import type { ControlInspectorPropertiesUpdate } from './ControlInspector';
import { areControlLinksEqual } from './control-link-equality';
import { ControlLinkFields } from './ControlLinkFields';

interface ControlRowsInspectorProps {
  readonly definition: ControlDefinition;
  readonly document: ProjectDocument;
  readonly element: ElementNode;
  readonly onApply: (update: ControlInspectorPropertiesUpdate) => boolean;
}

const RowLabelInput = ({
  label,
  onCommit,
}: {
  readonly label: string;
  readonly onCommit: (label: string) => boolean;
}) => {
  const [draft, setDraft] = useState(label);
  const [validation, setValidation] = useState<string>();
  useEffect(() => {
    setDraft(label);
    setValidation(undefined);
  }, [label]);
  const commit = (): void => {
    const normalized = draft.trim();
    if (normalized === label) return;
    if (normalized.length === 0 || !onCommit(normalized)) {
      setDraft(label);
      setValidation('The row label could not be applied.');
    }
  };
  return (
    <AppInput
      label="Label"
      onBlur={commit}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(label);
          event.currentTarget.blur();
        }
      }}
      {...(validation === undefined ? {} : { validation })}
      value={draft}
    />
  );
};

/** Explicit row IDs/order/labels/links cross one validated command boundary per action. */
export const ControlRowsInspector = ({
  definition,
  document,
  element,
  onApply,
}: ControlRowsInspectorProps) => {
  const edits = createControlRowEdits(definition, element);
  const rows = definition.rows;
  if (edits === undefined || rows === null) return null;

  const apply = (
    nextEdits: readonly ControlRowEdit[],
    nextId = element.rowData.nextId,
  ): boolean => {
    const update = createControlRowsUpdate(definition, element, nextEdits, nextId);
    return update !== undefined && onApply(Object.freeze({ elementId: element.id, ...update }));
  };
  return (
    <section className="inspector-section" data-control-rows-inspector="true">
      <h3>Items</h3>
      {edits.map((edit, index) => (
        <div className="control-row-editor" key={edit.id}>
          <RowLabelInput
            label={edit.label}
            onCommit={(label) =>
              apply(
                edits.map((candidate) =>
                  candidate.id === edit.id ? Object.freeze({ ...candidate, label }) : candidate,
                ),
              )
            }
          />
          <div className="control-row-editor__actions">
            <AppButton
              disabled={index === 0}
              onClick={() => {
                const next = [...edits];
                [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                apply(next);
              }}
            >
              Up
            </AppButton>
            <AppButton
              disabled={index === edits.length - 1}
              onClick={() => {
                const next = [...edits];
                [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
                apply(next);
              }}
            >
              Down
            </AppButton>
            <AppButton
              disabled={edits.length <= rows.minimum}
              onClick={() => apply(edits.filter((candidate) => candidate.id !== edit.id))}
            >
              Delete
            </AppButton>
          </div>
          {rows.links ? (
            <ControlLinkFields
              document={document}
              link={edit.link}
              onCommit={(link) =>
                areControlLinksEqual(edit.link, link) ||
                apply(
                  edits.map((candidate) =>
                    candidate.id === edit.id ? Object.freeze({ ...candidate, link }) : candidate,
                  ),
                )
              }
              revisionKey={`${edit.id}:${JSON.stringify(edit.link)}`}
            />
          ) : null}
        </div>
      ))}
      <AppButton
        disabled={edits.length >= rows.maximum}
        onClick={() => {
          const appended = appendControlRowEdit(element, edits, `Item ${String(edits.length + 1)}`);
          if (appended !== undefined) apply(appended.edits, appended.nextId);
        }}
      >
        Add item
      </AppButton>
    </section>
  );
};
