#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mainCli, check, RULES, splitList, formatHtml } from '../src/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
mainCli({
  name: 'pkg-field-gauge', version: pkg.version, configKey: 'pkgFieldGauge', rules: RULES,
  tagline: 'validate package.json fields before you publish',
  usage: 'Usage: pkg-field-gauge [dir] [options]',
  help: `Fields
      --require <fields>    Extra required fields (comma-separated, dotted paths ok: funding,author)
Tarball and types
      --pack                Lint the files \`npm pack --dry-run\` would publish instead of the folder
      --no-types            Skip the per-mode type resolution checks (node10, node16-cjs, node16-esm, bundler)
Report
  -f html / --html <file>  Self-contained HTML report page
Engines checks live in engines-gauge; README checks in readme-gauge.
`,
  formats: { html: (r, o) => formatHtml(r, o) },
  options: { require: { type: 'string', multiple: true }, pack: { type: 'boolean' }, 'no-types': { type: 'boolean' }, html: { type: 'string' } },
  run: async ({ dir, values: o, config, configFile }) => check(dir, { require: splitList(o.require), pack: o.pack || config.pack, types: o['no-types'] ? false : undefined, toolVersion: pkg.version }, config, configFile),
});
