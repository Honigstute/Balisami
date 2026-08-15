import {
  useLayoutEffect,
  useRef,
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import type { ViewportShortcutPlatform } from './viewport-commands';
import type { ViewportCameraStore } from './viewport-camera-store';
import { TEXT_EDIT_POLICY, type TextEditInteraction } from './text-edit-interaction';
import { worldRectToViewport } from './viewport-transform';

interface TextEditOverlayProps {
  readonly camera: ViewportCameraStore;
  readonly interaction: TextEditInteraction;
  readonly platform: ViewportShortcutPlatform;
}

const focusViewport = (textarea: HTMLTextAreaElement): void => {
  textarea.closest<HTMLElement>('.editor-viewport')?.focus({ preventScroll: true });
};

const isExactCompletionKey = (
  event: KeyboardEvent<HTMLTextAreaElement>,
  mode: 'multiline' | 'single-line',
  platform: ViewportShortcutPlatform,
): boolean => {
  if (event.code !== 'Enter' || event.altKey || event.shiftKey) {
    return false;
  }
  if (mode === 'single-line') {
    return !event.ctrlKey && !event.metaKey;
  }
  return platform === 'darwin' ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
};

/**
 * One always-mounted textarea in the DOM scene layer. Camera and draft
 * publications update it imperatively so neither keystrokes nor camera motion
 * rerender the scene or application shell.
 */
export const TextEditOverlay = ({ camera, interaction, platform }: TextEditOverlayProps) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (textarea === null) {
      return;
    }
    let activeElementId: string | undefined;
    const apply = (): void => {
      const snapshot = interaction.getSnapshot();
      if (snapshot.kind === 'idle') {
        textarea.hidden = true;
        textarea.dataset.textEditState = 'idle';
        activeElementId = undefined;
        return;
      }
      const transform = camera.getTransformSnapshot();
      const bounds = worldRectToViewport(snapshot.target.worldBounds, transform);
      textarea.hidden = false;
      textarea.dataset.textEditMode = snapshot.target.mode;
      textarea.dataset.textEditState = snapshot.isComposing ? 'composing' : 'editing';
      textarea.setAttribute('aria-label', snapshot.target.accessibleLabel);
      textarea.wrap = snapshot.target.mode === 'multiline' ? 'soft' : 'off';
      textarea.style.left = `${String(bounds.x)}px`;
      textarea.style.top = `${String(bounds.y)}px`;
      textarea.style.width = `${String(bounds.width)}px`;
      textarea.style.height = `${String(bounds.height)}px`;
      textarea.style.fontSize = `${String(snapshot.target.fontSizeWorldUnits * transform.zoom)}px`;
      if (textarea.value !== snapshot.draft) {
        textarea.value = snapshot.draft;
      }
      if (activeElementId !== snapshot.target.elementId) {
        activeElementId = snapshot.target.elementId;
        textarea.focus({ preventScroll: true });
        textarea.select();
      }
    };

    apply();
    const unsubscribeCamera = camera.subscribe(apply);
    const unsubscribeInteraction = interaction.subscribe(apply);
    return () => {
      unsubscribeCamera();
      unsubscribeInteraction();
      interaction.cancel();
    };
  }, [camera, interaction]);

  const complete = (textarea: HTMLTextAreaElement, restoreViewportFocus: boolean): void => {
    const draft = textarea.value;
    interaction.setComposing(false);
    interaction.updateDraft(draft);
    const result = interaction.complete();
    if (result === 'failed') {
      if (document.hasFocus()) {
        queueMicrotask(() => textarea.focus({ preventScroll: true }));
      }
      return;
    }
    if (restoreViewportFocus && result !== false) {
      focusViewport(textarea);
    }
  };

  const handleBlur = (event: FormEvent<HTMLTextAreaElement>): void => {
    complete(event.currentTarget, false);
  };

  const handleCompositionEnd = (event: CompositionEvent<HTMLTextAreaElement>): void => {
    const draft = event.currentTarget.value;
    interaction.setComposing(false);
    interaction.updateDraft(draft);
  };

  const handleInput = (event: FormEvent<HTMLTextAreaElement>): void => {
    interaction.updateDraft(event.currentTarget.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    const snapshot = interaction.getSnapshot();
    if (snapshot.kind !== 'editingText' || snapshot.isComposing || event.nativeEvent.isComposing) {
      return;
    }
    if (event.code === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (interaction.cancel()) {
        focusViewport(event.currentTarget);
      }
      return;
    }
    if (isExactCompletionKey(event, snapshot.target.mode, platform)) {
      event.preventDefault();
      event.stopPropagation();
      complete(event.currentTarget, true);
    }
  };

  return (
    <textarea
      aria-label="Edit element text"
      className="text-edit-overlay"
      data-text-edit-state="idle"
      hidden
      maxLength={TEXT_EDIT_POLICY.maximumTextLength}
      onBlur={handleBlur}
      onCompositionEnd={handleCompositionEnd}
      onCompositionStart={() => interaction.setComposing(true)}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      ref={textareaRef}
      spellCheck={false}
    />
  );
};
