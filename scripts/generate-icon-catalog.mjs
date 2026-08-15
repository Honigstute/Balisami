import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSemanticAliases, ICON_SOURCE } from './icon-curation.mjs';

const require = createRequire(import.meta.url);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = dirname(require.resolve(`${ICON_SOURCE.package}/package.json`));
const sourcePackage = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

if (
  sourcePackage.version !== ICON_SOURCE.version ||
  sourcePackage.license !== ICON_SOURCE.license
) {
  throw new Error(
    `Unexpected icon source: ${sourcePackage.name}@${sourcePackage.version} (${sourcePackage.license}).`,
  );
}

const sourceNodes = JSON.parse(readFileSync(join(packageRoot, 'icon-nodes.json'), 'utf8'));
const sourceTags = JSON.parse(readFileSync(join(packageRoot, 'tags.json'), 'utf8'));
const sourceNames = Object.keys(sourceNodes).sort();
const sourceNameSet = new Set(sourceNames);
const semanticAliases = buildSemanticAliases(sourceNames);

const normalizeSvgGeometry = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg[\s\S]*?>/, '')
    .replace(/<\/svg>/, '')
    .replace(/\s+/g, ' ')
    .trim();

const svgDirectory = join(packageRoot, 'icons');
const svgNames = readdirSync(svgDirectory)
  .filter((name) => name.endsWith('.svg'))
  .map((name) => name.slice(0, -'.svg'.length))
  .sort();
const namesByGeometry = new Map();

for (const name of svgNames) {
  const geometry = normalizeSvgGeometry(readFileSync(join(svgDirectory, `${name}.svg`), 'utf8'));
  const names = namesByGeometry.get(geometry) ?? [];
  names.push(name);
  namesByGeometry.set(geometry, names);
}

const officialAliases = new Map();
for (const name of svgNames.filter((value) => !sourceNameSet.has(value))) {
  const geometry = normalizeSvgGeometry(readFileSync(join(svgDirectory, `${name}.svg`), 'utf8'));
  const targets = (namesByGeometry.get(geometry) ?? []).filter((value) => sourceNameSet.has(value));
  if (targets.length !== 1) {
    throw new Error(`Official alias ${name} did not resolve to exactly one canonical icon.`);
  }
  officialAliases.set(name, targets[0]);
}

const resolveSemanticTarget = (name) => {
  const visited = new Set();
  let current = name;
  while (semanticAliases.has(current)) {
    if (visited.has(current)) {
      throw new Error(`Icon semantic alias cycle detected at ${current}.`);
    }
    visited.add(current);
    current = semanticAliases.get(current).to;
  }
  return current;
};

const survivors = sourceNames.filter((name) => resolveSemanticTarget(name) === name);
const aliasesByTarget = new Map(survivors.map((name) => [name, []]));

for (const [alias, initialTarget] of [...officialAliases, ...semanticAliases].map(
  ([from, value]) => [from, typeof value === 'string' ? value : value.to],
)) {
  const target = resolveSemanticTarget(initialTarget);
  const aliases = aliasesByTarget.get(target);
  if (aliases === undefined) {
    throw new Error(`Icon alias ${alias} resolved to missing survivor ${target}.`);
  }
  aliases.push(alias);
}

const titleCase = (name) =>
  name
    .split('-')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');

const uniqueSorted = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
const iconCatalog = survivors.map((id) => {
  const aliases = uniqueSorted(aliasesByTarget.get(id) ?? []);
  const mergedTags = [id, ...(sourceTags[id] ?? [])];
  for (const alias of aliases) {
    mergedTags.push(alias, ...(sourceTags[alias] ?? []));
  }
  return {
    aliases,
    id,
    keywords: uniqueSorted(mergedTags.flatMap((value) => [value, ...value.split('-')])),
    label: titleCase(id),
    nodes: sourceNodes[id],
  };
});

const geometryKeys = new Map();
for (const icon of iconCatalog) {
  const key = JSON.stringify(icon.nodes);
  if (geometryKeys.has(key)) {
    throw new Error(`Surviving icons ${geometryKeys.get(key)} and ${icon.id} share geometry.`);
  }
  geometryKeys.set(key, icon.id);
}

const reasonCounts = {};
for (const value of semanticAliases.values()) {
  reasonCounts[value.reason] = (reasonCounts[value.reason] ?? 0) + 1;
}

const output = {
  counts: {
    officialAliases: officialAliases.size,
    semanticDuplicatesRemoved: semanticAliases.size,
    sourceIcons: sourceNames.length,
    survivingIcons: iconCatalog.length,
  },
  icons: iconCatalog,
  source: ICON_SOURCE,
};

const generatedJsonPath = join(projectRoot, 'src/shared/icons/icon-catalog.generated.json');
const generatedDocsPath = join(projectRoot, 'docs/ICON_CATALOG.generated.md');
const licensePath = join(projectRoot, 'licenses/LUCIDE.txt');
mkdirSync(dirname(generatedJsonPath), { recursive: true });
mkdirSync(dirname(licensePath), { recursive: true });
writeFileSync(generatedJsonPath, `${JSON.stringify(output)}\n`);
writeFileSync(licensePath, readFileSync(join(packageRoot, 'LICENSE'), 'utf8'));

const groupedSurvivors = Map.groupBy(survivors, (name) => name.slice(0, 1).toUpperCase());
const markdown = [
  '# Generated curated icon catalog',
  '',
  '> Generated by `npm run generate:icons`. Do not edit this file manually.',
  '',
  `Source: \`${ICON_SOURCE.package}@${ICON_SOURCE.version}\` (${ICON_SOURCE.license}).`,
  '',
  `- Source canonical outline icons: **${sourceNames.length}**`,
  `- Source synonym/legacy aliases: **${officialAliases.size}**`,
  `- Additional duplicate-meaning icons removed: **${semanticAliases.size}**`,
  `- Selectable icons remaining: **${survivors.length}**`,
  '',
  '## Curation removals',
  '',
  ...Object.entries(reasonCounts)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([reason, count]) => `- ${reason}: ${count}`),
  '',
  ...[...semanticAliases.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(
      ([from, value]) => `- \`${from}\` → \`${resolveSemanticTarget(value.to)}\` (${value.reason})`,
    ),
  '',
  '## Surviving selectable icon IDs',
  '',
];

for (const [letter, names] of [...groupedSurvivors.entries()].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  markdown.push(`### ${letter} (${names.length})`, '');
  for (let index = 0; index < names.length; index += 12) {
    markdown.push(
      names
        .slice(index, index + 12)
        .map((name) => `\`${name}\``)
        .join(', '),
      '',
    );
  }
}

writeFileSync(generatedDocsPath, `${markdown.join('\n').trim()}\n`);

console.log(
  `Generated ${iconCatalog.length} icons at ${relative(projectRoot, generatedJsonPath)}.`,
);
