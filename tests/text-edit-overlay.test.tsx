import { fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ElementIdSchema } from '../src/domain';
import { TextEditOverlay } from '../src/renderer/editor/TextEditOverlay';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import {
  createTextEditViewportRoute,
  TextEditInteraction,
  type TextEditMode,
} from '../src/renderer/editor/text-edit-interaction';
import {
  ViewportCameraStore,
  type AnimationFrameScheduler,
} from '../src/renderer/editor/viewport-camera-store';
import { ViewportScene } from '../src/renderer/editor/ViewportScene';
import {
  createDeviceScale,
  createViewportSize,
  createViewportTransform,
  createWorldRect,
} from '../src/renderer/editor/viewport-transform';

const TEXT_ID = ElementIdSchema.parse('element_overlay_text');

class TestAnimationFrameScheduler implements AnimationFrameScheduler {
  readonly callbacks = new Map<number, (timestamp: number) => void>();
  #nextId = 1;

  cancel = (requestId: number): void => {
    this.callbacks.delete(requestId);
  };

  request = (callback: (timestamp: number) => void): number => {
    const requestId = this.#nextId;
    this.#nextId += 1;
    this.callbacks.set(requestId, callback);
    return requestId;
  };

  flushAll(): void {
    while (this.callbacks.size > 0) {
      const callbacks = [...this.callbacks.values()];
      this.callbacks.clear();
      callbacks.forEach((callback) => callback(16.67));
    }
  }
}

const createCamera = (scheduler: AnimationFrameScheduler) =>
  new ViewportCameraStore({
    initialDeviceScale: createDeviceScale(1),
    initialTransform: createViewportTransform({ panX: 20, panY: 30, zoom: 2 }),
    initialViewport: createViewportSize(800, 600),
    scheduler,
  });

const mockViewportBounds = (): void => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    bottom: 600,
    height: 600,
    left: 0,
    right: 800,
    top: 0,
    width: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
};

const createHarness = (options: {
  readonly commit?: (text: string) => boolean;
  readonly mode?: TextEditMode;
  readonly platform?: 'darwin' | 'win32';
}) => {
  const scheduler = new TestAnimationFrameScheduler();
  const camera = createCamera(scheduler);
  const selection = new SelectionStore();
  selection.selectOnly(TEXT_ID);
  const commit = vi.fn((text: string) => options.commit?.(text) ?? true);
  const interaction = new TextEditInteraction({
    capture: (elementId) =>
      elementId === TEXT_ID
        ? {
            accessibleLabel: 'Edit button label',
            elementId,
            fontSizeWorldUnits: 16,
            mode: options.mode ?? 'single-line',
            text: 'Before',
            worldBounds: createWorldRect(10, 20, 120, 36),
          }
        : undefined,
    commit: (_target, text) => commit(text),
  });
  const route = createTextEditViewportRoute({
    interaction,
    queryPointerTarget: () => TEXT_ID,
    selection,
  });
  let worldRenderCount = 0;
  const WorldChild = () => {
    const count = useRef(0);
    count.current += 1;
    worldRenderCount = count.current;
    return <rect height="36" width="120" x="10" y="20" />;
  };
  const copySelection = vi.fn(() => true);
  const deleteSelection = vi.fn(() => true);
  const view = render(
    <ViewportScene
      camera={camera}
      domChildren={
        <TextEditOverlay
          camera={camera}
          interaction={interaction}
          platform={options.platform ?? 'win32'}
        />
      }
      onCopySelection={copySelection}
      onDeleteSelection={deleteSelection}
      selection={selection}
      shortcutPlatform={options.platform ?? 'win32'}
      textEdit={route}
      worldChildren={<WorldChild />}
    />,
  );
  const root = view.container.querySelector<HTMLElement>('.editor-viewport');
  const textarea = view.container.querySelector<HTMLTextAreaElement>('.text-edit-overlay');
  if (root === null || textarea === null) {
    throw new Error('Text editing fixture did not mount.');
  }
  scheduler.flushAll();
  return {
    camera,
    commit,
    copySelection,
    deleteSelection,
    getWorldRenderCount: () => worldRenderCount,
    interaction,
    root,
    scheduler,
    textarea,
    view,
  };
};

describe('fixed-screen text edit overlay', () => {
  it('anchors to world bounds through camera changes without rerendering scene content', () => {
    mockViewportBounds();
    const fixture = createHarness({});

    fireEvent.keyDown(fixture.root, { code: 'Enter' });
    expect(fixture.root).toHaveAttribute('data-selection-state', 'editingText');
    expect(fixture.textarea).not.toHaveAttribute('hidden');
    expect(fixture.textarea).toHaveAttribute('aria-label', 'Edit button label');
    expect(fixture.textarea).toHaveValue('Before');
    expect(fixture.textarea.style.left).toBe('40px');
    expect(fixture.textarea.style.top).toBe('70px');
    expect(fixture.textarea.style.width).toBe('240px');
    expect(fixture.textarea.style.height).toBe('72px');
    expect(fixture.textarea.style.fontSize).toBe('32px');
    expect(document.activeElement).toBe(fixture.textarea);

    fireEvent.input(fixture.textarea, { target: { value: 'Draft' } });
    expect(fixture.interaction.getSnapshot()).toMatchObject({
      draft: 'Draft',
      kind: 'editingText',
    });
    expect(fixture.commit).not.toHaveBeenCalled();
    expect(fixture.getWorldRenderCount()).toBe(1);

    fixture.camera.scheduleTransform(createViewportTransform({ panX: 100, panY: 50, zoom: 1.5 }));
    fixture.scheduler.flushAll();
    expect(fixture.textarea.style.left).toBe('115px');
    expect(fixture.textarea.style.top).toBe('80px');
    expect(fixture.textarea.style.width).toBe('180px');
    expect(fixture.textarea.style.height).toBe('54px');
    expect(fixture.textarea.style.fontSize).toBe('24px');
    expect(fixture.getWorldRenderCount()).toBe(1);

    fixture.view.unmount();
    expect(fixture.interaction.getSnapshot()).toMatchObject({ kind: 'idle' });
    expect(fixture.commit).not.toHaveBeenCalled();
    fixture.camera.dispose();
  });

  it('preserves native text shortcuts and IME before one exact accepted completion', () => {
    mockViewportBounds();
    const fixture = createHarness({});
    fireEvent.keyDown(fixture.root, { code: 'Enter' });
    fireEvent.input(fixture.textarea, { target: { value: 'After' } });

    fireEvent.keyDown(fixture.textarea, { code: 'KeyC', ctrlKey: true });
    fireEvent.keyDown(fixture.textarea, { code: 'Backspace' });
    fireEvent.keyDown(fixture.textarea, { code: 'Space' });
    expect(fixture.copySelection).not.toHaveBeenCalled();
    expect(fixture.deleteSelection).not.toHaveBeenCalled();
    expect(fixture.root).toHaveAttribute('data-pan-state', 'idle');

    fireEvent.compositionStart(fixture.textarea);
    fixture.textarea.value = 'Composed';
    fireEvent.keyDown(fixture.textarea, { code: 'Enter' });
    expect(fixture.commit).not.toHaveBeenCalled();
    expect(fixture.textarea).toHaveAttribute('data-text-edit-state', 'composing');
    fireEvent.compositionEnd(fixture.textarea);
    expect(fixture.interaction.getSnapshot()).toMatchObject({ draft: 'Composed' });
    fireEvent.keyDown(fixture.textarea, { code: 'Enter' });
    expect(fixture.commit).toHaveBeenCalledOnce();
    expect(fixture.commit).toHaveBeenCalledWith('Composed');
    expect(fixture.interaction.getSnapshot()).toMatchObject({ kind: 'idle' });
    expect(fixture.textarea).toHaveAttribute('hidden');
    expect(document.activeElement).toBe(fixture.root);
    fixture.view.unmount();
    fixture.camera.dispose();
  });

  it('cancels exactly on Escape and keeps a rejected blur draft active', () => {
    mockViewportBounds();
    const cancelled = createHarness({});
    fireEvent.keyDown(cancelled.root, { code: 'Enter' });
    fireEvent.input(cancelled.textarea, { target: { value: 'Discard me' } });
    fireEvent.keyDown(cancelled.textarea, { code: 'Escape' });
    expect(cancelled.interaction.getSnapshot()).toMatchObject({ kind: 'idle' });
    expect(cancelled.commit).not.toHaveBeenCalled();
    cancelled.view.unmount();
    cancelled.camera.dispose();

    const rejected = createHarness({ commit: () => false });
    fireEvent.keyDown(rejected.root, { code: 'Enter' });
    fireEvent.input(rejected.textarea, { target: { value: 'Keep me' } });
    fireEvent.blur(rejected.textarea);
    expect(rejected.commit).toHaveBeenCalledWith('Keep me');
    expect(rejected.interaction.getSnapshot()).toMatchObject({
      draft: 'Keep me',
      kind: 'editingText',
    });
    expect(rejected.textarea).not.toHaveAttribute('hidden');
    rejected.view.unmount();
    rejected.camera.dispose();
  });

  it('keeps multiline Enter native and requires the exact platform primary modifier', () => {
    mockViewportBounds();
    const windows = createHarness({ mode: 'multiline', platform: 'win32' });
    fireEvent.keyDown(windows.root, { code: 'Enter' });
    fireEvent.input(windows.textarea, { target: { value: 'Two\nlines' } });
    fireEvent.keyDown(windows.textarea, { code: 'Enter' });
    fireEvent.keyDown(windows.textarea, { code: 'Enter', metaKey: true });
    expect(windows.commit).not.toHaveBeenCalled();
    fireEvent.keyDown(windows.textarea, { code: 'Enter', ctrlKey: true });
    expect(windows.commit).toHaveBeenCalledOnce();
    windows.view.unmount();
    windows.camera.dispose();

    const mac = createHarness({ mode: 'multiline', platform: 'darwin' });
    fireEvent.keyDown(mac.root, { code: 'Enter' });
    fireEvent.input(mac.textarea, { target: { value: 'Mac\nlines' } });
    fireEvent.keyDown(mac.textarea, { code: 'Enter', ctrlKey: true });
    expect(mac.commit).not.toHaveBeenCalled();
    fireEvent.keyDown(mac.textarea, { code: 'Enter', metaKey: true });
    expect(mac.commit).toHaveBeenCalledOnce();
    mac.view.unmount();
    mac.camera.dispose();
  });
});
