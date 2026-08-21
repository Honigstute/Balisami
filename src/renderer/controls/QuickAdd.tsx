import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import type { ControlTypeId } from '../../domain';
import { AppPopover } from '../design/AppPopover';
import { Icon } from '../shell/Icon';
import { ControlThumbnail } from './ControlThumbnail';
import {
  loadQuickAddPreferences,
  recordQuickAddRecent,
  saveQuickAddPreferences,
  toggleQuickAddFavorite,
  type QuickAddPreferenceStorage,
  type QuickAddPreferences,
} from './quick-add-preferences';
import { createQuickAddResults, type QuickAddResult } from './quick-add-results';

interface QuickAddProps {
  readonly onInsert: (controlType: ControlTypeId) => boolean;
  readonly shortcutLabel: string;
  readonly storage?: QuickAddPreferenceStorage;
}

const getBrowserStorage = (): QuickAddPreferenceStorage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

export const QuickAdd = ({ onInsert, shortcutLabel, storage }: QuickAddProps) => {
  const listId = `quick-add-results-${useId()}`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const storageRef = useRef<QuickAddPreferenceStorage | undefined>(storage ?? getBrowserStorage());
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState<ControlTypeId | undefined>();
  const [preferences, setPreferences] = useState(() => loadQuickAddPreferences(storageRef.current));
  const results = createQuickAddResults(query, preferences);
  const foundActiveIndex = results.findIndex(({ definition }) => definition.type === activeType);
  const activeIndex = foundActiveIndex < 0 ? 0 : foundActiveIndex;
  const activeResult = results[activeIndex];

  const replacePreferences = useCallback((next: QuickAddPreferences): void => {
    setPreferences(next);
    saveQuickAddPreferences(storageRef.current, next);
  }, []);

  const changeOpen = useCallback((nextOpen: boolean): void => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery('');
      setActiveType(undefined);
    }
  }, []);

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        changeOpen(true);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [changeOpen]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  const insert = (controlType: ControlTypeId): void => {
    if (!onInsert(controlType)) {
      return;
    }
    replacePreferences(recordQuickAddRecent(preferences, controlType));
    changeOpen(false);
  };

  const moveActive = (index: number): void => {
    const result = results[index];
    if (result === undefined) {
      return;
    }
    setActiveType(result.definition.type);
    document
      .getElementById(`${listId}-${result.definition.type}`)
      ?.scrollIntoView?.({ block: 'nearest' });
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    let nextIndex: number | undefined;
    if (event.key === 'ArrowDown') {
      nextIndex = Math.min(activeIndex + 1, results.length - 1);
    } else if (event.key === 'ArrowUp') {
      nextIndex = Math.max(activeIndex - 1, 0);
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = results.length - 1;
    } else if (event.key === 'Enter' && activeResult !== undefined) {
      event.preventDefault();
      insert(activeResult.definition.type);
      return;
    }
    if (nextIndex !== undefined && nextIndex !== activeIndex) {
      event.preventDefault();
      moveActive(nextIndex);
    }
  };

  let priorSection: QuickAddResult['section'] | undefined;
  return (
    <AppPopover
      label="Quick add controls"
      onOpenChange={changeOpen}
      open={open}
      trigger={(triggerProps) => (
        <button {...triggerProps} aria-label="Quick add" className="quick-add" type="button">
          <Icon name="search" />
          <span>Quick add</span>
          <kbd>{shortcutLabel}</kbd>
        </button>
      )}
    >
      <div className="quick-add-menu">
        <div className="quick-add-menu__search">
          <Icon name="search" />
          <input
            aria-activedescendant={
              activeResult === undefined ? undefined : `${listId}-${activeResult.definition.type}`
            }
            aria-controls={listId}
            aria-expanded="true"
            aria-label="Find a control"
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setActiveType(undefined);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Find a control…"
            ref={inputRef}
            role="combobox"
            type="search"
            value={query}
          />
        </div>
        <div
          aria-label="Matching controls"
          className="quick-add-menu__results"
          id={listId}
          role="listbox"
        >
          {results.length === 0 ? (
            <div className="quick-add-menu__empty" role="status">
              <strong>No matching controls</strong>
              <span>Try a name, category, or alias.</span>
            </div>
          ) : null}
          {results.map((result, index) => {
            const palette = result.definition.palette;
            if (palette === null) {
              return null;
            }
            const showSection = priorSection !== result.section;
            priorSection = result.section;
            return (
              <div
                className="quick-add-menu__group"
                key={result.definition.type}
                role="presentation"
              >
                {showSection ? (
                  <span className="quick-add-menu__section" role="presentation">
                    {result.section}
                  </span>
                ) : null}
                <button
                  aria-label={`Insert ${palette.label}`}
                  aria-selected={index === activeIndex}
                  className="quick-add-menu__result"
                  id={`${listId}-${result.definition.type}`}
                  onClick={() => insert(result.definition.type)}
                  onMouseEnter={() => setActiveType(result.definition.type)}
                  role="option"
                  type="button"
                >
                  <span className="quick-add-menu__preview">
                    <ControlThumbnail
                      definition={result.definition}
                      textMeasurementService={undefined}
                    />
                  </span>
                  <span className="quick-add-menu__copy">
                    <strong>{palette.label}</strong>
                    <span>{palette.category}</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        <div className="quick-add-menu__hint">
          {activeResult?.definition.palette === null || activeResult === undefined ? null : (
            <button
              aria-label={`${preferences.favorites.includes(activeResult.definition.type) ? 'Remove' : 'Add'} ${activeResult.definition.palette.label} ${preferences.favorites.includes(activeResult.definition.type) ? 'from' : 'to'} favorites`}
              aria-pressed={preferences.favorites.includes(activeResult.definition.type)}
              className="quick-add-menu__favorite"
              onClick={() =>
                replacePreferences(
                  toggleQuickAddFavorite(preferences, activeResult.definition.type),
                )
              }
              type="button"
            >
              {preferences.favorites.includes(activeResult.definition.type)
                ? 'Favorited'
                : 'Favorite'}
            </button>
          )}
          <span>↑↓ Navigate · Enter Add · Esc Close</span>
        </div>
      </div>
    </AppPopover>
  );
};
