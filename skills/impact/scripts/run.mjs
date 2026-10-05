#!/usr/bin/env node
// Usage: node run.mjs <target> [--root <repo>]
//   target: a symbol, a file path, a table / function / view, table.column, or a test id.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { listFiles } from './lib.mjs';
import { tsAvailable, symbolRefs, fileImporters } from './ts-refs.mjs';
import { migrationChains, sqlRefs } from './sql-refs.mjs';
import { workflowRefs } from './workflow-refs.mjs';
import { testidsIn, testidRefs } from './testid-refs.mjs';
import { textRefs, fileMatchers } from './text-refs.mjs';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const showAll = args.includes('--all') && !!args.splice(args.indexOf('--all'), 1);
const PER_SECTION = 25;
let root = flag('--root');
if (!root) {
  try { root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(); } catch { root = process.cwd(); }
}
root = path.resolve(root);
const target = args[0];
if (!target) {
  console.error('usage: run.mjs <target> [--root <repo>]');
  process.exit(2);
}

const files = listFiles(root);
const ts = tsAvailable(root);
const chains = migrationChains(files);
const rows = [];
const notes = [];
const adapters = ['text'];
const abs = path.resolve(root, target);
const isFile = fs.existsSync(abs) && fs.statSync(abs).isFile();
let textSpec = { terms: [target] };
let dependents = [];
const excludeFromText = new Set();

if (isFile) {
  textSpec = { matchers: fileMatchers(path.relative(root, abs)) };
  excludeFromText.add(abs);
  if (ts && /\.[cm]?[jt]sx?$/.test(abs)) {
    adapters.push('typescript');
    rows.push(...fileImporters(ts, root, target));
  }
  const ids = testidsIn(fs.readFileSync(abs, 'utf8'));
  if (ids.length) {
    adapters.push('testid');
    notes.push(`test ids rendered in this file: ${ids.join(', ')}`);
    rows.push(...testidRefs(root, files, ids).filter((r) => r.detail.startsWith('selects')));
  }
} else {
  if (ts && /^[A-Za-z_$][\w$]*$/.test(target)) {
    const t = symbolRefs(ts, root, target);
    if (t.declarations) {
      adapters.push('typescript');
      if (t.declarations > 1) notes.push(`${t.declarations} TypeScript declarations share this name; references for all are listed`);
      rows.push(...t.rows);
    }
  }
  if (chains.length && /^\w+(\.\w+)?$/.test(target)) {
    const s = sqlRefs(root, chains, target);
    if (s.found || s.rows.length) {
      adapters.push('sql');
      notes.push(`SQL: ${s.migrations} migration file(s) in ${chains.map((c) => path.relative(root, c.dir) || '.').join(', ')}; latest definition of each object only, superseded ones skipped`);
      rows.push(...s.rows);
      dependents = s.dependents;
      for (const c of chains) for (const f of c.files) excludeFromText.add(f);
      if (target.includes('.')) textSpec = { terms: target.split('.') };
    }
  }
  const w = workflowRefs(root, files, target);
  for (const f of w.exports) excludeFromText.add(f);
  for (const dep of dependents) w.rows.push(...workflowRefs(root, files, dep, dep).rows);
  if (w.rows.length) {
    adapters.push('workflow');
    notes.push(`workflows: read ${w.exports.length} exported workflow file(s) in the repo; a live instance may be ahead of them`);
    rows.push(...w.rows);
  }
  if (dependents.length) notes.push(`one hop: callers of ${dependents.join(', ')} are listed "via" that object`);
  // Only a test id if some component actually renders it.
  const t = testidRefs(root, files, [target]);
  if (t.some((r) => r.detail.startsWith('renders'))) {
    adapters.push('testid');
    rows.push(...t);
  }
}

const precise = new Set(rows.map((r) => `${r.file}:${r.line}`));
rows.push(...textRefs(root, files, textSpec, precise, excludeFromText));
for (const dep of dependents) {
  for (const r of textRefs(root, files, { terms: [dep] }, precise, excludeFromText)) {
    if (r.layer === 'docs') continue;
    rows.push({ ...r, layer: 'via', detail: `via ${dep}: ${r.detail}` });
  }
}

// One line per (file, detail); line numbers merged.
function collapse(group) {
  const byKey = new Map();
  for (const r of group) {
    const key = `${r.file}\0${r.detail}`;
    const e = byKey.get(key) ?? { ...r, lines: new Set() };
    e.lines.add(r.line);
    byKey.set(key, e);
  }
  return [...byKey.values()];
}

const SECTIONS = [
  ['TS', 'TypeScript (type-aware)'],
  ['SQL', 'Database schema'],
  ['workflow', 'Workflow exports'],
  ['testid', 'Test ids'],
  ['via', 'One hop: callers of dependent functions/views'],
  ['text', 'Text matches (unverified: same-name collisions possible)'],
  ['config', 'Config'],
  ['docs', 'Docs'],
];
console.log(`# Impact: ${target}`);
console.log(`root ${root} · ${files.length} files · adapters: ${adapters.join(', ')}\n`);
for (const n of notes) console.log(`- ${n}`);
if (notes.length) console.log('');
for (const [layer, title] of SECTIONS) {
  const group = collapse(rows.filter((r) => r.layer === layer));
  if (!group.length) continue;
  const fileCount = new Set(group.map((e) => e.file)).size;
  console.log(`## ${title} (${fileCount} file${fileCount === 1 ? '' : 's'})`);
  // Tests first inside a section, then code; capped unless --all.
  group.sort((a, b) => (a.kind === 'code') - (b.kind === 'code') || a.file.localeCompare(b.file));
  const shown = showAll ? group : group.slice(0, PER_SECTION);
  for (const e of shown) {
    const tag = e.kind !== 'code' ? ` [${e.kind}]` : '';
    console.log(`- ${e.file}:${[...e.lines].sort((a, b) => a - b).join(',')}${tag}  ${e.detail}`);
  }
  if (shown.length < group.length) console.log(`- … ${group.length - shown.length} more (rerun with --all)`);
  console.log('');
}
const testFiles = new Set(rows.filter((r) => r.kind !== 'code' && r.layer !== 'docs').map((r) => r.file));
if (!rows.length) console.log(`Nothing references ${target} in ${files.length} files.`);
else console.log(testFiles.size
  ? `Tests touching it: ${testFiles.size} file(s).`
  : 'NO TEST COVERS THIS: no test file references it.');
