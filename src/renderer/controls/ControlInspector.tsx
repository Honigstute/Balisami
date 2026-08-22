import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import {
  getControlSpec,
  type ControlInspectorPropertyField,
  type ElementId,
  type ElementProperties,
  type ProjectDocument,
  type WorldRect,
} from '../../domain';
import { CONTROL_TEXT_POLICY } from '../../shared/control-text';
import { AppChoicePopover } from '../design/AppChoicePopover';
import { AppColorPopover } from '../design/AppColorPopover';
import { AppButton } from '../design/AppButton';
import { AppInput } from '../design/AppInput';
import { AppSegmentedControl } from '../design/AppSegmentedControl';
import type { SelectionStore } from '../editor/selection-store';
import {
  createControlInspectorModel,
  type InspectorPrimitive,
  type InspectorValue,
} from './control-inspector-model';
import { ControlLinkInspector, type ControlInspectorLinkUpdate } from './ControlLinkInspector';

export interface ControlInspectorFrameUpdate {
  readonly elementId: ElementId;
  readonly frame: WorldRect;
}

export interface ControlInspectorPropertiesUpdate {
  readonly elementId: ElementId;
  readonly properties: ElementProperties;
}

interface ControlInspectorProps {
  readonly document: ProjectDocument;
  readonly emptyContent?: ReactNode;
  readonly onAutoSize: (elementId: ElementId) => Promise<boolean>;
  readonly onSetFrames: (updates: readonly ControlInspectorFrameUpdate[]) => boolean;
  readonly onSetLinks?: (updates: readonly ControlInspectorLinkUpdate[]) => boolean;
  readonly onSetProperties: (updates: readonly ControlInspectorPropertiesUpdate[]) => boolean;
  readonly selection: SelectionStore;
}

interface ControlInspectorTitleProps {
  readonly document: ProjectDocument;
  readonly emptyTitle?: ReactNode;
  readonly selection: SelectionStore;
}

interface InspectorNumberInputProps {
  readonly label: string;
  readonly maximum?: number;
  readonly minimum?: number;
  readonly onCommit: (value: number) => boolean;
  readonly step?: number | 'any';
  readonly value: InspectorValue<number>;
}

const formatInspectorNumber = (value: number): string =>
  String(Math.round((value + Number.EPSILON) * 100) / 100);

const blurOnEnter = (event: KeyboardEvent<HTMLInputElement>): void => {
  if (event.key === 'Enter') {
    event.preventDefault();
    event.currentTarget.blur();
  }
};

const InspectorNumberInput = ({
  label,
  maximum,
  minimum,
  onCommit,
  step = 'any',
  value,
}: InspectorNumberInputProps) => {
  const canonical = value.value === undefined ? '' : formatInspectorNumber(value.value);
  const [draft, setDraft] = useState(canonical);
  const [validation, setValidation] = useState<string>();
  const suppressNextBlur = useRef(false);

  useEffect(() => {
    setDraft(canonical);
    setValidation(undefined);
  }, [canonical]);

  const commit = (candidate: string): boolean => {
    if (value.mixed && candidate === canonical) {
      return true;
    }
    if (candidate.trim().length === 0) {
      setValidation('Enter a finite number.');
      return false;
    }
    const parsed = Number(candidate);
    if (
      !Number.isFinite(parsed) ||
      (minimum !== undefined && parsed < minimum) ||
      (maximum !== undefined && parsed > maximum)
    ) {
      if (!Number.isFinite(parsed)) {
        setValidation('Enter a finite number.');
      } else if (minimum !== undefined && parsed < minimum) {
        setValidation(`Minimum ${formatInspectorNumber(minimum)}.`);
      } else if (maximum !== undefined) {
        setValidation(`Maximum ${formatInspectorNumber(maximum)}.`);
      }
      return false;
    }
    if (parsed === value.value || onCommit(parsed)) {
      setDraft(formatInspectorNumber(parsed));
      setValidation(undefined);
      return true;
    }
    setDraft(canonical);
    setValidation('The value could not be applied.');
    return false;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      suppressNextBlur.current = true;
      setDraft(canonical);
      setValidation(undefined);
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (commit(draft)) {
        suppressNextBlur.current = true;
        event.currentTarget.blur();
      }
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }
    event.preventDefault();
    const parsedDraft = Number(draft);
    const base = draft.trim().length > 0 && Number.isFinite(parsedDraft) ? parsedDraft : 0;
    const increment = (typeof step === 'number' ? step : 1) * (event.shiftKey ? 10 : 1);
    const direction = event.key === 'ArrowUp' ? 1 : -1;
    const next = Math.min(
      maximum ?? Infinity,
      Math.max(minimum ?? -Infinity, base + increment * direction),
    );
    setDraft(formatInspectorNumber(next));
    setValidation(undefined);
  };

  return (
    <AppInput
      kind="number"
      label={label}
      max={maximum}
      min={minimum}
      mixed={value.mixed}
      onBlur={() => {
        if (suppressNextBlur.current) {
          suppressNextBlur.current = false;
          return;
        }
        commit(draft);
      }}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onKeyDown={handleKeyDown}
      step={step}
      {...(validation === undefined ? {} : { validation })}
      value={draft}
    />
  );
};

interface InspectorTextInputProps {
  readonly label: string;
  readonly onCommit: (value: string) => boolean;
  readonly value: InspectorValue<string>;
}

const InspectorTextInput = ({ label, onCommit, value }: InspectorTextInputProps) => {
  const canonical = value.value ?? '';
  const [draft, setDraft] = useState(canonical);
  const [validation, setValidation] = useState<string>();

  useEffect(() => {
    setDraft(canonical);
    setValidation(undefined);
  }, [canonical]);

  const commit = (): void => {
    if (value.mixed && draft === canonical) {
      return;
    }
    if (draft === value.value || onCommit(draft)) {
      setValidation(undefined);
      return;
    }
    setDraft(canonical);
    setValidation('The text could not be applied.');
  };

  return (
    <AppInput
      label={label}
      maxLength={CONTROL_TEXT_POLICY.maximumLength}
      mixed={value.mixed}
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
  readonly onCommit: (property: string, value: boolean | number | string) => boolean;
  readonly value: InspectorValue<InspectorPrimitive>;
}

/** Property field kinds are registry vocabulary, not control-type branches. */
const InspectorPropertyField = ({ field, onCommit, value }: InspectorPropertyFieldProps) => {
  if (field.kind === 'boolean' && (typeof value.value === 'boolean' || value.mixed)) {
    return (
      <AppSegmentedControl
        label={field.label}
        mixed={value.mixed}
        onChange={(nextValue) => onCommit(field.property, nextValue === 'true')}
        options={[
          { label: 'Unchecked', value: 'false' },
          { label: 'Checked', value: 'true' },
        ]}
        value={value.value === undefined ? undefined : String(value.value)}
      />
    );
  }
  if (field.kind === 'text' && (typeof value.value === 'string' || value.mixed)) {
    return (
      <InspectorTextInput
        label={field.label}
        onCommit={(nextValue) => onCommit(field.property, nextValue)}
        value={value as InspectorValue<string>}
      />
    );
  }
  if (field.kind === 'color' && (typeof value.value === 'string' || value.mixed)) {
    return (
      <AppColorPopover
        label={field.label}
        mixed={value.mixed}
        onChange={(nextValue) => onCommit(field.property, nextValue)}
        value={typeof value.value === 'string' ? value.value : undefined}
      />
    );
  }
  if (field.kind === 'choice' && (typeof value.value === 'string' || value.mixed)) {
    return (
      <AppSegmentedControl
        label={field.label}
        mixed={value.mixed}
        onChange={(nextValue) => onCommit(field.property, nextValue)}
        options={field.options}
        value={typeof value.value === 'string' ? value.value : undefined}
      />
    );
  }
  if (field.kind === 'select' && (typeof value.value === 'string' || value.mixed)) {
    return (
      <AppChoicePopover
        label={field.label}
        mixed={value.mixed}
        onChange={(nextValue) => onCommit(field.property, nextValue)}
        options={field.options}
        value={typeof value.value === 'string' ? value.value : undefined}
      />
    );
  }
  if (field.kind === 'number' && (typeof value.value === 'number' || value.mixed)) {
    return (
      <InspectorNumberInput
        label={field.label}
        maximum={field.maximum}
        minimum={field.minimum}
        onCommit={(nextValue) => onCommit(field.property, nextValue)}
        step={field.step}
        value={value as InspectorValue<number>}
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

/** Keeps the fixed inspector header descriptive without duplicating identity in its body. */
export const ControlInspectorTitle = ({
  document,
  emptyTitle = 'Inspector',
  selection,
}: ControlInspectorTitleProps) => {
  const snapshot = useSyncExternalStore(
    selection.subscribe,
    selection.getSnapshot,
    selection.getSnapshot,
  );
  if (snapshot.selectedIds.length > 1) {
    return <>{snapshot.selectedIds.length} Controls</>;
  }
  const elementId = snapshot.selectedIds.length === 1 ? snapshot.primaryId : undefined;
  const element = elementId === undefined ? undefined : document.elementsById[elementId];
  const definition = element === undefined ? undefined : getControlSpec(element.controlType);
  return <>{definition?.palette?.label ?? (element === undefined ? emptyTitle : 'Group')}</>;
};

export const ControlInspector = ({
  document,
  emptyContent,
  onAutoSize,
  onSetFrames,
  onSetLinks = () => false,
  onSetProperties,
  selection,
}: ControlInspectorProps) => {
  const selectionSnapshot = useSyncExternalStore(
    selection.subscribe,
    selection.getSnapshot,
    selection.getSnapshot,
  );
  const model = createControlInspectorModel(document, selectionSnapshot.selectedIds);
  const element = model?.elements.length === 1 ? model.elements[0] : undefined;
  const [autoSizePending, setAutoSizePending] = useState(false);
  const [autoSizeValidation, setAutoSizeValidation] = useState<string>();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAutoSizePending(false);
    setAutoSizeValidation(undefined);
    if (scrollRef.current !== null) {
      scrollRef.current.scrollTop = 0;
    }
  }, [selectionSnapshot.revision]);

  if (model === undefined) {
    return (
      <>
        <div className="inspector-scroll">
          {emptyContent ?? (
            <section className="inspector-section">
              <h3>Nothing selected</h3>
              <p>Select a control to edit its position, size, and text.</p>
            </section>
          )}
        </div>
        <InspectorFooter />
      </>
    );
  }

  const spec = element === undefined ? undefined : getControlSpec(element.controlType);
  const commitFrame = (patch: Partial<WorldRect>): boolean =>
    onSetFrames(
      model.elements.map((selectedElement) =>
        Object.freeze({
          elementId: selectedElement.id,
          frame: Object.freeze({ ...selectedElement.frame, ...patch }),
        }),
      ),
    );

  const autoSize = async (): Promise<void> => {
    setAutoSizePending(true);
    setAutoSizeValidation(undefined);
    try {
      if (element === undefined || !(await onAutoSize(element.id))) {
        setAutoSizeValidation('The control could not be auto-sized.');
      }
    } catch {
      setAutoSizeValidation('The control could not be auto-sized.');
    } finally {
      setAutoSizePending(false);
    }
  };

  return (
    <>
      <div
        className="inspector-scroll"
        ref={scrollRef}
        {...(element === undefined ? {} : { 'data-inspector-control': element.controlType })}
      >
        <section className="inspector-section">
          <h3>Position</h3>
          <div className="inspector-field-grid">
            <InspectorNumberInput
              key={`${String(selectionSnapshot.revision)}-inspector-x`}
              label="X"
              onCommit={(x) => commitFrame({ x })}
              value={model.frame.x}
            />
            <InspectorNumberInput
              key={`${String(selectionSnapshot.revision)}-inspector-y`}
              label="Y"
              onCommit={(y) => commitFrame({ y })}
              value={model.frame.y}
            />
          </div>
        </section>
        <section className="inspector-section">
          <h3>Size</h3>
          <div className="inspector-field-grid">
            <InspectorNumberInput
              key={`${String(selectionSnapshot.revision)}-inspector-width`}
              label="Width"
              {...(model.frame.width.maximum === undefined
                ? {}
                : { maximum: model.frame.width.maximum })}
              {...(model.frame.width.minimum === undefined
                ? {}
                : { minimum: model.frame.width.minimum })}
              onCommit={(width) => commitFrame({ width })}
              value={model.frame.width}
            />
            <InspectorNumberInput
              key={`${String(selectionSnapshot.revision)}-inspector-height`}
              label="Height"
              {...(model.frame.height.maximum === undefined
                ? {}
                : { maximum: model.frame.height.maximum })}
              {...(model.frame.height.minimum === undefined
                ? {}
                : { minimum: model.frame.height.minimum })}
              onCommit={(height) => commitFrame({ height })}
              value={model.frame.height}
            />
          </div>
          {(spec?.autoSize ?? null) === null ? null : (
            <div className="inspector-auto-size">
              <AppButton disabled={autoSizePending} onClick={() => void autoSize()}>
                {autoSizePending ? 'Auto-Sizing…' : '↔ Auto-Size'}
              </AppButton>
              <span aria-live="polite">{autoSizeValidation ?? ''}</span>
            </div>
          )}
        </section>
        {model.propertySections.map((section) => (
          <section className="inspector-section" key={section.label}>
            <h3>{section.label}</h3>
            {section.fields.map((field) => {
              return (
                <InspectorPropertyField
                  field={field.field}
                  key={`${String(selectionSnapshot.revision)}-${section.label}-${field.field.property}`}
                  onCommit={(property, nextValue) =>
                    onSetProperties(
                      model.elements.map((selectedElement) =>
                        Object.freeze({
                          elementId: selectedElement.id,
                          properties: Object.freeze({
                            ...selectedElement.properties,
                            [property]: nextValue,
                          }),
                        }),
                      ),
                    )
                  }
                  value={field}
                />
              );
            })}
            {model.elements.every(
              (selectedElement) => getControlSpec(selectedElement.controlType)?.capabilities.text,
            ) ? (
              <p>Double-click the control or press Enter to edit on canvas.</p>
            ) : null}
          </section>
        ))}
        <ControlLinkInspector
          document={document}
          elements={model.elements}
          onSetLinks={onSetLinks}
          selectionRevision={selectionSnapshot.revision}
        />
      </div>
      <InspectorFooter />
    </>
  );
};
