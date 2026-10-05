import { read, wordRe, row } from './lib.mjs';

// Adapter: exported workflow files (n8n shape: { name, nodes: [{ name, type, parameters }] }).
// Other pipeline config (CI, compose, schedulers) is covered by the text layer.
export function workflowRefs(root, files, target, via) {
  const parts = target.toLowerCase().split('.');
  const rows = [];
  const exports = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    let wf;
    try { wf = JSON.parse(read(file)); } catch { continue; }
    if (!Array.isArray(wf?.nodes) || !wf.nodes.every((n) => n && typeof n.type === 'string')) continue;
    exports.push(file);
    for (const node of wf.nodes) {
      const params = JSON.stringify(node.parameters ?? {});
      if (parts.every((p) => wordRe(p, 'i').test(params))) {
        rows.push(row('workflow', root, file, 1, `"${wf.name ?? '?'}" › node "${node.name}" (${String(node.type).split('.').pop()})${via ? ` via ${via}` : ''}`));
      }
    }
  }
  return { rows, exports };
}
