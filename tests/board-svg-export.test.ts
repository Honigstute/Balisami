import { describe, expect, it } from 'vitest';

import { CONTROL_TYPES, parseProjectDocument } from '../src/domain';
import { createBoardPresentationProjection } from '../src/renderer/projects/board-presentation-projection';
import { serializeBoardProjectionToSvg } from '../src/renderer/projects/board-svg-export';
import {
  DOCUMENT_FIXTURE_IDS,
  createValidProjectDocumentInput,
  getFixtureControlProperties,
  getFixtureControlVersion,
} from './fixtures/project-document';

const createProjection = (image = false) => {
  const input = createValidProjectDocumentInput();
  input.boardsById[DOCUMENT_FIXTURE_IDS.board]!.name = 'Main & "Export"';
  if (image) {
    const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child]!;
    child.controlType = CONTROL_TYPES.imagePlaceholder;
    child.controlVersion = getFixtureControlVersion(CONTROL_TYPES.imagePlaceholder);
    child.properties = getFixtureControlProperties(CONTROL_TYPES.imagePlaceholder);
  }
  const parsed = parseProjectDocument(input);
  if (!parsed.ok) throw new Error('SVG export fixture is invalid.');
  const projection = createBoardPresentationProjection(parsed.value, DOCUMENT_FIXTURE_IDS.board);
  if (projection === undefined) throw new Error('SVG export projection is unavailable.');
  return projection;
};

describe('board SVG export', () => {
  it('serializes deterministic projection geometry, styles, title escaping, and dimensions', () => {
    const projection = createProjection();
    const svg = serializeBoardProjectionToSvg(projection, {
      embeddedFontCss: '@font-face{font-family:"Comic Neue";src:url(data:font/woff2;base64,AA==)}',
      height: 240,
      width: 480,
    });

    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(svg).toContain('width="480" height="240"');
    expect(svg).toContain('viewBox="-13.6 26.9 139.2 67.2"');
    expect(svg).toContain('<title>Main &amp; &quot;Export&quot;</title>');
    expect(svg).toContain('@font-face');
    expect(svg).toContain('class="scene-control__outline"');
    expect(svg).not.toContain('scene-control__link-hint');
  });

  it('embeds provided image data without serializing object URLs or interaction links', () => {
    const projection = createProjection(true);
    const imageUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const svg = serializeBoardProjectionToSvg(projection, {
      assetDataUrls: { [DOCUMENT_FIXTURE_IDS.asset]: imageUrl },
      height: 240,
      title: 'Image board',
      width: 480,
    });

    expect(svg).toContain(`href="${imageUrl}"`);
    expect(svg).toContain('aria-label="Image board"');
    expect(svg).not.toContain('blob:');
    expect(svg).not.toContain('role="link"');
  });

  it('rejects invalid output dimensions before serialization', () => {
    const projection = createProjection();
    expect(() => serializeBoardProjectionToSvg(projection, { height: 0, width: 480 })).toThrow(
      'positive safe integers',
    );
  });
});
