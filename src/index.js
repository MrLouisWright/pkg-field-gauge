import { readFileSync, existsSync, statSync, readdirSync, openSync, readSync, closeSync } from 'node:fs';
import { join, posix, extname, relative } from 'node:path';
import { builtinModules } from 'node:module';
import { globToRe } from './glob.js';
import { buildReport, UsageError } from './core.js';

export * from './core.js';
export { globToRe };

export const RULES = {
  'invalid-name': { severity: 'critical', title: 'name is missing or not a valid npm package name' },
  'invalid-version': { severity: 'high', title: 'version is missing or not valid SemVer' },
  'entry-missing': { severity: 'high', title: 'main/module/types/bin/browser points at a file that does not exist' },
  'exports-target-missing': { severity: 'high', title: 'An exports target does not exist' },
  'exports-invalid': { severity: 'high', title: 'exports is malformed (relative ./ targets, subpaths vs conditions)' },
  'not-in-files': { severity: 'high', title: 'An entry point is not included by "files", so it will not be published' },
  'format-mismatch': { severity: 'medium', title: 'require/import target has the wrong module format for its extension and "type"' },
  'exports-condition-order': { severity: 'medium', title: '"types" must be the first condition and "default" the last' },
  'types-not-exported': { severity: 'medium', title: 'types exist but exports["."] has no "types" condition' },
  'main-not-exported': { severity: 'medium', title: 'main is not reachable through exports["."]' },
  'bin-no-shebang': { severity: 'medium', title: 'bin file has no #! shebang' },
  'side-effects-invalid': { severity: 'medium', title: 'sideEffects is not a boolean or array of globs, or would drop CSS' },
  'repository-missing': { severity: 'medium', title: 'No repository field' },
  'license-missing': { severity: 'medium', title: 'No license field' },
  'field-type': { severity: 'medium', title: 'Field has the wrong type' },
  'repository-mismatch': { severity: 'low', title: 'repository does not match the git remote or is malformed' },
  'files-entry-unmatched': { severity: 'low', title: 'A "files" entry matches nothing' },
  'keywords-missing': { severity: 'low', title: 'No keywords (hurts npm search)' },
  'description-missing': { severity: 'low', title: 'No description' },
  'license-invalid': { severity: 'low', title: 'license is not a valid SPDX expression' },
  'deprecated-field': { severity: 'low', title: 'Deprecated or non-standard field' },
  'required-field': { severity: 'low', title: 'A field required by your config is missing' },
  'package-json-not-exported': { severity: 'info', title: 'exports hides ./package.json from tools' },
  'engines-missing': { severity: 'info', title: 'No engines.node' },
  'homepage-missing': { severity: 'info', title: 'No homepage or bugs URL' },
};

const SPDX_COMMON = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'AGPL-3.0-only', 'AGPL-3.0-or-later', 'MPL-2.0', 'Unlicense', 'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'BlueOak-1.0.0', 'Zlib', 'BSL-1.0', 'EPL-2.0', 'EPL-1.0', 'Artistic-2.0', 'WTFPL', 'Python-2.0', 'MIT-0', 'UPL-1.0', 'EUPL-1.2', 'GPL-2.0', 'GPL-3.0', 'LGPL-2.1', 'LGPL-3.0', 'AGPL-3.0', 'GPL-2.0+', 'GPL-3.0+', 'LGPL-2.1+', 'LGPL-3.0+', 'BSD-4-Clause', 'CDDL-1.0', 'OFL-1.1', 'PostgreSQL', 'X11', 'NCSA', 'AFL-3.0', 'MS-PL', 'Unicode-DFS-2016', 'CC-BY-3.0', 'CC0', 'Hippocratic-2.1', 'SSPL-1.0', 'BUSL-1.1', 'Elastic-2.0']);
export function validLicense(l) {
  if (/^(UNLICENSED|SEE LICENSE IN .+)$/.test(l)) return true;
  const toks = String(l).replace(/[()]/g, ' ').split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  let expectId = true;
  for (const t of toks) { if (expectId) { if (!(SPDX_COMMON.has(t) || /^LicenseRef-[\w.-]+$/.test(t) || /^[A-Za-z0-9][\w.+-]*-\d[\w.+-]*$/.test(t) && !/\s/.test(t))) return false; expectId = false; } else { if (t === 'WITH') { expectId = true; continue; } if (t !== 'AND' && t !== 'OR') return false; expectId = true; } }
  return !expectId;
}

export function validName(n) {
  const errs = [];
  if (typeof n !== 'string' || !n) return ['missing'];
  if (n.length > 214) errs.push('longer than 214 characters');
  if (n !== n.toLowerCase()) errs.push('contains uppercase letters');
  if (/^[._]/.test(n)) errs.push('starts with . or _');
  if (n.trim() !== n) errs.push('has leading/trailing spaces');
  const m = /^(?:@([^/]+)\/)?([^/]+)$/.exec(n);
  if (!m) errs.push('is not "name" or "@scope/name"');
  else if (encodeURIComponent(m[2]) !== m[2] || (m[1] && encodeURIComponent(m[1]) !== m[1])) errs.push('contains characters that are not URL-safe');
  if (/[~'!()*]/.test(n.split('/').pop())) errs.push("contains ~'!()*");
  if (builtinModules.includes(n) || ['node_modules', 'favicon.ico'].includes(n)) errs.push('is a reserved/core module name');
  return errs;
}
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const norm = (p) => posix.normalize(String(p).replace(/\\/g, '/')).replace(/^\.\//, '').replace(/\/$/, '');
function exists(dir, p) { try { return statSync(join(dir, p)).isFile(); } catch { return false; } }
/** Resolve a CommonJS-style entry (main): exact, +ext, /index. */
export function resolveEntry(dir, p) {
  const n = norm(p);
  for (const c of [n, `${n}.js`, `${n}.json`, `${n}.node`, `${n}/index.js`, `${n}/index.json`]) if (exists(dir, c)) return c;
  return null;
}

/** Walk an exports value. Calls visit({ subpath, conditions, target }) for each string target. */
export function walkExports(exp, visit, problems) {
  const isCond = (k) => !k.startsWith('.');
  const top = typeof exp === 'string' || Array.isArray(exp) || exp === null ? { '.': exp } : exp;
  if (typeof top !== 'object' || top === null) { problems.push('exports must be a string, array or object'); return; }
  const keys = Object.keys(top);
  const sub = keys.filter((k) => k.startsWith('.')); const cond = keys.filter(isCond);
  let map = top;
  if (sub.length && cond.length) { problems.push(`exports mixes subpaths (${sub[0]}) and conditions (${cond[0]}) at the top level`); return; }
  if (!sub.length) map = { '.': top };
  for (const [subpath, v] of Object.entries(map)) {
    if (subpath !== '.' && !subpath.startsWith('./')) problems.push(`subpath "${subpath}" must start with "./"`);
    const rec = (val, conds) => {
      if (val === null) return;
      if (typeof val === 'string') { visit({ subpath, conditions: conds, target: val }); return; }
      if (Array.isArray(val)) { for (const x of val) rec(x, conds); return; }
      if (typeof val === 'object') {
        const ks = Object.keys(val);
        if (ks.some((k) => k.startsWith('.'))) problems.push(`"${subpath}" nests subpaths inside conditions`);
        visit({ subpath, conditions: conds, order: ks });
        for (const k of ks) rec(val[k], [...conds, k]);
        return;
      }
      problems.push(`"${subpath}" has a ${typeof val} target`);
    };
    rec(v, []);
  }
}

function patternExists(dir, target) {
  // "./dist/*.js" -> any file matching
  const re = globToRe(norm(target).replace(/\*/g, '**'));
  const base = norm(target).split('*')[0].replace(/[^/]*$/, '');
  const walk = (d, depth) => { if (depth > 8) return false; let ents; try { ents = readdirSync(join(dir, d), { withFileTypes: true }); } catch { return false; } for (const e of ents) { const r = d ? `${d}/${e.name}` : e.name; if (e.isDirectory() && e.name !== 'node_modules') { if (walk(r, depth + 1)) return true; } else if (re.test(r)) return true; } return false; };
  return walk(base.replace(/\/$/, ''), 0);
}

/** origin URL of the git repo containing dir. Only trusted when dir is the repo root, or repository.directory says where the package lives. */
function gitRemote(dir, directory) {
  let d = dir;
  for (let i = 0; i < 8; i++) {
    const cfg = join(d, '.git', 'config');
    if (existsSync(cfg)) {
      if (d !== dir && !(directory && posix.normalize(relative(d, dir).split('\\').join('/')) === norm(directory))) return null;
      const m = /\[remote "origin"\][^[]*?url\s*=\s*(\S+)/.exec(readFileSync(cfg, 'utf8')); return m ? m[1] : null;
    }
    const up = join(d, '..'); if (up === d) break; d = up;
  }
  return null;
}
const repoSlug = (u) => { const m = /github\.com[:/]+([^/]+)\/([^/#]+?)(?:\.git)?\/?$/i.exec(String(u || '')) || /^(?:github:)?([\w.-]+)\/([\w.-]+)$/.exec(String(u || '')); return m ? `${m[1]}/${m[2]}`.toLowerCase() : null; };

function filesCovers(files, p) {
  const n = norm(p);
  if (/^(package\.json|readme(\..*)?|licen[cs]e(\..*)?|copying(\..*)?)$/i.test(n)) return true;
  return files.some((f) => { const x = norm(String(f).replace(/^!/, '')); if (String(f).startsWith('!')) return false; return n === x || n.startsWith(x + '/') || globToRe(x).test(n) || globToRe(x + '/**').test(n); }) && !files.some((f) => String(f).startsWith('!') && globToRe(norm(f.slice(1))).test(n));
}

export function analyze(dir, opts = {}) {
  const pj = join(dir, 'package.json');
  if (!existsSync(pj)) throw new UsageError(`No package.json in ${dir}`);
  let text = readFileSync(pj, 'utf8'); let pkg;
  try { pkg = JSON.parse(text); } catch (e) { throw new UsageError(`package.json is not valid JSON: ${e.message}`); }
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw new UsageError('package.json must be an object');
  const lines = text.split('\n');
  const lineOf = (key) => { const i = lines.findIndex((l) => l.includes(`"${key}"`)); return i === -1 ? undefined : i + 1; };
  const findings = [];
  const add = (rule, subject, message, fix, key) => findings.push({ rule, severity: RULES[rule].severity, file: 'package.json', line: key ? lineOf(key) : undefined, subject, message, fix });
  const isPrivate = pkg.private === true;
  const esm = pkg.type === 'module';

  const nameErrs = validName(pkg.name);
  if (nameErrs.length && !(isPrivate && nameErrs[0] === 'missing')) add('invalid-name', 'name', nameErrs[0] === 'missing' ? 'package.json has no "name"' : `name "${pkg.name}" ${nameErrs.join(', ')}`, 'Use a lowercase, URL-safe name (optionally @scope/name).', 'name');
  if (!isPrivate || pkg.version !== undefined) { if (typeof pkg.version !== 'string' || !SEMVER.test(pkg.version)) add('invalid-version', 'version', pkg.version === undefined ? 'package.json has no "version"' : `version "${pkg.version}" is not valid SemVer`, 'Use MAJOR.MINOR.PATCH, e.g. "1.0.0".', 'version'); }

  // types of fields
  const types = { name: 'string', version: 'string', description: 'string', keywords: 'array', main: 'string', module: 'string', types: 'string', typings: 'string', files: 'array', license: 'string', type: 'string', private: 'boolean', engines: 'object', scripts: 'object', dependencies: 'object', devDependencies: 'object', peerDependencies: 'object', optionalDependencies: 'object', publishConfig: 'object', workspaces: 'array|object', bin: 'string|object', repository: 'string|object', bugs: 'string|object', homepage: 'string', author: 'string|object', funding: 'string|object|array', sideEffects: 'boolean|array' };
  const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
  for (const [k, want] of Object.entries(types)) if (k in pkg && !want.split('|').includes(typeOf(pkg[k]))) add(k === 'sideEffects' ? 'side-effects-invalid' : 'field-type', k, `"${k}" is ${typeOf(pkg[k])}, expected ${want.replace(/\|/g, ' or ')}`, `Fix the type of "${k}".`, k);
  if (pkg.type !== undefined && !['module', 'commonjs'].includes(pkg.type)) add('field-type', 'type', `"type" is "${pkg.type}"; only "module" or "commonjs" are valid`, 'Use "module" or "commonjs".', 'type');

  // entries
  const entries = []; // { field, path }
  const check1 = (field, p, key = field) => {
    if (typeof p !== 'string') return;
    const r = field === 'main' || field === 'browser' ? resolveEntry(dir, p) : exists(dir, norm(p)) ? norm(p) : null;
    if (!r) add('entry-missing', `${field}:${p}`, `"${field}": "${p}" does not exist`, `Build first or fix the path${opts.hint ? ` (${opts.hint})` : ''}.`, key);
    else entries.push({ field, path: r });
  };
  check1('main', pkg.main); check1('module', pkg.module);
  if (typeof pkg.browser === 'string') check1('browser', pkg.browser);
  else if (pkg.browser && typeof pkg.browser === 'object') for (const [k, v] of Object.entries(pkg.browser)) if (typeof v === 'string' && v.startsWith('.')) check1('browser', v, 'browser'); else void k;
  check1('types', pkg.types); check1('typings', pkg.typings, 'typings');
  if (!pkg.main && !pkg.exports && !pkg.bin && !isPrivate && !resolveEntry(dir, 'index.js') && !pkg.types) add('entry-missing', 'main:index.js', 'no "main"/"exports"/"bin", and the default index.js does not exist', 'Add "exports" (and "main") pointing at your entry file.', 'name');
  const bins = typeof pkg.bin === 'string' ? { [String(pkg.name || '').split('/').pop()]: pkg.bin } : (pkg.bin && typeof pkg.bin === 'object' ? pkg.bin : {});
  for (const [b, p] of Object.entries(bins)) {
    if (!exists(dir, norm(p))) { add('entry-missing', `bin:${b}`, `bin "${b}" → "${p}" does not exist`, 'Fix the path or build first.', 'bin'); continue; }
    entries.push({ field: 'bin', path: norm(p) });
    const fd = openSync(join(dir, norm(p)), 'r'); const buf = Buffer.alloc(2); readSync(fd, buf, 0, 2, 0); closeSync(fd);
    if (buf.toString() !== '#!' && /\.(c|m)?js$|^[^.]+$/.test(p)) add('bin-no-shebang', `bin:${b}`, `bin "${b}" (${p}) has no "#!/usr/bin/env node" line`, 'Add "#!/usr/bin/env node" as the first line, or npm will not run it on Unix.', 'bin');
  }

  // exports
  if (pkg.exports !== undefined) {
    const problems = []; const dot = { types: false, targets: [] }; const visited = [];
    walkExports(pkg.exports, (v) => {
      if (v.order) {
        const o = v.order; const ti = o.indexOf('types'); const di = o.indexOf('default');
        if (ti > 0) add('exports-condition-order', `exports:${v.subpath}`, `exports["${v.subpath}"]${v.conditions.length ? '.' + v.conditions.join('.') : ''}: "types" is condition #${ti + 1}; TypeScript only sees it when it comes first`, 'Move "types" to the top of the object.', 'exports');
        if (di !== -1 && di !== o.length - 1) add('exports-condition-order', `exports:${v.subpath}`, `exports["${v.subpath}"]${v.conditions.length ? '.' + v.conditions.join('.') : ''}: "default" is not the last condition, so the conditions after it never match`, 'Move "default" to the end.', 'exports');
        return;
      }
      visited.push(v);
      const t = v.target;
      if (!t.startsWith('./')) { problems.push(`target "${t}" for "${v.subpath}" must start with "./"`); return; }
      if (/(^|\/)(\.\.|node_modules)(\/|$)/.test(t.slice(2))) problems.push(`target "${t}" may not contain ".." or node_modules`);
      if (v.subpath === '.') { dot.targets.push(norm(t)); if (v.conditions.includes('types')) dot.types = true; }
      if (t.includes('*')) { if (!patternExists(dir, t)) add('exports-target-missing', `exports:${v.subpath}`, `exports["${v.subpath}"] pattern "${t}" matches no file`, 'Build first or fix the pattern.', 'exports'); else entries.push({ field: 'exports', path: norm(t), pattern: true }); return; }
      if (t.endsWith('/')) return;
      if (!exists(dir, norm(t))) { add('exports-target-missing', `exports:${v.subpath}`, `exports["${v.subpath}"]${v.conditions.length ? ` (${v.conditions.join(' → ')})` : ''} → "${t}" does not exist`, 'Build first or fix the path.', 'exports'); return; }
      entries.push({ field: 'exports', path: norm(t) });
      const ext = extname(t); const cond = v.conditions[v.conditions.length - 1];
      if (cond === 'require' && (ext === '.mjs' || (ext === '.js' && esm))) add('format-mismatch', `exports:${v.subpath}`, `exports["${v.subpath}"].require → "${t}" is ESM (${ext === '.mjs' ? '.mjs' : '"type": "module"'})`, 'Point "require" at a .cjs build (or drop the condition if you only ship ESM).', 'exports');
      if (cond === 'import' && (ext === '.cjs' || (ext === '.js' && !esm))) add('format-mismatch', `exports:${v.subpath}`, `exports["${v.subpath}"].import → "${t}" is CommonJS (${ext === '.cjs' ? '.cjs' : 'no "type": "module"'})`, 'Point "import" at an .mjs/ESM build, or set "type": "module".', 'exports');
      if (v.conditions.includes('types') && !/\.d\.[cm]?ts$/.test(t)) add('format-mismatch', `exports:${v.subpath}`, `"types" condition → "${t}" is not a .d.ts file`, 'Point it at the declaration file.', 'exports');
    }, problems);
    for (const p of problems) add('exports-invalid', 'exports', `exports: ${p}`, 'See https://nodejs.org/api/packages.html#package-entry-points', 'exports');
    const hasDot = visited.some((v) => v.subpath === '.');
    const typesFile = pkg.types || pkg.typings;
    if (hasDot && typesFile && !dot.types && !dot.targets.some((t) => /\.d\.[cm]?ts$/.test(t))) {
      const sib = dot.targets.map((t) => t.replace(/\.(c|m)?js$/, '.d.$1ts')).some((t) => exists(dir, t));
      if (!sib) add('types-not-exported', 'exports:.', `"types": "${typesFile}" is ignored under moduleResolution node16/bundler because exports["."] has no "types" condition`, `Add "types": "./${norm(typesFile)}" as the first condition of exports["."].`, 'exports');
    }
    if (hasDot && pkg.main && resolveEntry(dir, pkg.main) && !dot.targets.includes(resolveEntry(dir, pkg.main))) add('main-not-exported', 'main', `"main" (${pkg.main}) is not one of the exports["."] targets (${dot.targets.join(', ') || 'none'}); old and new resolvers load different files`, 'Make "main" match the require/default target of exports["."].', 'main');
    if (!problems.some((p) => p.includes('mixes')) && !visited.some((v) => v.subpath === './package.json') && !Object.keys(typeof pkg.exports === 'object' && pkg.exports ? pkg.exports : {}).some((k) => k.includes('*') && globToRe(norm(k).replace(/\*/g, '**')).test('package.json'))) add('package-json-not-exported', 'exports:./package.json', 'exports does not include "./package.json"; tools that read it via require() fail', 'Add "./package.json": "./package.json".', 'exports');
  }

  // files
  if (Array.isArray(pkg.files)) {
    const seenPaths = new Set();
    for (const e of entries) if (e.field !== 'main' && e.field !== 'bin' && !seenPaths.has(e.path) && seenPaths.add(e.path) && !filesCovers(pkg.files, e.pattern ? e.path.split('*')[0] + 'x' : e.path)) add('not-in-files', `files:${e.path}`, `${e.field} target "${e.path}" is not included by "files", so it will be missing from the published package`, `Add "${e.path.split('/')[0]}" to "files".`, 'files');
    for (const f of pkg.files) {
      if (typeof f !== 'string') continue;
      const x = norm(f.replace(/^!/, ''));
      if (f.startsWith('!')) continue;
      const ok = existsSync(join(dir, x)) || (/[*?{]/.test(x) && patternExists(dir, './' + x));
      if (!ok) add('files-entry-unmatched', `files:${f}`, `"files" entry "${f}" matches nothing`, 'Remove it, or build first.', 'files');
    }
  }

  // metadata
  if (!isPrivate) {
    if (!pkg.description) add('description-missing', 'description', 'no "description"', 'Add a one-line description (shown in npm search).', 'name');
    if (!Array.isArray(pkg.keywords) || !pkg.keywords.length) add('keywords-missing', 'keywords', 'no "keywords"', 'Add 5–10 keywords people would search for.', 'name');
    if (pkg.license === undefined && pkg.licence === undefined && !pkg.licenses) add('license-missing', 'license', 'no "license"', 'Add an SPDX id, e.g. "MIT".', 'name');
    else if (typeof pkg.license === 'string' && !validLicense(pkg.license)) add('license-invalid', 'license', `license "${pkg.license}" is not a valid SPDX expression`, 'Use an SPDX id or expression (https://spdx.org/licenses/).', 'license');
    if (!pkg.repository) add('repository-missing', 'repository', 'no "repository" (npm provenance and the npm page link need it)', 'Add "repository": { "type": "git", "url": "git+https://github.com/<owner>/<repo>.git" }.', 'name');
    else {
      const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository.url;
      if (!url) add('repository-mismatch', 'repository', 'repository has no "url"', 'Add the git URL.', 'repository');
      else {
        const remote = gitRemote(dir, typeof pkg.repository === 'object' ? pkg.repository.directory : undefined);
        const a = repoSlug(url); const b = repoSlug(remote);
        if (a && b && a !== b) add('repository-mismatch', 'repository', `repository points at ${a} but the git remote origin is ${b}`, `Use the actual repository (${b}); provenance publishing fails on a mismatch.`, 'repository');
        if (typeof pkg.repository === 'string' && !/^((github|gitlab|bitbucket|gist):)?[\w.-]+\/[\w.-]+$/.test(url) && !/^(git\+)?(https?|ssh|git):\/\//.test(url) && !/^git@/.test(url)) add('repository-mismatch', 'repository', `repository "${url}" is neither a URL nor an "owner/repo" shorthand`, 'Use "git+https://github.com/<owner>/<repo>.git".', 'repository');
        if (typeof pkg.repository === 'object' && pkg.repository.url && !/^(git\+)?(https?|ssh|git):\/\//.test(pkg.repository.url) && !/^git@/.test(pkg.repository.url)) add('repository-mismatch', 'repository', `repository.url "${pkg.repository.url}" is not a full git URL`, 'Use "git+https://github.com/<owner>/<repo>.git".', 'repository');
      }
    }
    if (!pkg.engines?.node) add('engines-missing', 'engines', 'no "engines.node"', 'Declare the supported Node.js range, e.g. ">=18".', 'name');
    if (!pkg.homepage && !pkg.bugs) add('homepage-missing', 'homepage', 'no "homepage" or "bugs"', 'Add them so users can find docs and report issues.', 'name');
  }
  for (const [k, why] of [['preferGlobal', 'ignored since npm 5'], ['engineStrict', 'removed in npm 3'], ['jsnext:main', 'superseded by "module"/"exports"'], ['licenses', 'use "license" (SPDX)'], ['licence', 'misspelt; npm reads "license"'], ['typings', 'prefer "types"']]) if (k in pkg) add('deprecated-field', k, `"${k}": ${why}`, `Remove "${k}"${k === 'typings' ? ' and use "types"' : ''}.`, k);
  for (const f of opts.require || []) { const v = f.split('.').reduce((o, k) => (o == null ? o : o[k]), pkg); if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) add('required-field', f, `required field "${f}" is missing`, `Add "${f}".`); }

  // sideEffects
  if (pkg.sideEffects === false) {
    const hasCss = (() => { const walk = (d, depth) => { if (depth > 5) return false; let ents; try { ents = readdirSync(join(dir, d), { withFileTypes: true }); } catch { return false; } for (const e of ents) { if (e.name === 'node_modules' || e.name.startsWith('.')) continue; const r = d ? `${d}/${e.name}` : e.name; if (e.isDirectory()) { if (walk(r, depth + 1)) return true; } else if (/\.(css|scss|sass|less)$/.test(e.name) && (!Array.isArray(pkg.files) || filesCovers(pkg.files, r))) return true; } return false; }; return walk('', 0); })();
    if (hasCss) add('side-effects-invalid', 'sideEffects', '"sideEffects": false but the package ships CSS; bundlers will drop `import "./styles.css"`', 'Use "sideEffects": ["*.css"].', 'sideEffects');
  } else if (Array.isArray(pkg.sideEffects)) for (const g of pkg.sideEffects) if (typeof g !== 'string') add('side-effects-invalid', 'sideEffects', 'sideEffects array must contain only strings', 'Use glob strings.', 'sideEffects');
  return { pkg, findings };
}

export function check(dir, opts = {}, config = {}, configFile) {
  const { pkg, findings } = analyze(dir, { require: [...(config.require || []), ...(opts.require || [])] });
  const tool = { name: 'pkg-field-gauge', version: opts.toolVersion || '1.0.0', rules: RULES, emoji: '📦', defaultFile: 'package.json' };
  return buildReport(tool, `${pkg.name || 'package'}${pkg.version ? '@' + pkg.version : ''}`, findings, config, { now: opts.now, configFile, summaryLine: `${pkg.type === 'module' ? 'ESM' : 'CommonJS'} package${pkg.private ? ' (private)' : ''}; ${pkg.exports ? 'exports' : 'no exports'}, ${Object.keys(typeof pkg.bin === 'object' && pkg.bin ? pkg.bin : pkg.bin ? { x: 1 } : {}).length} bin(s), ${Array.isArray(pkg.files) ? `files: ${pkg.files.length} entr${pkg.files.length === 1 ? 'y' : 'ies'}` : 'no files list'}` });
}
