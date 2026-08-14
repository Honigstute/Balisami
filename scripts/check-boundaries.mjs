import { builtinModules } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, 'src');
const supportedExtensions = new Set(['.ts', '.tsx']);
const builtinPackages = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
]);

const forbiddenTargets = {
  domain: new Set(['main', 'persistence', 'preload', 'renderer']),
  main: new Set(['preload', 'renderer']),
  persistence: new Set(['main', 'preload', 'renderer']),
  preload: new Set(['domain', 'main', 'persistence', 'preload', 'renderer']),
  renderer: new Set(['main', 'persistence', 'preload']),
  shared: new Set(['domain', 'main', 'persistence', 'preload', 'renderer']),
};

const platformFreeLayers = new Set(['domain', 'renderer', 'shared']);

const collectFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(entryPath);
      }
      return supportedExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
    }),
  );
  return nested.flat();
};

const getLayer = (filePath) => {
  const relativePath = path.relative(sourceRoot, filePath);
  return relativePath.split(path.sep)[0];
};

const getImportedSpecifiers = (sourceFile) => {
  const specifiers = [];

  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push({
        value: node.moduleSpecifier.text,
        line: sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1,
      });
    }

    if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const [argument] = node.arguments;
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if (
        (isDynamicImport || isRequire) &&
        argument !== undefined &&
        ts.isStringLiteral(argument)
      ) {
        specifiers.push({
          value: argument.text,
          line: sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1,
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return specifiers;
};

const resolveTargetLayer = (importerPath, specifier) => {
  if (!specifier.startsWith('.')) {
    return null;
  }
  return getLayer(path.resolve(path.dirname(importerPath), specifier));
};

const files = await collectFiles(sourceRoot);
const violations = [];

for (const filePath of files) {
  const layer = getLayer(filePath);
  const sourceText = await readFile(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  for (const { value: specifier, line } of getImportedSpecifiers(sourceFile)) {
    if (
      platformFreeLayers.has(layer) &&
      (specifier === 'electron' || builtinPackages.has(specifier))
    ) {
      violations.push(
        `${path.relative(projectRoot, filePath)}:${line} ${layer} cannot import ${specifier}`,
      );
    }

    if (layer === 'preload' && builtinPackages.has(specifier)) {
      violations.push(
        `${path.relative(projectRoot, filePath)}:${line} preload cannot import ${specifier}`,
      );
    }

    const targetLayer = resolveTargetLayer(filePath, specifier);
    if (targetLayer !== null && forbiddenTargets[layer]?.has(targetLayer)) {
      violations.push(
        `${path.relative(projectRoot, filePath)}:${line} ${layer} cannot depend on ${targetLayer}`,
      );
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(`Module boundary violations:\n${violations.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Module boundaries verified across ${String(files.length)} source files.\n`);
}
