import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FX, run, tmp, proj, BASE } from './helpers.js';

test('exit codes', () => {
  assert.equal(run([FX('good'), '--fail-on', 'info']).code, 0);
  assert.equal(run([FX('broken')]).code, 1);
  assert.equal(run([FX('broken'), '--fail-on', 'none']).code, 0);
});
test('formats and files', () => {
  const o = tmp();
  run([FX('broken'), '--json', join(o, 'r.json'), '--sarif', join(o, 'r.sarif'), '--markdown', join(o, 'r.md')]);
  assert.equal(JSON.parse(readFileSync(join(o, 'r.json'), 'utf8')).counts.critical, 1);
  const s = JSON.parse(readFileSync(join(o, 'r.sarif'), 'utf8')); assert.ok(s.runs[0].results.every((x) => x.locations[0].physicalLocation.artifactLocation.uri === 'package.json'));
  assert.ok(s.runs[0].results.some((x) => x.locations[0].physicalLocation.region.startLine === 5));
  assert.match(readFileSync(join(o, 'r.md'), 'utf8'), /invalid-name/);
});
test('--require and config', () => {
  const d = proj({ ...BASE, main: 'i.js' }, { 'i.js': '' });
  assert.equal(run([d, '--require', 'funding', '--fail-on', 'low']).code, 1);
  writeFileSync(join(d, '.pkg-field-gauge.json'), JSON.stringify({ require: ['funding'], allowlist: [{ rule: 'required-field', reason: 'no funding page', expires: '2099-01-01' }] }));
  assert.equal(run([d, '--fail-on', 'low']).code, 0);
});
test('usage errors', () => {
  assert.equal(run([tmp()]).code, 2);
  assert.equal(run([proj('{ not json')]).code, 2);
  assert.equal(run([proj('[]')]).code, 2);
  assert.equal(run(['--zzz']).code, 2);
});
test('--help, --version, --list-rules', () => {
  assert.match(run(['--help']).out, /--require/);
  assert.match(run(['--version']).out, /^1\./);
  assert.match(run(['--list-rules']).out, /exports-condition-order/);
});
