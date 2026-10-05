import { read, lineAt, literalRe, kindOf, row, CODE_EXT } from './lib.mjs';
import path from 'node:path';

const ATTRS = 'data-testid|data-test-id|data-test|data-cy|data-qa|testID';

// attr="x", attr={'x'}, attr={"x"}, and the static prefix of attr={`x-${k}`}
// (reported as "x-*").
export function testidsIn(text) {
  const ids = new Set();
  const re = new RegExp(String.raw`(?:${ATTRS})=(?:"([^"]+)"|'([^']+)'|\{\s*['"]([^'"]+)['"]\s*\}|\{\s*\`([^\`$]*)\$\{)`, 'g');
  let m;
  while ((m = re.exec(text))) ids.add(m[1] ?? m[2] ?? m[3] ?? `${m[4]}*`);
  return [...ids];
}

export function testidRefs(root, files, ids) {
  const rows = [];
  for (const file of files) {
    const rel = path.relative(root, file);
    if (!CODE_EXT.test(rel)) continue;
    const text = read(file);
    if (!text) continue;
    const isTest = kindOf(rel) !== 'code';
    const rendered = isTest ? [] : testidsIn(text);
    for (const id of ids) {
      const needle = id.endsWith('*') ? id.slice(0, -1) : id;
      if (isTest) {
        const re = literalRe(needle);
        let m;
        while ((m = re.exec(text))) rows.push(row('testid', root, file, lineAt(text, m.index), `selects ${id}`));
      } else if (rendered.includes(id)) {
        rows.push(row('testid', root, file, lineAt(text, text.indexOf(needle)), `renders ${id}`));
      }
    }
  }
  return rows;
}
