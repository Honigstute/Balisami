// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { CONTROL_TYPES } from '../src/domain';
import {
  MAX_CONTROL_DRAG_PAYLOAD_LENGTH,
  parseDraggedControlEntry,
} from '../src/renderer/controls/control-drag-transfer';

describe('control drag transfer', () => {
  it('accepts exact base, preset, and legacy payloads', () => {
    expect(
      parseDraggedControlEntry(
        JSON.stringify({ controlType: CONTROL_TYPES.textInput, presetId: null }),
      ),
    ).toEqual({ controlType: CONTROL_TYPES.textInput });
    expect(
      parseDraggedControlEntry(
        JSON.stringify({ controlType: CONTROL_TYPES.textInput, presetId: 'underline' }),
      ),
    ).toEqual({ controlType: CONTROL_TYPES.textInput, presetId: 'underline' });
    expect(parseDraggedControlEntry(CONTROL_TYPES.button)).toEqual({
      controlType: CONTROL_TYPES.button,
    });
  });

  it('rejects malformed, mismatched, unknown, and oversized payloads', () => {
    for (const payload of [
      JSON.stringify({ controlType: CONTROL_TYPES.textInput }),
      JSON.stringify({ controlType: CONTROL_TYPES.textInput, extra: true, presetId: null }),
      JSON.stringify({ controlType: 42, presetId: null }),
      JSON.stringify({ controlType: null, presetId: null }),
      JSON.stringify({ controlType: CONTROL_TYPES.textInput, presetId: 42 }),
      JSON.stringify({ controlType: CONTROL_TYPES.textInput, presetId: false }),
      JSON.stringify({ controlType: CONTROL_TYPES.textInput, presetId: 'missing' }),
      JSON.stringify({ controlType: 'wireframe.unknown', presetId: null }),
      JSON.stringify([CONTROL_TYPES.textInput, null]),
      JSON.stringify(null),
      JSON.stringify(CONTROL_TYPES.textInput),
      'x'.repeat(MAX_CONTROL_DRAG_PAYLOAD_LENGTH + 1),
    ]) {
      expect(parseDraggedControlEntry(payload)).toBeUndefined();
    }
  });
});
