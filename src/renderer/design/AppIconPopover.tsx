import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { createCustomIconReference, parseCustomIconReference, type AssetId } from '../../domain';
import { getIconDefinition, searchIconDefinitions } from '../../shared/icons/icon-catalog';
import { CatalogIconPreview } from '../controls/CatalogIcon';
import { Icon } from '../shell/Icon';
import { AppField } from './AppField';
import { AppInput } from './AppInput';
import { AppPopover } from './AppPopover';

const ICON_RESULT_LIMIT = 72;
const CUSTOM_ICON_RESULT_LIMIT = 12;
const ICON_GRID_COLUMNS = 6;

export interface ProjectImageIconOption {
  readonly assetId: AssetId;
  readonly label: string;
  readonly url: string;
}

interface AppIconPopoverProps {
  readonly customIcons?: readonly ProjectImageIconOption[];
  readonly label: string;
  readonly mixed?: boolean;
  readonly onChange: (value: string | null) => void;
  readonly value: string | null | undefined;
}

/** Searchable, bounded icon grid portalled outside the fixed inspector shell. */
export const AppIconPopover = ({
  customIcons = [],
  label,
  mixed = false,
  onChange,
  value,
}: AppIconPopoverProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const results = useMemo(() => searchIconDefinitions(query, ICON_RESULT_LIMIT), [query]);
  const customResults = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return customIcons
      .filter(
        (icon) => normalized.length === 0 || icon.label.toLocaleLowerCase().includes(normalized),
      )
      .slice(0, CUSTOM_ICON_RESULT_LIMIT);
  }, [customIcons, query]);
  const selectedCustomAssetId = parseCustomIconReference(value);
  const selectedCustom = customIcons.find((icon) => icon.assetId === selectedCustomAssetId);
  const selected =
    selectedCustomAssetId === undefined && typeof value === 'string'
      ? getIconDefinition(value)
      : undefined;
  const totalResultCount = customResults.length + results.length;

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery('');
    queueMicrotask(() => searchRef.current?.focus());
  }, [open]);

  const choose = (iconId: string | null): void => {
    onChange(iconId);
    setOpen(false);
  };

  const focusResult = (index: number): void => {
    const bounded = Math.max(0, Math.min(totalResultCount - 1, index));
    optionRefs.current[bounded]?.focus();
  };

  const handleResultKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let next: number | undefined;
    if (event.key === 'ArrowRight') next = index + 1;
    else if (event.key === 'ArrowLeft') next = index - 1;
    else if (event.key === 'ArrowDown') next = index + ICON_GRID_COLUMNS;
    else if (event.key === 'ArrowUp') next = index - ICON_GRID_COLUMNS;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = totalResultCount - 1;
    else return;
    event.preventDefault();
    focusResult(next);
  };

  return (
    <AppField grouped label={label} mixed={mixed}>
      {({ describedBy, invalid, labelledBy }) => (
        <AppPopover
          label={`${label} library`}
          onOpenChange={setOpen}
          open={open}
          trigger={(triggerProps) => (
            <button
              {...triggerProps}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              aria-labelledby={labelledBy}
              className="app-control app-icon-popover__trigger"
              type="button"
            >
              <span className="app-icon-popover__value">
                {selectedCustom === undefined ? null : (
                  <img alt="" className="app-icon-popover__image" src={selectedCustom.url} />
                )}
                {selected === undefined ? null : <CatalogIconPreview iconId={selected.id} />}
                <span>
                  {selectedCustom?.label ??
                    selected?.label ??
                    (selectedCustomAssetId === undefined
                      ? mixed
                        ? 'Mixed'
                        : 'None'
                      : 'Project image')}
                </span>
              </span>
              <Icon name="chevron" />
            </button>
          )}
        >
          <div className="app-icon-popover__search">
            <AppInput
              label="Search icons"
              inputRef={searchRef}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' && totalResultCount > 0) {
                  event.preventDefault();
                  focusResult(0);
                }
              }}
              spellCheck={false}
              value={query}
            />
            <button
              aria-pressed={value === null}
              className="app-icon-popover__none"
              onClick={() => choose(null)}
              type="button"
            >
              No icon
            </button>
          </div>
          {customResults.length === 0 ? null : (
            <section className="app-icon-popover__custom">
              <p>Project images</p>
              <div aria-label="Project image icons" className="app-icon-popover__grid" role="group">
                {customResults.map((icon, index) => {
                  const iconId = createCustomIconReference(icon.assetId);
                  return (
                    <button
                      aria-label={icon.label}
                      aria-pressed={iconId === value}
                      className="app-icon-popover__option app-icon-popover__option--image"
                      key={icon.assetId}
                      onClick={() => choose(iconId)}
                      onKeyDown={(event) => handleResultKeyDown(event, index)}
                      ref={(node) => {
                        optionRefs.current[index] = node;
                      }}
                      title={icon.label}
                      type="button"
                    >
                      <img alt="" src={icon.url} />
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {results.length === 0 ? (
            customResults.length === 0 ? (
              <p className="app-icon-popover__empty">No matching icons.</p>
            ) : null
          ) : (
            <div aria-label="Icon results" className="app-icon-popover__grid" role="group">
              {results.map((icon, index) => (
                <button
                  aria-label={icon.label}
                  aria-pressed={icon.id === value}
                  className="app-icon-popover__option"
                  key={icon.id}
                  onClick={() => choose(icon.id)}
                  onKeyDown={(event) => handleResultKeyDown(event, customResults.length + index)}
                  ref={(node) => {
                    optionRefs.current[customResults.length + index] = node;
                  }}
                  title={icon.label}
                  type="button"
                >
                  <CatalogIconPreview iconId={icon.id} />
                </button>
              ))}
            </div>
          )}
        </AppPopover>
      )}
    </AppField>
  );
};
