// node --test skills/impact/tests
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, 'fixture');
const run = (...args) => execFileSync('node', [path.join(here, '..', 'scripts', 'run.mjs'), ...args, '--root', fixture], { encoding: 'utf8' });

// Written at runtime so no secret-looking file is ever committed.
const envFile = path.join(fixture, '.env');
before(() => fs.writeFileSync(envFile, 'ORDERS_SECRET=orders-must-never-appear\n'));
after(() => fs.rmSync(envFile, { force: true }));

test('table: schema objects, code, workflow, docs; never .env', () => {
  const out = run('orders');
  assert.match(out, /adapters: text, sql, workflow/);
  assert.match(out, /V1__init\.sql:\d+\s+defines table orders/);
  assert.match(out, /V2__views\.sql:\d+\s+policy orders_owner on orders/);
  assert.match(out, /view open_orders uses orders/);
  assert.match(out, /app\/orders\.py:\d+/);
  assert.match(out, /README\.md:\d+\s+mentions it/);
  // The workflow reads open_orders, a view on orders: reported one hop out, once.
  assert.match(out, /"Nightly export" › node "Read open orders" \(postgres\) via open_orders/);
  assert.doesNotMatch(out, /## Config/, 'workflow exports must not repeat in the config layer');
  assert.doesNotMatch(out, /\.env/);
  assert.doesNotMatch(out, /old_fn/, 'dropped function must not be reported');
});

test('column: only the latest definition counts', () => {
  const out = run('orders.status');
  assert.match(out, /view open_orders uses orders\.status/);
  // V1 order_total read status; V2 replaced it without status.
  assert.doesNotMatch(out, /function order_total/);
  assert.match(out, /app\/orders\.py:\d+/);
});

test('file target: importers in any language', () => {
  const out = run('app/orders.py');
  assert.match(out, /app\/report\.py:1/);
  assert.match(out, /tests\/test_orders\.py:1 \[test\]/);
  assert.match(out, /Tests touching it: 1 file/);
});

test('test id: rendered and selected', () => {
  const out = run('save-order');
  assert.match(out, /ui\/SaveOrder\.vue:\d+\s+renders save-order/);
  assert.match(out, /cypress\/e2e\/order\.cy\.js:\d+ \[e2e\]\s+selects save-order/);
});

test('unknown name says nothing references it', () => {
  assert.match(run('no_such_thing_anywhere'), /Nothing references no_such_thing_anywhere/);
});
