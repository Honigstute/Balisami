import { useEffect, useState, useSyncExternalStore, type KeyboardEvent } from 'react';

import {
  getControlSpec,
  type ControlInspectorPropertyField,
  type ElementId,
  type ElementProperties,
  type ProjectDocument,
  type WorldRect,
} from '../../domain';
import { AppInput } from '../design/AppInput';
import { AppSegmentedControl } from '../design/AppSegmentedControl';
import type { SelectionStore } from '../editor/selection-store';

interface ControlInspectorProps {
  readonly document: ProjectDocument;
  readonly onSetFrame: (elementId: ElementId, frame: WorldRect) => boolean;
  readonly onSetProperties: (elementId: ElementId, properties: ElementProperties) => boolean;
  readonly selection: SelectionStore;
}

interface InspectorNumberInputProps {
  readonly label: string;
  readonly minimum?: number;
  readonly onCommit: (value: number) => boolean;
  readonly value: number;
}

const formatInspectorNumber = (value: number): string =>
  String(Math.round((value + Number.EPSILON) * 100) / 100);

const blurOnEnter = (event: KeyboardEvent<HTMLInputElement>): void => {
  if (event.key === 'Enter') {
    event.preventDefault();
    event.currentTarget.blur();
  }
};

const InspectorNumberInput = ({ label, minimum, onCommit, value }: InspectorNumberInputProps) => {
  const canonical = formatInspectorNumber(value);
  const [draft, setDraft] = useState(canonical);
  const [validation, setValidation] = useState<string>();

  useEffect(() => {
    setDraft(canonical);
    setValidation(undefined);
  }, [canonical]);

  const commit = (): void => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || (minimum !== undefined && parsed < minimum)) {
      setValidation(
        minimum === undefined
          ? 'Enter a finite number.'
          : `Minimum ${formatInspectorNumber(minimum)}.`,
      );
      return;
    }
    if (parsed === value || onCommit(parsed)) {
      setDraft(formatInspectorNumber(parsed));
      setValidation(undefined);
      return;
    }
    setDraft(canonical);
    setValidation('The value could not be applied.');
  };

  return (
    <AppInput
      kind="number"
      label={label}
      min={minimum}
      onBlur={commit}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onKeyDown={blurOnEnter}
      step="any"
      {...(validation === undefined ? {} : { validation })}
      value={draft}
    />
  );
};

interface InspectorTextInputProps {
  readonly label: string;
  readonly onCommit: (value: string) => boolean;
  readonly value: string;
}

const InspectorTextInput = ({ label, onCommit, value }: InspectorTextInputProps) => {
  const [draft, setDraft] = useState(value);
  const [validation, setValidation] = useState<string>();

  useEffect(() => {
    setDraft(value);
    setValidation(undefined);
  }, [value]);

  const commit = (): void => {
    if (draft === value || onCommit(draft)) {
      setValidation(undefined);
      return;
    }
    setDraft(value);
    setValidation('The text could not be applied.');
  };

  return (
    <AppInput
      label={label}
      maxLength={100_000}
      onBlur={commit}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onKeyDown={blurOnEnter}
      {...(validation === undefined ? {} : { validation })}
      value={draft}
    />
  );
};

interface InspectorPropertyFieldProps {
  readonly field: ControlInspectorPropertyField;
  readonly onCommit: (property: string, value: boolean | string) => boolean;
  readonly value: boolean | string;
}

/** Property field kinds are registry vocabulary, not control-type branches. */
const InspectorPropertyField = ({ field, onCommit, value }: InspectorPropertyFieldProps) => {
  if (field.kind === 'boolean' && typeof value === 'boolean') {
    return (
      <AppSegmentedControl
        label={field.label}
        onChange={(nextValue) => onCommit(field.property, nextValue === 'true')}
        options={[
          { label: 'Unchecked', value: 'false' },
          { label: 'Checked', value: 'true' },
        ]}
        value={String(value)}
      />
    );
  }
  if (field.kind === 'text' && typeof value === 'string') {
    return (
      <InspectorTextInput
        label={field.label}
        onCommit={(nextValue) => onCommit(field.property, nextValue)}
        value={value}
      />
    );
  }
  throw new Error(`Inspector field '${field.property}' does not match its control property.`);
};

const InspectorFooter = () => (
  <div className="inspector-footer">
    <span>MVP alpha</span>
    <span>Local project</span>
  </div>
);

export const ControlInspector = ({
  document,
  onSetFrame,
  onSetProperties,
  selection,
}: ControlInspectorProps) => {
  const selectionSnapshot = useSyncExternalStore(
    selection.subscribe,
    selection.getSnapshot,
    selection.getSnapshot,
  );
  const elementId =
    selectionSnapshot.selectedIds.length === 1 ? selectionSnapshot.primaryId : undefined;
  const element = elementId === undefined ? undefined : document.elementsById[elementId];

  if (selectionSnapshot.selectedIds.length > 1) {
    return (
      <>
        <div className="inspector-scroll">
          <section className="inspector-section">
            <h3>Multiple controls</h3>
            <p>
              {selectionSnapshot.selectedIds.length} controls selected. Move, arrange, or group them
              on the canvas.
            </p>
          </section>
        </div>
        <InspectorFooter />
      </>
    );
  }

  if (elementId === undefined || element === undefined) {
    return (
      <>
        <div className="inspector-scroll">
          <section className="inspector-section">
            <h3>Nothing selected</h3>
            <p>Select a control to edit its position, size, and text.</p>
          </section>
        </div>
        <InspectorFooter />
      </>
    );
  }

  const spec = getControlSpec(element.controlType);
  if (spec === undefined) {
    throw new Error(`Inspector received unknown control type '${element.controlType}'.`);
  }
  const label = spec.palette?.label ?? 'Group';
  const commitFrame = (patch: Partial<WorldRect>): boolean =>
    onSetFrame(element.id, Object.freeze({ ...element.frame, ...patch }));
  const textMetadata = spec.capabilities.text;

  return (
    <>
      <div className="inspector-scroll" data-inspector-control={element.controlType}>
        <section className="inspector-section inspector-section--identity">
          <h3>{label}</h3>
          <p>Selected control</p>
        </section>
        <section className="inspector-section">
          <h3>Position</h3>
          <div className="inspector-field-grid">
            <InspectorNumberInput
              key={`${element.id}-x`}
              label="X"
              onCommit={(x) => commitFrame({ x })}
              value={element.frame.x}
            />
            <InspectorNumberInput
              key={`${element.id}-y`}
              label="Y"
              onCommit={(y) => commitFrame({ y })}
              value={element.frame.y}
            />
          </div>
        </section>
        <section className="inspector-section">
          <h3>Size</h3>
          <div className="inspector-field-grid">
            <InspectorNumberInput
              key={`${element.id}-width`}
              label="Width"
              minimum={spec.minimumSize.width}
              onCommit={(width) => commitFrame({ width })}
              value={element.frame.width}
            />
            <InspectorNumberInput
              key={`${element.id}-height`}
              label="Height"
              minimum={spec.minimumSize.height}
              onCommit={(height) => commitFrame({ height })}
              value={element.frame.height}
            />
          </div>
        </section>
        {spec.inspector.map((section) => (
          <section className="inspector-section" key={section.label}>
            <h3>{section.label}</h3>
            {section.fields.map((field) => {
              const value = element.properties[field.property];
              if (typeof value !== 'boolean' && typeof value !== 'string') {
                throw new Error(
                  `Inspector property '${field.property}' is missing from '${element.controlType}'.`,
                );
              }
              return (
                <InspectorPropertyField
                  field={field}
                  key={`${element.id}-${field.property}`}
                  onCommit={(property, nextValue) =>
                    onSetProperties(
                      element.id,
                      Object.freeze({ ...element.properties, [property]: nextValue }),
                    )
                  }
                  value={value}
                />
              );
            })}
            {textMetadata === null ? null : (
              <p>Double-click the control or press Enter to edit on canvas.</p>
            )}
          </section>
        ))}
      </div>
      <InspectorFooter />
    </>
  );
};
