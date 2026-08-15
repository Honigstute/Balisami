import { CONTROL_TEXT_POLICY } from '../../shared/control-text';
import { DESIGN_TOKENS } from '../../shared/design-tokens';

export const CONTROL_TEXT_MEASUREMENT_POLICY = Object.freeze({
  fontProbeSize: 16,
  fontProbeText: 'Hg',
  maximumFontSize: CONTROL_TEXT_POLICY.maximumFontSize,
  maximumLineHeight: CONTROL_TEXT_POLICY.maximumLineHeight,
  maximumTextLength: CONTROL_TEXT_POLICY.maximumLength,
  precision: CONTROL_TEXT_POLICY.measurementPrecision,
});

export type ControlTextMeasurementErrorCode =
  'canvas-unavailable' | 'font-unavailable' | 'invalid-input' | 'invalid-metrics';

export class ControlTextMeasurementError extends Error {
  readonly code: ControlTextMeasurementErrorCode;

  constructor(code: ControlTextMeasurementErrorCode, message: string) {
    super(message);
    this.name = 'ControlTextMeasurementError';
    this.code = code;
  }
}

export interface ControlTextMeasurementRequest {
  readonly fontSize: number;
  readonly lineHeight?: number;
  readonly mode: 'multiline' | 'single-line';
  readonly text: string;
}

export interface ControlTextMeasurement {
  /** Alphabetic baselines measured from the top of the complete text layout. */
  readonly baselineOffsets: readonly number[];
  readonly height: number;
  readonly lineCount: number;
  readonly lineHeight: number;
  readonly width: number;
}

export interface ControlTextMeasurementService {
  readonly measure: (request: ControlTextMeasurementRequest) => ControlTextMeasurement;
}

export interface ControlTextCanvasContext {
  font: string;
  textBaseline: CanvasTextBaseline;
  readonly measureText: (
    text: string,
  ) => Pick<TextMetrics, 'actualBoundingBoxAscent' | 'actualBoundingBoxDescent' | 'width'>;
}

export interface ControlFontFaceSet {
  readonly check: (font: string, text?: string) => boolean;
  readonly load: (font: string, text?: string) => Promise<unknown>;
  readonly ready: Promise<unknown>;
}

export type ControlAutoSizeAxis = 'both' | 'horizontal' | 'vertical';

export interface ControlAutoSizeInsets {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

export interface ControlAutoSize {
  readonly height: number;
  readonly width: number;
}

export interface ControlTextAutoSizeInput {
  readonly axis: ControlAutoSizeAxis;
  readonly currentSize: ControlAutoSize;
  readonly insets: ControlAutoSizeInsets;
  readonly maximumSize?: ControlAutoSize;
  readonly measurement: Pick<ControlTextMeasurement, 'height' | 'width'>;
  readonly minimumSize: ControlAutoSize;
}

const createFontShorthand = (fontSize: number): string =>
  `${String(DESIGN_TOKENS.font.weight.regular)} ${String(fontSize)}px "${DESIGN_TOKENS.font.family.wireframe}"`;

const roundMeasurement = (value: number): number => {
  const rounded =
    Math.round(value * CONTROL_TEXT_MEASUREMENT_POLICY.precision) /
    CONTROL_TEXT_MEASUREMENT_POLICY.precision;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const throwInvalidInput = (message: string): never => {
  throw new ControlTextMeasurementError('invalid-input', message);
};

const normalizeLines = (
  text: string,
  mode: ControlTextMeasurementRequest['mode'],
): readonly string[] => {
  const normalizedNewlines = text.replace(/\r\n?|\n/gu, '\n');
  return mode === 'single-line'
    ? Object.freeze([normalizedNewlines.replace(/\n/gu, ' ')])
    : Object.freeze(normalizedNewlines.split('\n'));
};

const validateRequest = (request: ControlTextMeasurementRequest): number => {
  if (
    typeof request.text !== 'string' ||
    request.text.length > CONTROL_TEXT_MEASUREMENT_POLICY.maximumTextLength ||
    (request.mode !== 'multiline' && request.mode !== 'single-line') ||
    !Number.isFinite(request.fontSize) ||
    request.fontSize <= 0 ||
    request.fontSize > CONTROL_TEXT_MEASUREMENT_POLICY.maximumFontSize
  ) {
    return throwInvalidInput('Control text measurement received invalid text or font settings.');
  }
  const lineHeight = request.lineHeight ?? DESIGN_TOKENS.font.lineHeight;
  if (
    !Number.isFinite(lineHeight) ||
    lineHeight <= 0 ||
    lineHeight > CONTROL_TEXT_MEASUREMENT_POLICY.maximumLineHeight
  ) {
    return throwInvalidInput('Control text measurement received an invalid line height.');
  }
  return lineHeight;
};

const validateMetric = (value: number): number => {
  if (!Number.isFinite(value) || value < 0) {
    throw new ControlTextMeasurementError(
      'invalid-metrics',
      'The bundled font returned invalid measurement data.',
    );
  }
  return value;
};

/**
 * Creates the synchronous measurement authority used after bundled fonts are ready.
 * Results are rounded once to stable world-unit precision; document geometry never
 * depends on DOM element bounds or platform fallback fonts.
 */
export const createControlTextMeasurementService = (
  context: ControlTextCanvasContext,
): ControlTextMeasurementService =>
  Object.freeze({
    measure: (request: ControlTextMeasurementRequest): ControlTextMeasurement => {
      const lineHeightMultiplier = validateRequest(request);
      const lines = normalizeLines(request.text, request.mode);
      context.font = createFontShorthand(request.fontSize);
      context.textBaseline = 'alphabetic';

      const probe = context.measureText(CONTROL_TEXT_MEASUREMENT_POLICY.fontProbeText);
      const ascent = validateMetric(probe.actualBoundingBoxAscent);
      const descent = validateMetric(probe.actualBoundingBoxDescent);
      if (ascent + descent <= 0) {
        throw new ControlTextMeasurementError(
          'invalid-metrics',
          'The bundled font did not expose usable vertical metrics.',
        );
      }

      const lineHeight = roundMeasurement(request.fontSize * lineHeightMultiplier);
      const firstBaseline = roundMeasurement((lineHeight - ascent - descent) / 2 + ascent);
      if (firstBaseline < 0 || firstBaseline > lineHeight) {
        throw new ControlTextMeasurementError(
          'invalid-metrics',
          'The bundled font metrics do not fit the requested line box.',
        );
      }

      let width = 0;
      for (const line of lines) {
        width = Math.max(width, validateMetric(context.measureText(line).width));
      }
      const baselineOffsets = Object.freeze(
        lines.map((_, index) => roundMeasurement(firstBaseline + lineHeight * index)),
      );
      return Object.freeze({
        baselineOffsets,
        height: roundMeasurement(lineHeight * lines.length),
        lineCount: lines.length,
        lineHeight,
        width: roundMeasurement(width),
      });
    },
  });

/** Explicitly loads and checks Comic Neue so measurement never falls back silently. */
export const prepareBundledWireframeFont = async (
  fontFaceSet: ControlFontFaceSet,
): Promise<void> => {
  const font = createFontShorthand(CONTROL_TEXT_MEASUREMENT_POLICY.fontProbeSize);
  try {
    await fontFaceSet.load(font, CONTROL_TEXT_MEASUREMENT_POLICY.fontProbeText);
    await fontFaceSet.ready;
  } catch {
    throw new ControlTextMeasurementError(
      'font-unavailable',
      'The bundled wireframe font could not be loaded.',
    );
  }
  if (!fontFaceSet.check(font, CONTROL_TEXT_MEASUREMENT_POLICY.fontProbeText)) {
    throw new ControlTextMeasurementError(
      'font-unavailable',
      'The bundled wireframe font is unavailable.',
    );
  }
};

/** Browser adapter; native/filesystem access remains outside the renderer. */
export const createBrowserControlTextMeasurementService = async (
  ownerDocument: Document = document,
): Promise<ControlTextMeasurementService> => {
  const fontFaceSet: FontFaceSet | undefined = ownerDocument.fonts;
  if (fontFaceSet === undefined) {
    throw new ControlTextMeasurementError(
      'font-unavailable',
      'The renderer does not expose bundled font readiness.',
    );
  }
  await prepareBundledWireframeFont(fontFaceSet);
  const context = ownerDocument.createElement('canvas').getContext('2d');
  if (context === null) {
    throw new ControlTextMeasurementError(
      'canvas-unavailable',
      'The renderer could not create the text measurement surface.',
    );
  }
  return createControlTextMeasurementService(context);
};

const browserMeasurementServices = new WeakMap<Document, Promise<ControlTextMeasurementService>>();

/** One disposable derived service per renderer document; registry/data remain authoritative. */
export const getBrowserControlTextMeasurementService = (
  ownerDocument: Document = document,
): Promise<ControlTextMeasurementService> => {
  const existing = browserMeasurementServices.get(ownerDocument);
  if (existing !== undefined) {
    return existing;
  }
  const created = createBrowserControlTextMeasurementService(ownerDocument);
  browserMeasurementServices.set(ownerDocument, created);
  return created;
};

const validateSize = (label: string, size: ControlAutoSize): void => {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throwInvalidInput(`${label} contains invalid dimensions.`);
  }
};

/** Pure auto-size projection; the caller commits its result through one validated command. */
export const calculateControlTextAutoSize = (input: ControlTextAutoSizeInput): ControlAutoSize => {
  if (input.axis !== 'both' && input.axis !== 'horizontal' && input.axis !== 'vertical') {
    throwInvalidInput('Control auto-size received an invalid axis policy.');
  }
  validateSize('Current control size', input.currentSize);
  validateSize('Minimum control size', input.minimumSize);
  if (input.maximumSize !== undefined) {
    validateSize('Maximum control size', input.maximumSize);
    if (
      input.maximumSize.width < input.minimumSize.width ||
      input.maximumSize.height < input.minimumSize.height
    ) {
      throwInvalidInput('Control auto-size maximum is smaller than its minimum.');
    }
  }
  if (
    !Number.isFinite(input.measurement.width) ||
    !Number.isFinite(input.measurement.height) ||
    input.measurement.width < 0 ||
    input.measurement.height < 0 ||
    Object.values(input.insets).some((value) => !Number.isFinite(value) || value < 0)
  ) {
    throwInvalidInput('Control auto-size received invalid measurement or inset data.');
  }

  const measuredWidth = input.measurement.width + input.insets.left + input.insets.right;
  const measuredHeight = input.measurement.height + input.insets.top + input.insets.bottom;
  if (!Number.isFinite(measuredWidth) || !Number.isFinite(measuredHeight)) {
    throwInvalidInput('Control auto-size exceeds finite world geometry.');
  }
  const clamp = (value: number, minimum: number, maximum: number | undefined): number =>
    roundMeasurement(Math.min(maximum ?? value, Math.max(minimum, value)));
  return Object.freeze({
    height:
      input.axis === 'horizontal'
        ? input.currentSize.height
        : clamp(measuredHeight, input.minimumSize.height, input.maximumSize?.height),
    width:
      input.axis === 'vertical'
        ? input.currentSize.width
        : clamp(measuredWidth, input.minimumSize.width, input.maximumSize?.width),
  });
};
