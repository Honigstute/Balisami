export interface AlphaAcceptanceFrame {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

const freezeFrame = (frame: AlphaAcceptanceFrame): AlphaAcceptanceFrame => Object.freeze(frame);

/**
 * One deterministic composition shared by the renderer and packaged verifier.
 * It stays inside the minimum fixed-shell canvas on both native platforms.
 */
export const PROJECT_WORKFLOW_ALPHA_LAYOUT = Object.freeze({
  rectangle: freezeFrame({ x: 40, y: 50, width: 330, height: 320 }),
  textLabel: freezeFrame({ x: 68, y: 82, width: 230, height: 36 }),
  button: freezeFrame({ x: 68, y: 222, width: 136, height: 44 }),
  textInput: freezeFrame({ x: 68, y: 150, width: 250, height: 44 }),
});

export const PROJECT_WORKFLOW_ALPHA_BUTTON_TEXT = 'Alpha button';
