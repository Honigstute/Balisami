import { useState, type DragEvent, type KeyboardEvent } from 'react';

import type { ComponentDefinition, ComponentId, ProjectDocument } from '../../domain';
import { AppButton } from '../design/AppButton';
import { AppInput } from '../design/AppInput';
import { AppPopover } from '../design/AppPopover';
import { Icon } from '../shell/Icon';
import { ComponentThumbnail } from './component-thumbnail';
import { COMPONENT_DRAG_MIME_TYPE } from './control-drag-transfer';
import type { ControlTextMeasurementService } from './control-text-measurement';

interface ComponentShelfItemProps {
  readonly assetUrls: Readonly<Record<string, string>>;
  readonly component: ComponentDefinition;
  readonly componentCount: number;
  readonly componentPosition: number;
  readonly index: number;
  readonly isActive: boolean;
  readonly measurementService: ControlTextMeasurementService | undefined;
  readonly onDeleteComponent: ((componentId: ComponentId) => boolean) | undefined;
  readonly onDuplicateComponent: ((componentId: ComponentId) => boolean) | undefined;
  readonly onFocus: () => void;
  readonly onInsertComponent: (componentId: ComponentId) => boolean;
  readonly onItemKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
  readonly onRenameComponent: ((componentId: ComponentId, name: string) => boolean) | undefined;
  readonly onReorderComponent: ((componentId: ComponentId, toIndex: number) => boolean) | undefined;
  readonly projectDocument: ProjectDocument;
  readonly referenceCount: number;
}

/** One fixed shelf slot plus its portalled, history-backed definition actions. */
export const ComponentShelfItem = ({
  assetUrls,
  component,
  componentCount,
  componentPosition,
  index,
  isActive,
  measurementService,
  onDeleteComponent,
  onDuplicateComponent,
  onFocus,
  onInsertComponent,
  onItemKeyDown,
  onRenameComponent,
  onReorderComponent,
  projectDocument,
  referenceCount,
}: ComponentShelfItemProps) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(component.name);
  const [validation, setValidation] = useState<string>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const canManage =
    onDeleteComponent !== undefined ||
    onDuplicateComponent !== undefined ||
    onRenameComponent !== undefined ||
    onReorderComponent !== undefined;
  const close = (): void => {
    setOpen(false);
    setConfirmingDelete(false);
    setValidation(undefined);
  };
  const setOpenState = (nextOpen: boolean): void => {
    setOpen(nextOpen);
    setName(component.name);
    setConfirmingDelete(false);
    setValidation(undefined);
  };
  const rename = (): void => {
    const normalizedName = name.trim();
    if (normalizedName.length === 0) {
      setValidation('Enter a component name.');
      return;
    }
    if (
      normalizedName !== component.name &&
      (onRenameComponent === undefined || !onRenameComponent(component.id, normalizedName))
    ) {
      setValidation('The component could not be renamed.');
      return;
    }
    close();
  };

  const insertButton = (
    <button
      aria-label={`Insert ${component.name}`}
      className="control-library__item"
      data-component-library-id={component.id}
      data-control-library-key={`component:${component.id}`}
      draggable
      onClick={() => onInsertComponent(component.id)}
      onDragStart={(event: DragEvent<HTMLButtonElement>) => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData(COMPONENT_DRAG_MIME_TYPE, component.id);
      }}
      onFocus={onFocus}
      onKeyDown={(event) => onItemKeyDown(event, index)}
      tabIndex={isActive ? 0 : -1}
      title={`Insert ${component.name}`}
      type="button"
    >
      <ComponentThumbnail
        assetUrls={assetUrls}
        component={component}
        document={projectDocument}
        {...(measurementService === undefined
          ? {}
          : { textMeasurementService: measurementService })}
      />
      <span className="control-library__label">{component.name}</span>
    </button>
  );

  if (!canManage) return insertButton;
  return (
    <div className="component-library-item">
      {insertButton}
      <AppPopover
        label={`Manage ${component.name}`}
        onOpenChange={setOpenState}
        open={open}
        trigger={(triggerProps) => (
          <button
            {...triggerProps}
            aria-label={`Manage ${component.name}`}
            className="component-library-item__manage icon-button"
            title={`Manage ${component.name}`}
            type="button"
          >
            <Icon name="more" />
          </button>
        )}
      >
        <div className="component-library-menu">
          <AppInput
            label="Component name"
            maxLength={120}
            onChange={(event) => {
              setName(event.currentTarget.value);
              setValidation(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                rename();
              }
            }}
            {...(validation === undefined ? {} : { validation })}
            value={name}
          />
          <div className="component-library-menu__actions">
            <AppButton onClick={rename}>Rename</AppButton>
            <AppButton
              disabled={componentPosition <= 0 || onReorderComponent === undefined}
              onClick={() => {
                if (onReorderComponent?.(component.id, componentPosition - 1)) close();
              }}
            >
              Move Earlier
            </AppButton>
            <AppButton
              disabled={
                componentPosition < 0 ||
                componentPosition >= componentCount - 1 ||
                onReorderComponent === undefined
              }
              onClick={() => {
                if (onReorderComponent?.(component.id, componentPosition + 1)) close();
              }}
            >
              Move Later
            </AppButton>
            <AppButton
              disabled={onDuplicateComponent === undefined}
              onClick={() => {
                if (onDuplicateComponent?.(component.id)) close();
              }}
            >
              Duplicate
            </AppButton>
          </div>
          {referenceCount > 0 ? (
            <p>
              Used by {referenceCount} {referenceCount === 1 ? 'instance' : 'instances'}. Break
              apart or remove them before deleting this definition.
            </p>
          ) : confirmingDelete ? (
            <div className="component-library-menu__confirmation" role="alert">
              <p>Delete this definition? You can restore it with Undo.</p>
              <div className="component-library-menu__actions">
                <AppButton onClick={() => setConfirmingDelete(false)}>Cancel</AppButton>
                <AppButton
                  disabled={onDeleteComponent === undefined}
                  onClick={() => {
                    if (onDeleteComponent?.(component.id)) close();
                  }}
                  tone="danger"
                >
                  Delete Definition
                </AppButton>
              </div>
            </div>
          ) : (
            <AppButton
              disabled={onDeleteComponent === undefined}
              onClick={() => setConfirmingDelete(true)}
              tone="danger"
            >
              Delete Definition…
            </AppButton>
          )}
        </div>
      </AppPopover>
    </div>
  );
};
