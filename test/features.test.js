import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { check, checkPackage, resolveTypes, resolveExports, formatHtml, packedFiles, RULES } from '../src/index.js';
import { FX, proj, BASE, run, tmp } from './helpers.js';

const rules = (r) => r.findings.map((f) => f.rule).sort();
const only = (pkg, files) => rules(check(proj({ ...BASE, ...pkg }, files)));
const PJ = { './package.json': './package.json' };

test('no engines checks (engines-gauge owns them)', () => {
  assert.ok(!Object.keys(RULES).some((r) => r.includes('engines')));
  const { engines, ...noEngines } = BASE;
  assert.deepEqual(rules(check(proj({ ...noEngines, main: 'i.js' }, { 'i.js': '' }))), []);
  assert.deepEqual(rules(check(proj({ ...BASE, engines: 'bogus', main: 'i.js' }, { 'i.js': '' }))), []);
});

test('resolveExports follows condition order, arrays and patterns', () => {
  const exp = { '.': { import: { types: './a.d.ts', default: './a.js' }, require: './a.cjs' }, './u/*': './dist/u/*.js' };
  assert.equal(resolveExports(exp, '.', ['types', 'import', 'default']), './a.d.ts');
  assert.equal(resolveExports(exp, '.', ['require', 'default']), './a.cjs');
  assert.equal(resolveExports(exp, './u/x', ['default']), './dist/u/x.js');
  assert.equal(resolveExports('./i.js', '.', ['default']), './i.js');
  assert.equal(resolveExports(exp, './nope', ['default']), null);
});

test('types per resolution mode: false ESM (masquerading), unresolved, node10 subpath', () => {
  // dual package with a single ESM .d.ts → require side "masquerades as ESM"
  const fe = only({ type: 'module', main: './d/i.cjs', types: './d/i.d.ts', exports: { '.': { types: './d/i.d.ts', import: './d/i.js', require: './d/i.cjs' }, ...PJ } }, { 'd/i.js': '', 'd/i.cjs': '', 'd/i.d.ts': '' });
  assert.deepEqual(fe, ['types-false-esm']);
  // fixed with a .d.cts for require
  assert.deepEqual(only({ type: 'module', main: './d/i.cjs', types: './d/i.d.ts', exports: { '.': { import: { types: './d/i.d.ts', default: './d/i.js' }, require: { types: './d/i.d.cts', default: './d/i.cjs' } }, ...PJ } }, { 'd/i.js': '', 'd/i.cjs': '', 'd/i.d.ts': '', 'd/i.d.cts': '' }), []);
  // import branch has types, require branch has none
  const un = check(proj({ ...BASE, type: 'module', main: './i.cjs', types: './i.d.ts', exports: { '.': { import: { types: './i.d.ts', default: './i.js' }, require: './i.cjs' }, ...PJ } }, { 'i.js': '', 'i.cjs': '', 'i.d.ts': '' }));
  assert.deepEqual(rules(un), ['types-unresolved']);
  assert.match(un.findings[0].message, /node16-cjs/);
  // subpath export: node10 ignores exports, so no types there
  const sub = only({ main: './i.js', types: './i.d.ts', exports: { '.': { types: './i.d.ts', default: './i.js' }, './extra': { types: './lib/extra.d.ts', default: './lib/extra.js' }, ...PJ } }, { 'i.js': '', 'i.d.ts': '', 'lib/extra.js': '', 'lib/extra.d.ts': '' });
  assert.deepEqual(sub, ['types-node10-subpath']);
  const tv = only({ main: './i.js', types: './i.d.ts', typesVersions: { '*': { extra: ['lib/extra.d.ts'] } }, exports: { '.': { types: './i.d.ts', default: './i.js' }, './extra': { types: './lib/extra.d.ts', default: './lib/extra.js' }, ...PJ } }, { 'i.js': '', 'i.d.ts': '', 'lib/extra.js': '', 'lib/extra.d.ts': '' });
  assert.deepEqual(tv, []);
  // no types shipped at all: nothing to check
  assert.deepEqual(resolveTypes(tmp(), { main: 'i.js' }), []);
  assert.deepEqual(only({ main: 'i.js', exports: { '.': './i.js', ...PJ } }, { 'i.js': '' }), []);
});

test('--no-types / types:false disables the resolution checks', () => {
  const d = proj({ ...BASE, type: 'module', main: './i.cjs', types: './i.d.ts', exports: { '.': { types: './i.d.ts', import: './i.js', require: './i.cjs' }, ...PJ } }, { 'i.js': '', 'i.cjs': '', 'i.d.ts': '' });
  assert.deepEqual(rules(check(d, { types: false })), []);
});

test('tarball mode: lints what npm pack would publish', () => {
  const d = proj({ ...BASE, main: './dist/i.js', exports: { '.': './dist/i.js', ...PJ } }, { 'dist/i.js': 'x', '.npmignore': 'dist/\n' });
  const packed = packedFiles(d);
  assert.ok(packed.files.includes('package.json')); assert.ok(!packed.files.includes('dist/i.js'));
  const r = check(d, { pack: true });
  assert.deepEqual([...new Set(rules(r))], ['not-in-tarball']);
  assert.match(r.summaryLine, /tarball: \d+ files/);
  assert.deepEqual(rules(check(d)), []);
  const cli = run([d, '--pack', '-f', 'json']);
  assert.equal(cli.code, 1, cli.err);
});

test('checkPackage: per-package API for monorepo-gauge', () => {
  const d = proj({ name: 'Bad Name', version: 'x', main: 'nope.js' });
  const r = checkPackage(d);
  assert.equal(r.name, 'Bad Name'); assert.equal(r.private, false);
  assert.ok(r.findings.some((f) => f.rule === 'invalid-name' && f.severity === 'critical'));
  assert.deepEqual([...new Set(checkPackage(d, { rules: ['invalid-version'] }).findings.map((f) => f.rule))], ['invalid-version']);
  assert.ok(!checkPackage(d, { skip: ['invalid-name'] }).findings.some((f) => f.rule === 'invalid-name'));
  assert.deepEqual(checkPackage(FX('good')).findings, []);
});

test('HTML report (format and file)', () => {
  const html = formatHtml(check(FX('broken')), { failOn: 'high' });
  assert.match(html, /^<!doctype html>/); assert.match(html, /<table>/); assert.match(html, /invalid-name/);
  assert.doesNotMatch(html, /<script/);
  const cli = run([FX('good'), '-f', 'html']);
  assert.equal(cli.code, 0); assert.match(cli.out, /Everything checked out/);
  const out = join(tmp(), 'r.html');
  run([FX('broken'), '--html', out, '--fail-on', 'none']);
  assert.ok(existsSync(out)); assert.match(readFileSync(out, 'utf8'), /&lt;|<td>/);
});
