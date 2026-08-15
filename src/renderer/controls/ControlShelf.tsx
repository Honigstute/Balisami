import { listPaletteControlSpecs, type ControlTypeId } from '../../domain';

interface ControlShelfProps {
  readonly onInsert: (controlType: ControlTypeId) => boolean;
}

/** Fixed slots prevent labels and preview geometry from resizing the shelf. */
export const ControlShelf = ({ onInsert }: ControlShelfProps) => (
  <div aria-label="Available controls" className="control-library" role="toolbar">
    {listPaletteControlSpecs().map((spec) => {
      const palette = spec.palette;
      if (palette === null) {
        return null;
      }
      const text = spec.capabilities.text;
      const textValue = text === null ? undefined : spec.defaultProperties[text.property];
      const previewText = typeof textValue === 'string' ? textValue : undefined;
      return (
        <button
          aria-label={`Insert ${palette.label}`}
          className="control-library__item"
          key={spec.type}
          onClick={() => onInsert(spec.type)}
          title={`Insert ${palette.label}`}
          type="button"
        >
          <span
            aria-hidden="true"
            className="control-library__preview"
            data-control-preview={spec.scene.kind}
          >
            {previewText === undefined ? null : <span>{previewText}</span>}
          </span>
          <span className="control-library__label">{palette.label}</span>
        </button>
      );
    })}
  </div>
);
