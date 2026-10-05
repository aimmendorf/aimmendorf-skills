import path from 'node:path';
import { read, lineAt, wordRe, row } from './lib.mjs';

// Adapter: any directory whose .sql files form an ordered migration chain
// (supabase/migrations, db/migrate, migrations/, prisma/migrations/*/, ...).
export function migrationChains(files) {
  const byDir = new Map();
  for (const f of files) {
    if (!f.endsWith('.sql')) continue;
    // prisma-style: migrations/<stamp>_<name>/migration.sql chains on the parent.
    const dir = path.basename(f) === 'migration.sql' ? path.dirname(path.dirname(f)) : path.dirname(f);
    byDir.set(dir, [...(byDir.get(dir) ?? []), f]);
  }
  // Ordered = versioned names: 00111_x.sql, 20240101_x.sql, V3__x.sql, or prisma's stamped dirs.
  const versioned = (f) => /^(V?\d)/i.test(path.basename(path.basename(f) === 'migration.sql' ? path.dirname(f) : f));
  return [...byDir.entries()]
    .map(([dir, fs]) => ({ dir, files: fs.filter(versioned).sort() }))
    .filter((c) => c.files.length >= 2);
}

// Split on top-level semicolons, honouring quotes, comments and $tag$ bodies.
function statements(sql) {
  const out = [];
  let i = 0, start = 0, dollar = null;
  while (i < sql.length) {
    if (dollar) {
      if (sql.startsWith(dollar, i)) { i += dollar.length; dollar = null; } else i++;
      continue;
    }
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') { const nl = sql.indexOf('\n', i); i = nl < 0 ? sql.length : nl; continue; }
    if (c === '/' && sql[i + 1] === '*') { const e = sql.indexOf('*/', i + 2); i = e < 0 ? sql.length : e + 2; continue; }
    if (c === "'") {
      i++;
      while (i < sql.length && !(sql[i] === "'" && sql[i + 1] !== "'")) i += sql[i] === "'" ? 2 : 1;
      i++;
      continue;
    }
    if (c === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i, i + 64));
      if (m) { dollar = m[0]; i += dollar.length; continue; }
    }
    if (c === ';') { out.push({ text: sql.slice(start, i), offset: start }); start = i + 1; }
    i++;
  }
  if (sql.slice(start).trim()) out.push({ text: sql.slice(start), offset: start });
  return out;
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
const norm = (n) => n.replace(/[`"[\]]/g, '').replace(/^(public|dbo|main)\./i, '').toLowerCase();
const NAME = String.raw`((?:[\`"[]?[\w]+[\`"\]]?)(?:\.[\`"[]?[\w]+[\`"\]]?)?)`;

// Identity of the object a statement defines. A later statement with the same
// key supersedes the earlier one; table/type keys accumulate (CREATE + ALTERs).
function classify(t) {
  t = t.replace(/\s+/g, ' ').trim();
  let m;
  const r = (re) => (m = new RegExp(re, 'i').exec(t));
  const q = (s) => s.replace(/[`"[\]]/g, '');
  if (r(String.raw`^create (?:or replace )?(?:function|procedure) ${NAME}`)) return { key: `function:${norm(m[1])}`, obj: norm(m[1]), kind: 'function' };
  if (r(String.raw`^drop (?:function|procedure) (?:if exists )?${NAME}`)) return { key: `function:${norm(m[1])}`, drop: true };
  if (r(String.raw`^create (?:or replace )?(?:materialized )?view (?:if not exists )?${NAME}`)) return { key: `view:${norm(m[1])}`, obj: norm(m[1]), kind: 'view' };
  if (r(String.raw`^drop (?:materialized )?view (?:if exists )?${NAME}`)) return { key: `view:${norm(m[1])}`, drop: true };
  if (r(String.raw`^create (?:temp(?:orary)? |unlogged )?table (?:if not exists )?${NAME}`)) return { key: `table:${norm(m[1])}`, obj: norm(m[1]), kind: 'table', accumulate: true };
  if (r(String.raw`^alter table (?:if exists )?(?:only )?${NAME}`)) return { key: `table:${norm(m[1])}`, obj: norm(m[1]), kind: 'table', accumulate: true };
  if (r(String.raw`^drop table (?:if exists )?${NAME}`)) return { key: `table:${norm(m[1])}`, drop: true };
  if (r(String.raw`^(?:create|alter) policy (\S+) on ${NAME}`)) return { key: `policy:${norm(m[2])}:${q(m[1])}`, obj: norm(m[2]), kind: `policy ${q(m[1])}`, attached: true };
  if (r(String.raw`^drop policy (?:if exists )?(\S+) on ${NAME}`)) return { key: `policy:${norm(m[2])}:${q(m[1])}`, drop: true };
  if (r(String.raw`^create (?:or replace )?(?:constraint )?trigger (?:if not exists )?(\S+) .*? on ${NAME}`)) return { key: `trigger:${norm(m[2])}:${q(m[1])}`, obj: norm(m[2]), kind: `trigger ${q(m[1])}`, attached: true };
  if (r(String.raw`^drop trigger (?:if exists )?(\S+)(?: on ${NAME})?`)) return { key: `trigger:${norm(m[2] ?? '')}:${q(m[1])}`, drop: true };
  if (r(String.raw`^create (?:unique )?index (?:concurrently )?(?:if not exists )?(\S+)? ?on (?:only )?${NAME}`)) return { key: `index:${q(m[1] ?? t)}`, obj: norm(m[2]), kind: `index ${q(m[1] ?? '')}`.trim(), attached: true };
  if (r(String.raw`^(?:create|alter) type ${NAME}`)) return { key: `type:${norm(m[1])}`, obj: norm(m[1]), kind: 'type', accumulate: true };
  if (r(String.raw`^select cron\.schedule\s*\(\s*'([^']+)'`)) return { key: `cron:${m[1]}`, obj: m[1], kind: `scheduled job '${m[1]}'` };
  if (r(String.raw`^select cron\.unschedule\s*\(\s*'([^']+)'`)) return { key: `cron:${m[1]}`, drop: true };
  // Grants, comments and one-shot data statements are not live dependents.
  return null;
}

function liveState(chain) {
  const live = new Map();
  for (const file of chain.files) {
    const sql = read(file);
    for (const st of statements(sql)) {
      const c = classify(stripComments(st.text));
      if (!c) continue;
      if (c.drop) {
        for (const k of [...live.keys()]) if (k === c.key || (c.key.startsWith('trigger::') && k.endsWith(c.key.slice(8)))) live.delete(k);
        continue;
      }
      const lead = st.offset + (/^(?:[ \t]*(?:--[^\n]*)?\r?\n)*[ \t]*/.exec(st.text)?.[0].length ?? 0);
      const entry = { ...c, file, line: lineAt(sql, lead), body: stripComments(st.text) };
      live.set(c.key, c.accumulate ? [...(live.get(c.key) ?? []), entry] : [entry]);
    }
  }
  return live;
}

// target: object name, or table.column
export function sqlRefs(root, chains, target) {
  const [a, b] = target.toLowerCase().split('.');
  const owner = a;
  const column = b ?? null;
  const rows = [];
  const dependents = new Set();
  let found = false;
  for (const chain of chains) {
    for (const entries of liveState(chain).values()) {
      for (const e of entries) {
        const own = e.obj === owner;
        if (own) found = true;
        if (own && !column) {
          rows.push(row('SQL', root, e.file, e.line, e.attached ? `${e.kind} on ${e.obj}` : `defines ${e.kind} ${e.obj}`));
        } else if (own ? wordRe(column, 'i').test(e.body) : (wordRe(owner, 'i').test(e.body) && (!column || wordRe(column, 'i').test(e.body)))) {
          rows.push(row('SQL', root, e.file, e.line, `${e.kind} ${e.obj} uses ${target}`));
          // Callable objects carry the impact one hop further: whoever calls them.
          if (!own && (e.kind === 'function' || e.kind === 'view')) dependents.add(e.obj);
        }
      }
    }
  }
  return { rows, found, dependents: [...dependents], migrations: chains.reduce((n, c) => n + c.files.length, 0) };
}
