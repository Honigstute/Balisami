import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import {
  ComponentInstancePropertiesSchema,
  CONTROL_TYPES,
  getControlSpec,
  type ControlInspectorPropertyField,
  type ComponentId,
  type ElementId,
  type ElementProperties,
  type ElementRowData,
  type ProjectDocument,
  type WorldRect,
} from '../../domain';
import { CONTROL_TEXT_POLICY } from '../../shared/control-text';
import { AppChoicePopover } from '../design/AppChoicePopover';
import { AppColorPopover } from '../design/AppColorPopover';
import { AppButton } from '../design/AppButton';
import { AppInput } from '../design/AppInput';
import { AppIconPopover, type ProjectImageIconOption } from '../design/AppIconPopover';
import { AppSegmentedControl } from '../design/AppSegmentedControl';
import { AppSlider } from '../design/AppSlider';
import type { SelectionStore } from '../editor/selection-store';
import {
  createControlInspectorModel,
  type InspectorPrimitive,
  type InspectorValue,
} from './control-inspector-model';
import { ControlLinkInspector, type ControlInspectorLinkUpdate } from './ControlLinkInspector';
import {
  createComponentOverrideModel,
  type ComponentOverrideFieldModel,
} from './component-override-model';
import type { ComponentOverrideUpdate } from './component-override-update';
import { ControlRowsInspector } from './ControlRowsInspector';

export interface ControlInspectorFrameUpdate {
  readonly elementId: ElementId;
  readonly frame: WorldRect;
}

export interface ControlInspectorPropertiesUpdate {
  readonly elementId: ElementId;
  readonly properties: ElementProperties;
  readonly rowData?: ElementRowData;
}

export interface ControlInspectorIconUpdate {
  readonly elementId: ElementId;
  readonly iconId: string | null;
  readonly property: string;
}

interface ControlInspectorProps {
  readonly customIcons?: readonly ProjectImageIconOption[];
  readonly document: ProjectDocument;
  readonly emptyContent?: ReactNode;
  readonly onCreateComponent?: (groupId: ElementId, name: string) => boolean;
  readonly onDetachComponent?: (instanceId: ElementId) => boolean;
  readonly onAutoSize: (elementId: ElementId) => Promise<boolean>;
  readonly onSetFrames: (updates: readonly ControlInspectorFrameUpdate[]) => boolean;
  readonly onSetIcons?: (updates: readonly ControlInspectorIconUpdate[]) => boolean;
  readonly onSetLinks?: (updates: readonly ControlInspectorLinkUpdate[]) => boolean;
  readonly onSetComponentOverride?: (update: ComponentOverrideUpdate) => boolean;
  readonly onRenameComponent?: (componentId: ComponentId, name: string) => boolean;
  readonly onSetProperties: (updates: readonly ControlInspectorPropertiesUpdate[]) => boolean;
  readonly onUpdateComponentDefinition?: (instanceId: ElementId) => boolean;
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

interface InspectorRangeInputProps {
  readonly field: Extract<ControlInspectorPropertyField, Readonly<{ kind: 'number' | 'range' }>>;
  readonly onCommit: (value: number) => boolean;
  readonly value: InspectorValue<number>;
}

/** Range input drafts locally so a continuous gesture still creates one history command. */
const InspectorRangeInput = ({ field, onCommit, value }: InspectorRangeInputProps) => {
  const canonical = value.mixed ? undefined : value.value;
  const [draft, setDraft] = useState(canonical ?? field.minimum);
  const [showsMixed, setShowsMixed] = useState(canonical === undefined);
  const committed = useRef<number | undefined>(canonical);

  useEffect(() => {
    setDraft(canonical ?? field.minimum);
    setShowsMixed(canonical === undefined);
    committed.current = canonical;
  }, [canonical, field.minimum]);

  const commit = (next: number): void => {
    if (!Number.isFinite(next) || next === committed.current) {
      return;
    }
    if (onCommit(next)) {
      committed.current = next;
      setShowsMixed(false);
      return;
    }
    setDraft(committed.current ?? field.minimum);
    setShowsMixed(committed.current === undefined);
  };

  return (
    <AppSlider
      label={field.label}
      max={field.maximum}
      min={field.minimum}
      onBlur={() => commit(draft)}
      onChange={(event) => {
        setDraft(Number(event.currentTarget.value));
        setShowsMixed(false);
      }}
      onKeyUp={(event) => commit(Number(event.currentTarget.value))}
      onPointerCancel={(event) => commit(Number(event.currentTarget.value))}
      onPointerUp={(event) => commit(Number(event.currentTarget.value))}
      output={showsMixed ? 'Mixed' : formatInspectorNumber(draft)}
      step={field.step}
      value={draft}
    />
  );
};

interface InspectorPropertyFieldProps {
  readonly customIcons: readonly ProjectImageIconOption[];
  readonly field: ControlInspectorPropertyField;
  readonly onCommit: (property: string, value: boolean | number | string | null) => boolean;
  readonly onCommitIcon: (property: string, value: string | null) => boolean;
  readonly value: InspectorValue<InspectorPrimitive>;
}

/** Property field kinds are registry vocabulary, not control-type branches. */
export const InspectorPropertyField = ({
  customIcons,
  field,
  onCommit,
  onCommitIcon,
  value,
}: InspectorPropertyFieldProps) => {
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
  if (
    field.kind === 'icon' &&
    (typeof value.value === 'string' || value.value === null || value.mixed)
  ) {
    return (
      <AppIconPopover
        customIcons={customIcons}
        label={field.label}
        mixed={value.mixed}
        onChange={(nextValue) => onCommitIcon(field.property, nextValue)}
        value={value.value as string | null | undefined}
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
  if (field.kind === 'range' && (typeof value.value === 'number' || value.mixed)) {
    return (
      <InspectorRangeInput
        field={field}
        onCommit={(nextValue) => onCommit(field.property, nextValue)}
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
  if (element?.controlType === CONTROL_TYPES.componentInstance) {
    const properties = ComponentInstancePropertiesSchema.safeParse(element.properties);
    const component =
      properties.success === true
        ? document.componentsById[properties.data.componentId]
        : undefined;
    return <>{component?.name ?? 'Component'}</>;
  }
  return <>{definition?.palette?.label ?? (element === undefined ? emptyTitle : 'Group')}</>;
};

export const ControlInspector = ({
  customIcons = [],
  document,
  emptyContent,
  onCreateComponent = () => false,
  onDetachComponent = () => false,
  onAutoSize,
  onSetFrames,
  onSetIcons,
  onSetLinks = () => false,
  onSetComponentOverride = () => false,
  onRenameComponent = () => false,
  onSetProperties,
  onUpdateComponentDefinition = () => false,
  selection,
}: ControlInspectorProps) => {
  const selectionSnapshot = useSyncExternalStore(
    selection.subscribe,
    selection.getSnapshot,
    selection.getSnapshot,
  );
  const model = createControlInspectorModel(document, selectionSnapshot.selectedIds);
  const element = model?.elements.length === 1 ? model.elements[0] : undefined;
  const componentOverrideModel =
    element === undefined ? undefined : createComponentOverrideModel(document, element.id);
  const [autoSizePending, setAutoSizePending] = useState(false);
  const [autoSizeValidation, setAutoSizeValidation] = useState<string>();
  const [componentName, setComponentName] = useState(
    `Component ${String(document.componentIds.length + 1)}`,
  );
  const [componentValidation, setComponentValidation] = useState<string>();
  const [definitionName, setDefinitionName] = useState(
    componentOverrideModel?.component.name ?? '',
  );
  const [definitionValidation, setDefinitionValidation] = useState<string>();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAutoSizePending(false);
    setAutoSizeValidation(undefined);
    setComponentName(`Component ${String(document.componentIds.length + 1)}`);
    setComponentValidation(undefined);
    setDefinitionName(componentOverrideModel?.component.name ?? '');
    setDefinitionValidation(undefined);
    if (scrollRef.current !== null) {
      scrollRef.current.scrollTop = 0;
    }
  }, [
    componentOverrideModel?.component.name,
    document.componentIds.length,
    selectionSnapshot.revision,
  ]);

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
        {element?.controlType !== CONTROL_TYPES.group ? null : (
          <section className="inspector-section">
            <h3>Reusable Component</h3>
            <AppInput
              label="Component name"
              maxLength={120}
              onChange={(event) => {
                setComponentName(event.currentTarget.value);
                setComponentValidation(undefined);
              }}
              onKeyDown={blurOnEnter}
              {...(componentValidation === undefined ? {} : { validation: componentValidation })}
              value={componentName}
            />
            <AppButton
              onClick={() => {
                const normalizedName = componentName.trim();
                if (normalizedName.length === 0) {
                  setComponentValidation('Enter a component name.');
                  return;
                }
                if (!onCreateComponent(element.id, normalizedName)) {
                  setComponentValidation('The component could not be created.');
                }
              }}
              tone="primary"
            >
              Create Component
            </AppButton>
          </section>
        )}
        {element === undefined || spec?.rows === null || spec?.rows === undefined ? null : (
          <ControlRowsInspector
            definition={spec}
            document={document}
            element={element}
            onApply={(update) => onSetProperties([update])}
          />
        )}
        {model.propertySections.map((section) => (
          <section className="inspector-section" key={section.label}>
            <h3>{section.label}</h3>
            {section.fields.map((field) => {
              return (
                <InspectorPropertyField
                  customIcons={customIcons}
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
                  onCommitIcon={(property, iconId) => {
                    const updates = model.elements.map((selectedElement) =>
                      Object.freeze({ elementId: selectedElement.id, iconId, property }),
                    );
                    return onSetIcons === undefined
                      ? onSetProperties(
                          model.elements.map((selectedElement) =>
                            Object.freeze({
                              elementId: selectedElement.id,
                              properties: Object.freeze({
                                ...selectedElement.properties,
                                [property]: iconId,
                              }),
                            }),
                          ),
                        )
                      : onSetIcons(updates);
                  }}
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
        {componentOverrideModel === undefined ? null : (
          <>
            <section className="inspector-section">
              <h3>Component</h3>
              <AppInput
                label="Definition name"
                maxLength={120}
                onBlur={() => {
                  const normalizedName = definitionName.trim();
                  if (normalizedName.length === 0) {
                    setDefinitionValidation('Enter a component name.');
                    return;
                  }
                  if (
                    normalizedName !== componentOverrideModel.component.name &&
                    !onRenameComponent(componentOverrideModel.component.id, normalizedName)
                  ) {
                    setDefinitionName(componentOverrideModel.component.name);
                    setDefinitionValidation('The component could not be renamed.');
                    return;
                  }
                  setDefinitionName(normalizedName);
                  setDefinitionValidation(undefined);
                }}
                onChange={(event) => {
                  setDefinitionName(event.currentTarget.value);
                  setDefinitionValidation(undefined);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setDefinitionName(componentOverrideModel.component.name);
                    event.currentTarget.blur();
                    return;
                  }
                  blurOnEnter(event);
                }}
                {...(definitionValidation === undefined
                  ? {}
                  : { validation: definitionValidation })}
                value={definitionName}
              />
              <p>Changes below apply only to this instance.</p>
              <AppButton onClick={() => onDetachComponent(componentOverrideModel.instance.id)}>
                Break Apart
              </AppButton>
              <AppButton
                disabled={
                  !componentOverrideModel.sections.some((section) =>
                    section.fields.some((field) => field.overridden),
                  )
                }
                onClick={() => onUpdateComponentDefinition(componentOverrideModel.instance.id)}
                tone="primary"
              >
                Update Definition
              </AppButton>
            </section>
            {componentOverrideModel.sections.map((section) => (
              <section
                className="inspector-section"
                key={`${section.targetElementId}:${section.label}`}
              >
                <h3>{section.label}</h3>
                {section.fields.map((field: ComponentOverrideFieldModel) => (
                  <div
                    className="inspector-override-field"
                    key={`${String(selectionSnapshot.revision)}-${section.targetElementId}-${field.field.property}`}
                  >
                    <InspectorPropertyField
                      customIcons={customIcons}
                      field={field.field}
                      onCommit={(property, value) =>
                        onSetComponentOverride({
                          instanceId: componentOverrideModel.instance.id,
                          property,
                          targetElementId: section.targetElementId,
                          value,
                        })
                      }
                      onCommitIcon={(property, value) =>
                        onSetComponentOverride({
                          instanceId: componentOverrideModel.instance.id,
                          property,
                          targetElementId: section.targetElementId,
                          value,
                        })
                      }
                      value={field}
                    />
                    <AppButton
                      disabled={!field.overridden}
                      onClick={() =>
                        onSetComponentOverride({
                          instanceId: componentOverrideModel.instance.id,
                          property: field.field.property,
                          reset: true,
                          targetElementId: section.targetElementId,
                        })
                      }
                    >
                      Use Definition
                    </AppButton>
                  </div>
                ))}
              </section>
            ))}
          </>
        )}
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
