import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { row } from './lib.mjs';

// Adapter: only when the repo has a tsconfig/jsconfig AND its own typescript
// package, so path aliases and compiler options match what the repo's tsc sees.
export function tsAvailable(root) {
  const cfg = ['tsconfig.json', 'jsconfig.json'].map((f) => path.join(root, f)).find((f) => fs.existsSync(f));
  if (!cfg) return null;
  try {
    const ts = createRequire(path.join(root, 'package.json'))('typescript');
    return { ts, cfg };
  } catch {
    return null;
  }
}

function languageService({ ts, cfg }, root) {
  const read = ts.readConfigFile(cfg, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(cfg));
  const host = {
    getScriptFileNames: () => parsed.fileNames,
    getScriptVersion: () => '0',
    getScriptSnapshot: (f) => (fs.existsSync(f) ? ts.ScriptSnapshot.fromString(fs.readFileSync(f, 'utf8')) : undefined),
    getCurrentDirectory: () => root,
    getCompilationSettings: () => parsed.options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());
  return { service, program: service.getProgram(), options: parsed.options };
}

const ownFile = (f) => !f.includes('/node_modules/') && !f.endsWith('.d.ts');

const DECL_KINDS = new Set([
  'FunctionDeclaration', 'ClassDeclaration', 'VariableDeclaration', 'InterfaceDeclaration',
  'TypeAliasDeclaration', 'EnumDeclaration', 'MethodDeclaration', 'PropertyDeclaration',
  'PropertySignature', 'MethodSignature', 'PropertyAssignment',
]);

export function symbolRefs(adapter, root, name) {
  const { ts } = adapter;
  const { service, program } = languageService(adapter, root);
  const decls = [];
  for (const sf of program.getSourceFiles()) {
    if (!ownFile(sf.fileName)) continue;
    const visit = (node) => {
      if (DECL_KINDS.has(ts.SyntaxKind[node.kind]) && node.name && ts.isIdentifier(node.name) && node.name.text === name) {
        decls.push({ file: sf.fileName, pos: node.name.getStart(sf) });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  const rows = [];
  const seen = new Set();
  for (const d of decls) {
    for (const group of service.findReferences(d.file, d.pos) ?? []) {
      for (const ref of group.references) {
        if (!ownFile(ref.fileName)) continue;
        const key = `${ref.fileName}:${ref.textSpan.start}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const sf = program.getSourceFile(ref.fileName);
        const line = sf.getLineAndCharacterOfPosition(ref.textSpan.start).line + 1;
        rows.push(row('TS', root, ref.fileName, line, ref.isDefinition ? 'definition' : 'reference'));
      }
    }
  }
  return { rows, declarations: decls.length };
}

export function fileImporters(adapter, root, target) {
  const { ts } = adapter;
  const { program, options } = languageService(adapter, root);
  const abs = fs.realpathSync(path.resolve(root, target));
  const rows = [];
  for (const sf of program.getSourceFiles()) {
    if (!ownFile(sf.fileName) || sf.fileName === abs) continue;
    const check = (spec, node, how) => {
      const r = ts.resolveModuleName(spec, sf.fileName, options, ts.sys).resolvedModule;
      if (r && fs.realpathSync(r.resolvedFileName) === abs) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        rows.push(row('TS', root, sf.fileName, line, how));
      }
    };
    const visit = (node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        check(node.moduleSpecifier.text, node, ts.isImportDeclaration(node) ? 'imports it' : 're-exports it');
      } else if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteral(node.arguments[0])
        && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        check(node.arguments[0].text, node, 'dynamically imports it');
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return rows;
}
