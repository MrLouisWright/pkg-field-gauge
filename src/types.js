// Type resolution per TypeScript module-resolution mode (in the spirit of @arethetypeswrong/cli).
import { statSync } from 'node:fs';
import { join, posix } from 'node:path';

export const MODES = {
  node10: null, // ignores "exports"
  'node16-cjs': ['types', 'require', 'node', 'default'],
  'node16-esm': ['types', 'import', 'node', 'default'],
  bundler: ['types', 'import', 'default'],
};
const norm = (p) => posix.normalize(String(p).replace(/\\/g, '/')).replace(/^\.\//, '');
const isFile = (dir, p) => { try { return statSync(join(dir, p)).isFile(); } catch { return false; } };

/** Resolve exports[subpath] for a list of conditions (first match wins, in object key order). */
export function resolveExports(exp, subpath, conditions) {
  if (exp == null) return null;
  const top = typeof exp === 'string' || Array.isArray(exp) || !Object.keys(exp).some((k) => k.startsWith('.')) ? { '.': exp } : exp;
  let val = top[subpath]; let star = null;
  if (val === undefined) {
    for (const k of Object.keys(top).filter((x) => x.includes('*')).sort((a, b) => b.length - a.length)) {
      const [pre, post] = k.split('*');
      if (subpath.startsWith(pre) && subpath.endsWith(post) && subpath.length >= pre.length + post.length) { val = top[k]; star = subpath.slice(pre.length, subpath.length - post.length); break; }
    }
  }
  const rec = (v) => {
    if (v == null) return null;
    if (typeof v === 'string') return star != null ? v.replace(/\*/g, star) : v;
    if (Array.isArray(v)) { for (const x of v) { const r = rec(x); if (r) return r; } return null; }
    for (const [k, x] of Object.entries(v)) if (conditions.includes(k)) { const r = rec(x); if (r) return r; }
    return null;
  };
  return rec(val);
}

const dtsFor = (js) => js.replace(/\.mjs$/, '.d.mts').replace(/\.cjs$/, '.d.cts').replace(/\.jsx?$/, '.d.ts');
const isDts = (p) => /\.d\.[cm]?ts$/.test(p);
/** Module format TypeScript assigns to a declaration (or JS) file. */
export function formatOf(file, pkgType) {
  if (/\.(d\.)?mts$|\.mjs$/.test(file)) return 'esm';
  if (/\.(d\.)?cts$|\.cjs$/.test(file)) return 'cjs';
  return pkgType === 'module' ? 'esm' : 'cjs';
}

/**
 * For every exported subpath and each resolution mode, find the types file TypeScript would load
 * and compare its module format with the JavaScript file Node/bundlers would load.
 * @param {string} dir package directory
 * @param {object} pkg parsed package.json
 * @param {{ fileExists?: (p: string) => boolean }} [opts]  e.g. restrict to the packed tarball's files
 * @returns {{ subpath: string, mode: string, types: string|null, js: string|null, typesFormat?: string, jsFormat?: string, problem?: 'unresolved'|'false-esm'|'false-cjs'|'node10-subpath' }[]}
 */
export function resolveTypes(dir, pkg, opts = {}) {
  const has = opts.fileExists || ((p) => isFile(dir, p));
  const shipsTypes = !!(pkg.types || pkg.typings) || JSON.stringify(pkg.exports || {}).match(/\.d\.[cm]?ts|"types"/);
  if (!shipsTypes) return [];
  const exp = pkg.exports;
  const subpaths = exp == null ? ['.'] : (typeof exp === 'object' && !Array.isArray(exp) && Object.keys(exp).some((k) => k.startsWith('.')) ? Object.keys(exp).filter((k) => !k.includes('*') && k !== './package.json' && !/\.(json|css)$/.test(k)) : ['.']);
  const out = [];
  for (const sp of subpaths) {
    for (const [mode, conds] of Object.entries(MODES)) {
      let types = null; let js = null;
      if (!conds) {
        if (sp === '.') {
          const t = pkg.types || pkg.typings; const main = pkg.main || 'index.js';
          js = has(norm(main)) ? norm(main) : has(norm(main) + '.js') ? norm(main) + '.js' : null;
          types = t && has(norm(t)) ? norm(t) : js && has(dtsFor(js)) ? dtsFor(js) : has('index.d.ts') ? 'index.d.ts' : null;
        } else {
          const base = norm(sp);
          types = [`${base}.d.ts`, `${base}/index.d.ts`].find(has) || null;
          js = [`${base}.js`, `${base}/index.js`, base].find(has) || null;
          if (!types) {
            const tv = pkg.typesVersions?.['*']; const key = tv && Object.keys(tv).find((k) => k === base || (k.includes('*') && base.startsWith(k.split('*')[0])));
            if (key) { const target = tv[key][0].replace('*', base.slice(key.split('*')[0].length)); types = [norm(target), `${norm(target)}.d.ts`].find(has) || null; }
          }
          if (!types) { out.push({ subpath: sp, mode, types: null, js, problem: 'node10-subpath' }); continue; }
        }
      } else {
        const t = resolveExports(exp, sp, conds);
        const jsTarget = resolveExports(exp, sp, conds.filter((c) => c !== 'types'));
        js = jsTarget && !isDts(jsTarget) ? norm(jsTarget) : null;
        if (t && isDts(t)) types = has(norm(t)) ? norm(t) : null;
        else if (t) types = has(dtsFor(norm(t))) ? dtsFor(norm(t)) : null;
        if (!types && sp === '.' && exp == null) { const tt = pkg.types || pkg.typings; types = tt && has(norm(tt)) ? norm(tt) : null; }
        if (!t && !jsTarget) continue; // subpath not available under these conditions
      }
      const r = { subpath: sp, mode, types, js };
      if (!types) r.problem = 'unresolved';
      else if (js && mode !== 'node10') {
        r.typesFormat = formatOf(types, pkg.type); r.jsFormat = formatOf(js, pkg.type);
        if (r.typesFormat === 'esm' && r.jsFormat === 'cjs') r.problem = 'false-esm';
        else if (r.typesFormat === 'cjs' && r.jsFormat === 'esm' && mode !== 'bundler') r.problem = 'false-cjs';
      }
      out.push(r);
    }
  }
  return out;
}
