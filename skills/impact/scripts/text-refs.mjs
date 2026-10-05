import path from 'node:path';
import { read, lineAt, lineText, wordRe, literalRe, CODE_EXT, CONFIG_EXT, DOC_EXT, row } from './lib.mjs';

const layerOf = (rel) => (DOC_EXT.test(rel) ? 'docs' : CONFIG_EXT.test(rel) ? 'config' : CODE_EXT.test(rel) || rel.endsWith('.sql') ? 'text' : null);

// How a file is named by the code that depends on it, in any language:
// its module path (a/b/mod, a.b.mod) anywhere, or its base name on an
// import-like line (import / from / require / use / include / load / source).
export function fileMatchers(relTarget) {
  const noExt = relTarget.replace(/\.[^./]+$/, '');
  const base = path.basename(noExt);
  const parts = noExt.split(path.sep);
  const tails = parts.map((_, i) => parts.slice(i).join('/')).filter((t) => t.includes('/'));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    ...tails.map((t) => literalRe(t)),
    ...tails.map((t) => literalRe(t.replace(/\//g, '.'))),
    new RegExp(String.raw`^\s*(?:import|from|export|require|use|using|include|#include|load|source|@import|mod)\b.*(?<![\w-])${esc(base)}(?![\w-])`, 'gm'),
    new RegExp(String.raw`(?:require|import)\s*\(\s*['"][^'"]*(?<![\w-])${esc(base)}(?:\.[a-z]+)?['"]`, 'g'),
  ];
}

// Universal layer: mentions in any language, config and docs.
// terms: [name] or [table, column] (the column only counts in files naming the table).
// matchers: regexes used instead of terms (file targets).
// skip: "file:line" already reported by a precise adapter.
export function textRefs(root, files, { terms, matchers }, skip, excludeFiles) {
  const rows = [];
  for (const file of files) {
    if (excludeFiles.has(file)) continue;
    const rel = path.relative(root, file);
    const layer = layerOf(rel);
    if (!layer) continue;
    const text = read(file);
    if (!text) continue;
    let res;
    if (matchers) {
      res = matchers;
    } else {
      if (terms.length > 1 && !terms.slice(0, -1).every((t) => wordRe(t, 'i').test(text))) continue;
      const caseInsensitive = layer !== 'text' || rel.endsWith('.sql');
      res = [wordRe(terms[terms.length - 1], caseInsensitive ? 'gi' : 'g')];
    }
    const lines = new Set();
    for (const re of res) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        lines.add(lineAt(text, m.index));
        if (m[0] === '') re.lastIndex++;
      }
    }
    for (const line of lines) {
      if (skip.has(`${rel}:${line}`)) continue;
      rows.push(row(layer, root, file, line, layer === 'docs' ? 'mentions it' : lineText(text, line)));
    }
  }
  return rows;
}
