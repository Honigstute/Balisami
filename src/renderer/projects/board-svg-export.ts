import { DESIGN_TOKENS } from '../../shared/design-tokens';
import type { IconNode } from '../../shared/icons/icon-catalog';
import type {
  BoardPresentationItem,
  BoardPresentationProjection,
} from './board-presentation-projection';

export interface BoardSvgExportOptions {
  readonly assetDataUrls?: Readonly<Record<string, string>>;
  readonly embeddedFontCss?: string;
  readonly height: number;
  readonly title?: string;
  readonly width: number;
}

const SUPPORTED_ICON_NODE_TAGS = new Set([
  'circle',
  'ellipse',
  'line',
  'path',
  'polygon',
  'polyline',
  'rect',
]);

const escapeText = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const attribute = (name: string, value: boolean | number | string | undefined): string =>
  value === undefined ? '' : ` ${name}="${escapeText(String(value))}"`;

const styleAttribute = (values: Readonly<Record<string, string | number | undefined>>): string => {
  const style = Object.entries(values)
    .flatMap(([name, value]) => (value === undefined ? [] : [`${name}:${String(value)}`]))
    .join(';');
  return style.length === 0 ? '' : attribute('style', style);
};

const serializeIconNode = ([tag, attributes]: IconNode): string => {
  if (!SUPPORTED_ICON_NODE_TAGS.has(tag)) {
    throw new Error(`Icon catalog contains unsupported SVG node '${tag}'.`);
  }
  return `<${tag}${Object.entries(attributes)
    .map(([name, value]) => attribute(name, value))
    .join('')}/>`;
};

const serializeSelectedRowFill = (item: BoardPresentationItem): string => {
  const selected = item.selectedRow;
  if (selected?.appearance !== 'fill') return '';
  return `<rect class="scene-control__row-selection"${attribute('x', selected.bounds.x)}${attribute('y', selected.bounds.y)}${attribute('width', selected.bounds.width)}${attribute('height', selected.bounds.height)}${styleAttribute({ fill: selected.color, 'fill-opacity': selected.fillOpacity })}/>`;
};

const serializeSelectedRowText = (item: BoardPresentationItem): string => {
  const selected = item.selectedRow;
  const layout = item.textLayout;
  if (selected?.appearance !== 'text' || layout === undefined) return '';
  return `<text class="scene-control__selected-row-text" dominant-baseline="alphabetic"${attribute('fill', selected.color)}${attribute('font-size', layout.fontSize)}${attribute('font-style', layout.fontStyle)}${attribute('font-weight', layout.fontWeight)} text-anchor="start"${attribute('text-decoration', layout.textDecoration)}><tspan${attribute('x', selected.labelX)}${attribute('y', selected.baselineY)}>${escapeText(selected.label)}</tspan></text>`;
};

const serializeRows = (item: BoardPresentationItem): string =>
  `<g class="scene-control__row-markers">${item.rows
    .flatMap((row) => {
      const decoration = row.marker ?? row.adornment;
      if (decoration === null) return [];
      const opacity = row.disabled ? DESIGN_TOKENS.opacity.disabled : undefined;
      const stroke = `<path class="scene-control__row-marker-stroke"${attribute('d', decoration.strokePath)}${styleAttribute({ stroke: item.strokeColor })}/>`;
      const fill =
        decoration.fillPath.length === 0
          ? ''
          : `<path class="scene-control__row-marker-fill"${attribute('d', decoration.fillPath)}${styleAttribute({ fill: item.strokeColor })}/>`;
      return [`<g${attribute('opacity', opacity)}>${stroke}${fill}</g>`];
    })
    .join('')}</g>`;

const serializeIcon = (
  item: BoardPresentationItem,
  assetDataUrls: Readonly<Record<string, string>>,
): string => {
  const icon = item.icon;
  if (icon === undefined) return '';
  const content =
    icon.kind === 'catalog'
      ? icon.definition.nodes.map(serializeIconNode).join('')
      : (() => {
          const url = assetDataUrls[icon.assetId];
          return url === undefined
            ? ''
            : `<image x="0" y="0" width="24" height="24" preserveAspectRatio="xMidYMid meet"${attribute('href', url)}/>`;
        })();
  return content.length === 0
    ? ''
    : `<g class="scene-control__catalog-icon"${attribute('transform', icon.transform)}>${content}</g>`;
};

const serializeText = (item: BoardPresentationItem): string => {
  const layout = item.textLayout;
  if (layout === undefined) return '';
  return `<text class="scene-control__text" dominant-baseline="alphabetic"${attribute('font-size', layout.fontSize)}${attribute('font-style', layout.fontStyle)}${attribute('font-weight', layout.fontWeight)}${attribute('fill', layout.color)}${attribute('text-anchor', layout.textAnchor)}${attribute('text-decoration', layout.textDecoration)}>${layout.lines
    .map(
      (line) =>
        `<tspan${attribute('font-size', line.fontSize)}${attribute('font-weight', line.fontWeight)}${attribute('opacity', line.opacity)}${attribute('x', line.x)}${attribute('y', line.baselineY)}>${escapeText(line.text)}</tspan>`,
    )
    .join('')}</text>`;
};

const serializeFill = (item: BoardPresentationItem): string => {
  if (!item.hasFill) return '';
  const style = styleAttribute({ fill: item.fillColor });
  return item.fillPath.length > 0
    ? `<path class="scene-control__fill"${attribute('d', item.fillPath)}${style}/>`
    : `<rect class="scene-control__fill"${attribute('x', item.primitiveBounds.x)}${attribute('y', item.primitiveBounds.y)}${attribute('width', item.primitiveBounds.width)}${attribute('height', item.primitiveBounds.height)}${attribute('rx', item.fillRadiusX)}${attribute('ry', item.fillRadiusY)}${style}/>`;
};

const serializeItem = (
  item: BoardPresentationItem,
  assetDataUrls: Readonly<Record<string, string>>,
): string => {
  const assetId = item.visualKind === 'image' ? item.assetIds[0] : undefined;
  const imageUrl = assetId === undefined ? undefined : assetDataUrls[assetId];
  const image =
    imageUrl === undefined
      ? ''
      : `<image class="scene-control__image"${attribute('x', item.bounds.x)}${attribute('y', item.bounds.y)}${attribute('width', item.bounds.width)}${attribute('height', item.bounds.height)} preserveAspectRatio="xMidYMid meet"${attribute('href', imageUrl)}/>`;
  const outline =
    item.hasOutline && item.outlinePath.length > 0
      ? `<path class="scene-control__outline"${attribute('d', item.outlinePath)}${styleAttribute({ stroke: item.strokeColor })} vector-effect="non-scaling-stroke"/>`
      : '';
  const mark =
    imageUrl === undefined && item.markPath.length > 0
      ? `<path class="scene-control__mark"${attribute('d', item.markPath)}${styleAttribute({ fill: item.markFillColor, stroke: item.markStrokeColor ?? item.strokeColor })} vector-effect="non-scaling-stroke"/>`
      : '';
  return `<g${attribute('data-control-stroke-style', item.strokeStyle)}${attribute('data-control-visual', item.visualKind)}${attribute('opacity', item.opacity)}>${serializeFill(item)}${serializeSelectedRowFill(item)}${image}${outline}${mark}${serializeRows(item)}${serializeIcon(item, assetDataUrls)}${serializeText(item)}${serializeSelectedRowText(item)}</g>`;
};

const createStyle = (embeddedFontCss: string): string => `${embeddedFontCss}
svg{background:${DESIGN_TOKENS.color.canvas}}
.scene-control__fill{fill:${DESIGN_TOKENS.color.canvas}}
.scene-control__outline,.scene-control__mark,.scene-control__row-marker-stroke{fill:none;stroke:${DESIGN_TOKENS.color.ink};stroke-linecap:round;stroke-linejoin:round;stroke-width:${String(DESIGN_TOKENS.control.borderWidth * 2)}}
[data-control-stroke-style="dashed"] .scene-control__outline,[data-control-stroke-style="dashed"] .scene-control__mark{stroke-dasharray:${String(DESIGN_TOKENS.space[2])} ${String(DESIGN_TOKENS.space[1])}}
[data-control-stroke-style="dotted"] .scene-control__outline,[data-control-stroke-style="dotted"] .scene-control__mark{stroke-dasharray:${String(DESIGN_TOKENS.control.borderWidth)} ${String(DESIGN_TOKENS.space[1])}}
.scene-control__row-marker-fill{fill:${DESIGN_TOKENS.color.ink}}
.scene-control__text,.scene-control__selected-row-text{fill:${DESIGN_TOKENS.color.ink};font-family:"${DESIGN_TOKENS.font.family.wireframe}";font-weight:${String(DESIGN_TOKENS.font.weight.regular)}}
.scene-control__row-selection{fill:${DESIGN_TOKENS.color.accentStrong};fill-opacity:${String(DESIGN_TOKENS.opacity.selectionFill)}}
.scene-control__catalog-icon{color:${DESIGN_TOKENS.color.ink};fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
[data-control-visual="input"] .scene-control__fill,[data-control-visual="search-box"] .scene-control__fill{fill:${DESIGN_TOKENS.color.chrome}}`;

/** Serializes the same uncapped projection used by presentation into a self-contained SVG. */
export const serializeBoardProjectionToSvg = (
  projection: BoardPresentationProjection,
  options: BoardSvgExportOptions,
): string => {
  if (
    !Number.isSafeInteger(options.width) ||
    !Number.isSafeInteger(options.height) ||
    options.width <= 0 ||
    options.height <= 0
  ) {
    throw new TypeError('Export SVG dimensions must be positive safe integers.');
  }
  const title = options.title ?? projection.canonicalBoardName;
  const assets = options.assetDataUrls ?? {};
  const style = createStyle(options.embeddedFontCss ?? '');
  const viewBox = projection.viewBox;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" role="img"${attribute('aria-label', title)}${attribute('width', options.width)}${attribute('height', options.height)}${attribute('viewBox', `${String(viewBox.x)} ${String(viewBox.y)} ${String(viewBox.width)} ${String(viewBox.height)}`)} preserveAspectRatio="xMidYMid meet"><title>${escapeText(title)}</title><style>${style}</style><rect${attribute('x', viewBox.x)}${attribute('y', viewBox.y)}${attribute('width', viewBox.width)}${attribute('height', viewBox.height)} fill="${DESIGN_TOKENS.color.canvas}"/>${projection.items.map((item) => serializeItem(item, assets)).join('')}</svg>`;
};
