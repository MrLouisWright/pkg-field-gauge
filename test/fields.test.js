import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { check, validName, validLicense, resolveEntry, walkExports } from '../src/index.js';
import { FX, proj, BASE } from './helpers.js';

const rules = (r) => r.findings.map((f) => f.rule).sort();
const only = (pkg, files) => rules(check(proj({ ...BASE, ...pkg }, files)));

test('good fixture is clean', () => { assert.deepEqual(check(FX('good')).findings, []); });
test('broken fixture: rule coverage', () => {
  const r = check(FX('broken'));
  const got = new Set(rules(r));
  for (const x of ['invalid-name', 'invalid-version', 'entry-missing', 'exports-target-missing', 'exports-invalid', 'not-in-files', 'exports-condition-order', 'format-mismatch', 'bin-no-shebang', 'description-missing', 'keywords-missing', 'files-entry-unmatched', 'license-invalid', 'deprecated-field', 'repository-mismatch', 'homepage-missing', 'package-json-not-exported']) assert.ok(got.has(x), x);
  assert.equal(r.findings.filter((f) => f.rule === 'not-in-files' && f.subject === 'files:lib/index.d.ts').length, 1, 'deduped');
  assert.ok(r.findings.every((f) => f.file === 'package.json' && f.line > 0));
});
test('name and version rules', () => {
  assert.deepEqual(validName('ok-name'), []); assert.deepEqual(validName('@scope/ok'), []);
  assert.ok(validName('Bad').length); assert.ok(validName('.dot').length); assert.ok(validName('fs').length); assert.ok(validName('a b').length); assert.ok(validName('x'.repeat(215)).length); assert.ok(validName('@s/a/b').length);
  assert.deepEqual(only({ version: '1.0.0-rc.1+build.5' }, { 'index.js': '' }), []);
  assert.deepEqual(only({ version: 'v1.0.0' }, { 'index.js': '' }), ['invalid-version']);
  assert.deepEqual(rules(check(proj({ private: true }))), [], 'private packages need neither name nor version');
});
test('main resolution like Node', () => {
  const d = proj(BASE, { 'lib/index.js': '', 'x.json': '{}' });
  assert.equal(resolveEntry(d, './lib'), 'lib/index.js'); assert.equal(resolveEntry(d, 'x'), 'x.json'); assert.equal(resolveEntry(d, 'nope'), null);
  assert.deepEqual(only({ main: 'lib' }, { 'lib/index.js': '' }), []);
  assert.deepEqual(only({}, {}), ['entry-missing'], 'no main/exports and no index.js');
});
test('exports: main-not-exported, types-not-exported, sibling .d.ts ok', () => {
  assert.deepEqual(only({ main: 'old.js', exports: { '.': './new.js', './package.json': './package.json' } }, { 'old.js': '', 'new.js': '' }), ['main-not-exported']);
  assert.deepEqual(only({ main: 'i.js', types: 'types/i.d.ts', exports: { '.': { require: './i.js' }, './package.json': './package.json' } }, { 'i.js': '', 'types/i.d.ts': '' }), ['types-not-exported']);
  assert.deepEqual(only({ main: 'i.js', types: 'i.d.ts', exports: { '.': './i.js', './package.json': './package.json' } }, { 'i.js': '', 'i.d.ts': '' }), []);
  assert.deepEqual(only({ exports: { '.': { types: './i.js', default: './i.js' }, './package.json': './package.json' } }, { 'i.js': '' }), ['format-mismatch']);
});
test('exports structure problems', () => {
  assert.deepEqual(only({ exports: { '.': './i.js', import: './i.js' } }, { 'i.js': '' }), ['exports-invalid']);
  assert.deepEqual(only({ exports: { '.': './a/../../x.js', './package.json': './package.json' } }, {}).includes('exports-invalid'), true);
  assert.deepEqual(only({ exports: './i.js' }, { 'i.js': '' }), ['package-json-not-exported']);
  assert.deepEqual(only({ exports: { './*': './*' } }, { 'i.js': '' }), [], './* exposes package.json');
  assert.deepEqual(only({ exports: { '.': './i.js', './feat/*': './src/feat/*.js', './package.json': './package.json' } }, { 'i.js': '' }), ['exports-target-missing']);
  const problems = []; const seen = [];
  walkExports({ '.': [{ import: './a.mjs' }, './a.cjs'] }, (v) => v.target && seen.push(v.target), problems);
  assert.deepEqual(seen, ['./a.mjs', './a.cjs']); assert.deepEqual(problems, []);
});
test('format mismatch in CommonJS packages', () => {
  assert.deepEqual(only({ exports: { '.': { import: './i.js', require: './i.js' }, './package.json': './package.json' } }, { 'i.js': '' }), ['format-mismatch']);
  assert.deepEqual(only({ exports: { '.': { import: './i.mjs', require: './i.js' }, './package.json': './package.json' } }, { 'i.js': '', 'i.mjs': '' }), []);
});
test('files coverage, negation, always-included', () => {
  assert.deepEqual(only({ types: 'types/x.d.ts', main: 'dist/x.js', files: ['dist'] }, { 'dist/x.js': '', 'types/x.d.ts': '' }), ['not-in-files']);
  assert.deepEqual(only({ main: 'dist/x.js', types: 'dist/x.d.ts', files: ['dist/**/*.js', 'dist/*.d.ts', '!dist/test'] }, { 'dist/x.js': '', 'dist/x.d.ts': '' }), []);
  assert.deepEqual(only({ main: 'x.js', files: ['README.md', 'gone/'] }, { 'x.js': '', 'README.md': '' }), ['files-entry-unmatched']);
});
test('bin as string uses the package name; shebang checked', () => {
  assert.deepEqual(only({ bin: 'cli.js' }, { 'cli.js': '#!/usr/bin/env node\n' }), []);
  assert.deepEqual(only({ bin: 'cli.js' }, { 'cli.js': 'x' }), ['bin-no-shebang']);
  assert.deepEqual(only({ bin: { a: 'nope.js' } }, {}), ['entry-missing']);
});
test('license, repository, deprecated, types of fields', () => {
  for (const l of ['MIT', '(MIT OR Apache-2.0)', 'GPL-2.0-only WITH Classpath-exception-2.0', 'LicenseRef-Acme', 'SEE LICENSE IN LICENSE.txt', 'UNLICENSED']) assert.ok(validLicense(l), l);
  for (const l of ['Apache 2', 'MIT OR', 'whatever']) assert.ok(!validLicense(l), l);
  assert.deepEqual(only({ license: undefined }, { 'index.js': '' }), ['license-missing']);
  assert.deepEqual(only({ repository: 'acme/p' }, { 'index.js': '' }), []);
  assert.deepEqual(only({ repository: { url: 'github.com/a/p' } }, { 'index.js': '' }), ['repository-mismatch']);
  assert.deepEqual(only({ typings: 'x.d.ts' }, { 'index.js': '', 'x.d.ts': '' }), ['deprecated-field']);
  assert.deepEqual(only({ keywords: 'a,b' }, { 'index.js': '' }), ['field-type', 'keywords-missing']);
  assert.deepEqual(only({ type: 'esm' }, { 'index.js': '' }), ['field-type']);
});
test('repository vs git remote', () => {
  const d = proj({ ...BASE, main: 'i.js' }, { 'i.js': '', '.git/config': '[remote "origin"]\n\turl = git@github.com:other/repo.git\n' });
  assert.deepEqual(rules(check(d)), ['repository-mismatch']);
  writeFileSync(join(d, '.git/config'), '[remote "origin"]\n\turl = https://github.com/a/p\n');
  assert.deepEqual(rules(check(d)), []);
  // a package nested in another repo is only compared when repository.directory says so
  const outer = proj({ name: 'root', private: true }, { '.git/config': '[remote "origin"]\n\turl = https://github.com/other/mono\n', 'pkgs/p/package.json': JSON.stringify({ ...BASE, main: 'i.js' }), 'pkgs/p/i.js': '' });
  assert.deepEqual(rules(check(join(outer, 'pkgs/p'))), []);
  writeFileSync(join(outer, 'pkgs/p/package.json'), JSON.stringify({ ...BASE, main: 'i.js', repository: { ...BASE.repository, directory: 'pkgs/p' } }));
  assert.deepEqual(rules(check(join(outer, 'pkgs/p'))), ['repository-mismatch']);
});
test('sideEffects', () => {
  assert.deepEqual(only({ main: 'i.js', sideEffects: false }, { 'i.js': '', 'styles/a.css': '' }), ['side-effects-invalid']);
  assert.deepEqual(only({ main: 'i.js', sideEffects: ['*.css'] }, { 'i.js': '', 'styles/a.css': '' }), []);
  assert.deepEqual(only({ main: 'i.js', sideEffects: 'no' }, { 'i.js': '' }), ['side-effects-invalid']);
});
test('required fields from config', () => {
  const d = proj({ ...BASE, main: 'i.js' }, { 'i.js': '' });
  assert.deepEqual(rules(check(d, { require: ['funding', 'engines.node'] })), ['required-field']);
  assert.deepEqual(rules(check(d, {}, { require: ['author'] })), ['required-field']);
});
test('allowlist with expiry', () => {
  const r = check(FX('broken'), { now: new Date('2026-10-14') }, { allowlist: [{ rule: 'exports-condition-order', reason: 'fixing in v2', expires: '2027-01-01' }] });
  assert.ok(!rules(r).includes('exports-condition-order')); assert.equal(r.suppressed.length, 2);
});
