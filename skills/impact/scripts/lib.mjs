import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|astro|py|rb|go|rs|java|kt|kts|scala|cs|php|swift|ex|exs|erl|clj|dart|lua|sh|bash|zsh|ps1|html|erb|hbs|twig)$/i;
export const CONFIG_EXT = /\.(json|jsonc|ya?ml|toml|ini|cfg|conf|xml|tf|hcl)$|(^|\/)(Dockerfile|Makefile|Procfile)$|\.env\.example$/i;
export const DOC_EXT = /\.(md|mdx|rst|adoc|txt)$/i;
const MAX_BYTES = 1_000_000;

// Secrets never enter the report: .env, .env.local, ... (but .env.example is fine).
const isSecretFile = (p) => /(^|\/)\.env(\.(?!example$)[^/]*)?$/.test(p);

// Every tracked + untracked-but-not-ignored file, so each repo's own
// .gitignore decides what is build output. Falls back to a plain walk.
export function listFiles(root) {
  let rels;
  try {
    rels = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' })
      .split('\n').filter(Boolean);
  } catch {
    rels = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p); else rels.push(path.relative(root, p));
      }
    };
    walk(root);
  }
  return rels
    .filter((r) => !isSecretFile(r) && !r.includes('node_modules/'))
    .map((r) => path.join(root, r))
    .filter((p) => { try { const s = fs.statSync(p); return s.isFile() && s.size <= MAX_BYTES; } catch { return false; } });
}

export function read(file) {
  const text = fs.readFileSync(file, 'utf8');
  // Minified bundles: one enormous line, no signal.
  return text.length > 20_000 && text.split('\n', 3).some((l) => l.length > 5_000) ? '' : text;
}

export function lineAt(text, index) {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

export const lineText = (text, line) => (text.split('\n')[line - 1] ?? '').trim().slice(0, 110);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const wordRe = (name, flags = 'g') => new RegExp(`(?<![A-Za-z0-9_$])${esc(name)}(?![A-Za-z0-9_$])`, flags);
export const literalRe = (s, flags = 'g') => new RegExp(esc(s), flags);

// Common test-file conventions across ecosystems.
const TEST_PATH = /(^|\/)(e2e|cypress|playwright|tests?|__tests__|spec|specs|integration)\//i;
const TEST_NAME = /(\.(test|spec|e2e|cy)\.[a-z]+$)|(_test\.(go|py|rb|exs?)$)|((^|\/)test_[^/]+\.py$)|(Tests?\.(cs|java|kt|swift)$)|(_spec\.rb$)/i;
export function kindOf(rel) {
  if (/(^|\/)(e2e|cypress|playwright)\//i.test(rel) || /\.(e2e|cy)\.[a-z]+$/i.test(rel)) return 'e2e';
  if (TEST_PATH.test(rel) || TEST_NAME.test(rel)) return 'test';
  return 'code';
}

export function row(layer, root, file, line, detail) {
  const rel = path.relative(root, file);
  return { layer, file: rel, line, kind: kindOf(rel), detail };
}
